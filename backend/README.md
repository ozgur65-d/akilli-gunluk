# Backend

Bu backend, mevcut frontend'in kullandigi endpointleri saglar:

- `POST /analiz`
- `GET /analizler`
- `GET /health`

## Kurulum

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python app.py
```

Sunucu varsayilan olarak `http://127.0.0.1:5000` adresinde calisir.

Firebase servis hesabi anahtari proje kokundeki `firebase-key.json` dosyasindan okunur.
Farkli bir konum kullanmak icin:

```powershell
$env:FIREBASE_KEY_PATH="C:\path\firebase-key.json"
python app.py
```
