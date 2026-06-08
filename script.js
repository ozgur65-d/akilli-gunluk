// --- GLOBAL DEĞİŞKENLER VE BAŞLATMA ---
const auth = firebase.auth();
const db = firebase.firestore();
let duyguGrafigi; // Grafik objesini saklamak için

// --- HTML ELEMANLARINI SEÇME ---
const authLinks = document.getElementById('auth-links');
const modalBackdrop = document.getElementById('modal-backdrop');
const authModal = document.getElementById('auth-modal');
const startNowBtn = document.getElementById('start-now-btn');

const appContainer = document.getElementById('app-container');
const heroSection = document.querySelector('.hero');

const kaydetButonu = document.getElementById('kaydet-butonu');
const duyguMetniInput = document.getElementById('duygu-metni');

const sonucEtiketi = document.getElementById('sonuc-etiketi');
const sonucSkor = document.getElementById('sonuc-skor');

const kayitListesi = document.getElementById('kayit-listesi');
const ctx = document.getElementById('duyguGrafıgı').getContext('2d');


// --- KİMLİK DOĞRULAMA (AUTH) İŞLEVLERİ ---

// Kullanıcının giriş durumunu dinle ve arayüzü yönet
auth.onAuthStateChanged((user) => {
    if (user) {
        // Kullanıcı giriş yaptıysa
        heroSection.classList.add('hidden');
        appContainer.classList.remove('hidden');
        
        authLinks.innerHTML = `
            <div class="user-profile">
                <span>${user.email}</span>
                <button id="logout-button" class="btn">Çıkış Yap</button>
            </div>
        `;
        document.getElementById('logout-button').addEventListener('click', () => auth.signOut());

        gecmisKayitlariYukle();
    } else {
        // Kullanıcı çıkış yaptıysa
        heroSection.classList.remove('hidden');
        appContainer.classList.add('hidden');

        authLinks.innerHTML = `
            <button id="login-modal-btn" class="btn">Giriş Yap</button>
        `;
        document.getElementById('login-modal-btn').addEventListener('click', () => openAuthModal('login'));
        startNowBtn.addEventListener('click', () => openAuthModal('signup'));
    }
});

// Giriş/Kayıt penceresini (modal) açan fonksiyon
function openAuthModal(view) {
    modalBackdrop.classList.remove('hidden');
    let content = `
        <div class="modal-header">
            <h2 id="modal-title">${view === 'login' ? 'Giriş Yap' : 'Hesap Oluştur'}</h2>
            <button id="modal-close-btn">&times;</button>
        </div>
    `;

    if (view === 'login') {
        content += `
            <input type="email" id="login-email" class="input-field" placeholder="E-posta">
            <input type="password" id="login-password" class="input-field" placeholder="Parola">
            <button id="login-button" class="btn btn-primary">Giriş Yap</button>
            <p>Hesabın yok mu? <a id="show-signup" href="#">Kayıt Ol</a></p>
        `;
    } else {
        content += `
            <input type="email" id="signup-email" class="input-field" placeholder="E-posta">
            <input type="password" id="signup-password" class="input-field" placeholder="Parola (en az 6 karakter)">
            <button id="signup-button" class="btn btn-primary">Kayıt Ol</button>
            <p>Zaten hesabın var mı? <a id="show-login" href="#">Giriş Yap</a></p>
        `;
    }

    authModal.innerHTML = content;
    addModalEventListeners();
}

// Modal penceresindeki butonlara olay dinleyicileri ekleyen fonksiyon
function addModalEventListeners() {
    document.getElementById('modal-close-btn').addEventListener('click', () => modalBackdrop.classList.add('hidden'));
    
    const showSignupLink = document.getElementById('show-signup');
    if (showSignupLink) showSignupLink.addEventListener('click', (e) => { e.preventDefault(); openAuthModal('signup'); });

    const showLoginLink = document.getElementById('show-login');
    if (showLoginLink) showLoginLink.addEventListener('click', (e) => { e.preventDefault(); openAuthModal('login'); });

    const signupButton = document.getElementById('signup-button');
    if(signupButton) signupButton.addEventListener('click', () => {
        const email = document.getElementById('signup-email').value;
        const password = document.getElementById('signup-password').value;
        auth.createUserWithEmailAndPassword(email, password)
            .then(() => modalBackdrop.classList.add('hidden'))
            .catch((error) => alert('Kayıt hatası: ' + error.message));
    });

    const loginButton = document.getElementById('login-button');
    if(loginButton) loginButton.addEventListener('click', () => {
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        auth.signInWithEmailAndPassword(email, password)
            .then(() => modalBackdrop.classList.add('hidden'))
            .catch((error) => alert('Giriş hatası: ' + error.message));
    });
}

// Modal'ın dışına tıklandığında kapatma
modalBackdrop.addEventListener('click', (e) => {
    if (e.target === modalBackdrop) {
        modalBackdrop.classList.add('hidden');
    }
});


// --- UYGULAMA İŞLEVLERİ ---

kaydetButonu.addEventListener('click', analizEtVeKaydet);

// Backend'e analiz isteği gönderen ana fonksiyon
async function analizEtVeKaydet() {
    const user = auth.currentUser;
    if (!user) return;

    const metin = duyguMetniInput.value;
    if (metin.trim() === '') return;

    kaydetButonu.disabled = true;
    kaydetButonu.textContent = 'Analiz Ediliyor...';
    
    try {
        const idToken = await user.getIdToken();
        const response = await fetch('http://127.0.0.1:5000/analiz', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + idToken },
            body: JSON.stringify({ metin: metin })
        });
        if (!response.ok) throw new Error(`Sunucu hatası: ${response.status}`);
        
        const data = await response.json();
        
        sonucEtiketi.textContent = data.etiket || 'Belirsiz';
        sonucSkor.textContent = (data.duygu_skoru || 0).toFixed(2);

        gecmisKayitlariYukle();
        duyguMetniInput.value = '';

    } catch (error) {
        console.error("Analiz veya kaydetme hatası:", error);
        alert("Analiz sırasında bir hata oluştu.");
    } finally {
        kaydetButonu.disabled = false;
        kaydetButonu.textContent = 'Kaydet ve Analiz Et';
    }
}

// Geçmiş kayıtları sunucudan çeken, listeyi ve grafiği güncelleyen fonksiyon
async function gecmisKayitlariYukle() {
    const user = auth.currentUser;
    if (!user) return;

    try {
        const idToken = await user.getIdToken();
        const response = await fetch('http://127.0.0.1:5000/analizler', {
            headers: { 'Authorization': 'Bearer ' + idToken }
        });
        if (!response.ok) throw new Error('Geçmiş kayıtlar yüklenemedi.');
        
        const kayitlar = await response.json();
        
        kayitListesi.innerHTML = '';
        if (kayitlar.length > 0) {
             kayitlar.forEach(kayit => {
                const li = document.createElement('li');
                const tarih = kayit.zaman_damgasi ? new Date(kayit.zaman_damgasi._seconds * 1000).toLocaleString('tr-TR') : 'Tarih yok';
                li.innerHTML = `<strong>${tarih}:</strong> "${kayit.girilen_metin}" <em>(${kayit.etiket} | Skor: ${(kayit.duygu_skoru || 0).toFixed(2)})</em>`;
                kayitListesi.appendChild(li);
            });
            grafigiCiz(kayitlar);
        } else {
            kayitListesi.innerHTML = '<li>Henüz bir kayıt bulunmuyor.</li>';
            if(duyguGrafigi) duyguGrafigi.destroy(); // Eğer kayıt yoksa grafiği temizle
        }

    } catch (error) {
        console.error('Geçmiş kayıtları yüklerken hata:', error);
    }
}

// Gelen verilere göre grafiği çizen fonksiyon
function grafigiCiz(kayitlar) {
    // Grafiği çizebilmek için verileri eskiden yeniye doğru sıralıyoruz
    const reversedKayitlar = [...kayitlar].reverse();

    const etiketler = reversedKayitlar.map(k => k.zaman_damgasi && k.zaman_damgasi._seconds 
        ? new Date(k.zaman_damgasi._seconds * 1000).toLocaleDateString('tr-TR')
        : 'Tarih Yok'
    );
    const skorlar = reversedKayitlar.map(k => k.duygu_skoru);

    // Eğer daha önce bir grafik çizilmişse, onu yok et (üst üste çizimi engellemek için)
    if (duyguGrafigi) {
        duyguGrafigi.destroy();
    }

    duyguGrafigi = new Chart(ctx, {
        type: 'line', // Grafik tipi: Çizgi
        data: {
            labels: etiketler, // X ekseni etiketleri (tarihler)
            datasets: [{
                label: 'Duygu Skoru', // Veri setinin adı
                data: skorlar, // Y ekseni verileri (skorlar)
                borderColor: 'rgba(74, 144, 226, 0.8)',
                backgroundColor: 'rgba(74, 144, 226, 0.1)',
                fill: true,
                tension: 0.4 // Çizgiyi daha yumuşak yapar
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    min: -1, // Y ekseninin en alt sınırı
                    max: 1,  // Y ekseninin en üst sınırı
                    ticks: {
                        // Y eksenindeki sayıları daha anlamlı etiketlere çevirelim
                        callback: function(value) {
                            if (value === 1) return 'Pozitif';
                            if (value === -1) return 'Negatif';
                            if (value === 0) return 'Nötr';
                            return '';
                        }
                    }
                }
            }
        }
    });
}


















