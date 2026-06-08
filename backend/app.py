import datetime as dt
import os
from functools import lru_cache

import firebase_admin
from firebase_admin import auth, credentials, firestore
from flask import Flask, jsonify, request
from flask_cors import CORS


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(BASE_DIR)
DEFAULT_FIREBASE_KEY = os.path.join(PROJECT_ROOT, "firebase-key.json")


def create_app():
    app = Flask(__name__)
    CORS(app, resources={r"/*": {"origins": "*"}})

    initialize_firebase()

    @app.get("/health")
    def health_check():
        return jsonify({"status": "ok"}), 200

    @app.get("/analizler")
    def get_analizler():
        uid = verify_token(request)
        if not uid:
            return jsonify({"hata": "Yetkisiz istek."}), 401

        try:
            analizler_ref = (
                firestore.client()
                .collection("kullanicilar")
                .document(uid)
                .collection("analizler")
                .order_by("zaman_damgasi", direction=firestore.Query.DESCENDING)
            )
            analizler = [serialize_firestore_doc(doc.to_dict()) for doc in analizler_ref.stream()]
            return jsonify(analizler), 200
        except Exception as exc:
            app.logger.exception("Analizler getirilirken hata olustu: %s", exc)
            return jsonify({"hata": "Sunucu hatasi."}), 500

    @app.post("/analiz")
    def analiz_et():
        uid = verify_token(request)
        if not uid:
            return jsonify({"hata": "Yetkisiz istek."}), 401

        payload = request.get_json(silent=True) or {}
        metin = (payload.get("metin") or "").strip()
        if not metin:
            return jsonify({"hata": "Analiz edilecek metin bos olamaz."}), 400

        analiz_sonucu = analyze_sentiment(metin)
        kayit = {
            "girilen_metin": metin,
            "etiket": analiz_sonucu["etiket"],
            "duygu_skoru": analiz_sonucu["duygu_skoru"],
            "zaman_damgasi": dt.datetime.now(dt.timezone.utc),
        }

        try:
            firestore.client().collection("kullanicilar").document(uid).collection("analizler").add(kayit)
        except Exception as exc:
            app.logger.exception("Analiz Firestore'a kaydedilirken hata olustu: %s", exc)
            return jsonify({"hata": "Analiz yapildi fakat kaydedilemedi."}), 500

        return jsonify(serialize_firestore_doc(kayit)), 201

    return app


def initialize_firebase():
    if firebase_admin._apps:
        return

    firebase_key_path = os.environ.get("FIREBASE_KEY_PATH", DEFAULT_FIREBASE_KEY)
    cred = credentials.Certificate(firebase_key_path)
    firebase_admin.initialize_app(cred)


def verify_token(req):
    auth_header = req.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None

    id_token = auth_header.removeprefix("Bearer ").strip()
    if not id_token:
        return None

    try:
        decoded_token = auth.verify_id_token(id_token)
        return decoded_token.get("uid")
    except Exception:
        return None


@lru_cache(maxsize=1)
def get_sentiment_pipeline():
    from transformers import pipeline

    return pipeline(
        "sentiment-analysis",
        model="cardiffnlp/twitter-xlm-roberta-base-sentiment",
        tokenizer="cardiffnlp/twitter-xlm-roberta-base-sentiment",
    )


def analyze_sentiment(text):
    try:
        result = get_sentiment_pipeline()(text[:512])[0]
        label = normalize_label(result.get("label", "neutral"))
        confidence = float(result.get("score", 0))

        if label == "positive":
            return {"etiket": "Pozitif", "duygu_skoru": round(confidence, 4)}
        if label == "negative":
            return {"etiket": "Negatif", "duygu_skoru": round(-confidence, 4)}
        return {"etiket": "Notr", "duygu_skoru": 0.0}
    except Exception:
        return fallback_sentiment(text)


def normalize_label(label):
    label = str(label).lower()
    if label in {"positive", "label_2"}:
        return "positive"
    if label in {"negative", "label_0"}:
        return "negative"
    return "neutral"


def fallback_sentiment(text):
    positive_words = {
        "iyi",
        "guzel",
        "mutlu",
        "harika",
        "sevindim",
        "basarili",
        "keyifli",
        "pozitif",
    }
    negative_words = {
        "kotu",
        "uzgun",
        "mutsuz",
        "berbat",
        "sinirli",
        "korku",
        "kaygi",
        "negatif",
    }

    normalized = text.lower()
    positive_count = sum(1 for word in positive_words if word in normalized)
    negative_count = sum(1 for word in negative_words if word in normalized)
    total = positive_count + negative_count

    if total == 0 or positive_count == negative_count:
        return {"etiket": "Notr", "duygu_skoru": 0.0}

    score = round((positive_count - negative_count) / total, 4)
    return {
        "etiket": "Pozitif" if score > 0 else "Negatif",
        "duygu_skoru": score,
    }


def serialize_firestore_doc(data):
    serialized = dict(data)
    timestamp = serialized.get("zaman_damgasi")
    if isinstance(timestamp, dt.datetime):
        serialized["zaman_damgasi"] = {
            "_seconds": int(timestamp.timestamp()),
            "_nanoseconds": timestamp.microsecond * 1000,
        }
    return serialized


app = create_app()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5000"))
    app.run(host="0.0.0.0", port=port, debug=True)
