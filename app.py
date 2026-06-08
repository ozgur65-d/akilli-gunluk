import os
import firebase_admin
from firebase_admin import credentials, firestore, auth
from flask import Flask, request, jsonify
import datetime
from flask_cors import CORS
from transformers import pipeline

# --- Model Kurulumu ---
print("Çok dilli duygu analizi modeli yükleniyor...")
sentiment_pipeline = pipeline("sentiment-analysis", model="cardiffnlp/twitter-xlm-roberta-base-sentiment")
print("Model başarıyla yüklendi.")
# --- Kurulum Bitiş ---

# --- Firebase Kurulumu ---
if not firebase_admin._apps:
    cred = credentials.Certificate("firebase-key.json")
    firebase_admin.initialize_app(cred)
db = firestore.client()
# --- Kurulum Bitiş ---

app = Flask(__name__)
CORS(app)

def verify_token(request):
    try:
        auth_header = request.headers.get('Authorization')
        if not auth_header: return None
        id_token = auth_header.split(' ').pop()
        decoded_token = auth.verify_id_token(id_token)
        return decoded_token['uid']
    except Exception as e:
        return None

@app.route('/analizler', methods=['GET'])
def get_analizler():
    uid = verify_token(request)
    if not uid: return jsonify({"hata": "Yetkisiz istek."}), 401
    try:
        analizler_ref = db.collection('kullanicilar').document(uid).collection('analizler')
        docs = analizler_ref.stream()
        sonuclar = [doc.to_dict() for doc in docs]
        sonuclar.sort(key=lambda x: x.get('zaman_damgasi'), reverse=True)
        return jsonify(sonuclar), 200
    except Exception as e:
        print(f"Veri getirilirken hata oluştu: {e}")
        return jsonify({"hata": "Sunucu hatası."}), 500

@app.route('/analiz', methods=['POST'])
def analiz_et():
    uid = verify_token(request)
    if not uid: return jsonify({"hata": "Yetkisiz istek."}), 401
    gelen_veri = request.get_json()
    if not gelen_veri or 'metin' not in gelen_veri: return jsonify({"hata": "Eksik parametre."}), 400
    
    analiz_edilecek_metin = gelen_veri['metin']
    
    try:
        sonuclar = sentiment_pipeline(analiz_edilecek_metin)
        ilk_sonuc = sonuclar[0]
        
        print(f"MODEL ÇIKTISI: {ilk_sonuc}")

        etiket = "Nötr"
        # DÜZELTME: Skoru doğrudan modelin güven skorundan alıyoruz
        skor = ilk_sonuc['score']
        
        # Bu model 'Positive', 'Negative', 'Neutral' etiketlerini kullanır
        if ilk_sonuc['label'] == 'Positive':
            etiket = "Pozitif"
            # Skor zaten pozitif, olduğu gibi bırak
        elif ilk_sonuc['label'] == 'Negative':
            etiket = "Negatif"
            # Skoru negatif yapmak için -1 ile çarp
            skor = skor * -1
        else: # Neutral durumu
            skor = 0.0
            
        kaydedilecek_veri = {
            'girilen_metin': analiz_edilecek_metin,
            'etiket': etiket,
            'duygu_skoru': skor, # Artık burası -1.0 ile 1.0 arasında küsuratlı bir değer
            'zaman_damgasi': datetime.datetime.now(datetime.timezone.utc)
        }
    
    except Exception as e:
        print(f"!!! YAPAY ZEKA ANALİZ HATASI: {e}")
        kaydedilecek_veri = {
            'girilen_metin': analiz_edilecek_metin,
            'etiket': 'Analiz Edilemedi',
            'duygu_skoru': 0,
            'zaman_damgasi': datetime.datetime.now(datetime.timezone.utc)
        }
        
    try:
        db.collection('kullanicilar').document(uid).collection('analizler').add(kaydedilecek_veri)
    except Exception as e:
        print(f">>> Firestore'a yazılırken hata oluştu: {e}")

    return jsonify(kaydedilecek_veri)

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)































    




























