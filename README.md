# Siaga Bulukumba 🚨

**Aplikasi Pemantauan Banjir Real-time untuk Kabupaten Bulukumba, Sulawesi Selatan**

Aplikasi berbasis web yang memungkinkan warga melaporkan genangan banjir secara real-time menggunakan GPS dan kamera, dilengkapi validasi otomatis via computer vision (client-side), data cuaca BMKG, serta peta interaktif.

---

## Fitur Utama

| Fitur | Deskripsi |
|-------|-----------|
| 🗺️ **Peta Interaktif** | Peta banjir real-time dengan marker per lokasi, warna marker menunjukkan kedalaman air |
| 📸 **Lapor Banjir** | Form 3 langkah: GPS → Kamera → Input detail (kedalaman + deskripsi) |
| 🤖 **Validasi Vision** | Deteksi genangan air via analisis pixel HSV + cek keaslian foto (client-side, gratis) |
| 📍 **Cek Duplikat** | Otomatis cek laporan dalam radius 50m menggunakan rumus Haversine |
| 🌤️ **Cuaca BMKG** | Data cuaca real-time + prakiraan 3 hari untuk Kel. Terang-Terang, Bulukumba |
| 📊 **Dashboard** | Statistik laporan, rata-rata kedalaman, laporan terbaru |
| 📋 **Daftar Laporan** | Filter & cari laporan, filter berdasarkan status verifikasi & kedalaman |
| 🆘 **Kontak Darurat** | Nomor darurat BPBD, RS, Polres, Damkar, PLN + tips keselamatan banjir |
| 🔄 **Real-time** | Update laporan baru via Socket.IO tanpa refresh halaman |

---

## Arsitektur

```
┌─────────────────────────────────────┐
│          Frontend (React)            │
│  Port 3000                           │
│  ┌────────┐ ┌────────┐ ┌────────┐   │
│  │  Peta  │ │Laporan │ │Dashboard│   │
│  │MapLibre│ │  Form  │ │  BMKG   │   │
│  └────────┘ └────────┘ └────────┘   │
│         ↕ Socket.IO / REST           │
├─────────────────────────────────────┤
│          Backend (Node.js)           │
│  Port 4000                           │
│  ┌────────┐ ┌────────┐ ┌────────┐   │
│  │Express │ │Socket  │ │Better- │   │
│  │  REST  │ │   IO   │ │SQLite3 │   │
│  └────────┘ └────────┘ └────────┘   │
└─────────────────────────────────────┘
```

### Stack Teknologi

**Frontend:**
- React 18, React Bootstrap, Bootstrap 5
- MapLibre GL JS (peta open-source)
- Axios (HTTP client), Socket.IO Client
- Canvas API + HSV analysis (computer vision)
- EXIF Reader (metadata foto)

**Backend:**
- Node.js + Express.js
- SQLite (via better-sqlite3) — tanpa Docker
- Multer (upload file)
- express-rate-limit (rate limiting)
- Socket.IO (real-time)

**Data Eksternal:**
- BMKG REST API (bmkg-restapi.vercel.app)

---

## Alur Pelaporan Banjir

```
STEP 1                       STEP 2                      STEP 3
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│   DETEKSI GPS    │     │   AMBIL FOTO     │     │   INPUT DETAIL   │
│                  │     │                  │     │                  │
│ • Auto-detect    │ ──▶ │ • Buka kamera    │ ──▶ │ • Kedalaman air  │
│   lokasi         │     │   (environment)  │     │   (slider 0-200) │
│ • Akurasi tinggi │     │ • Capture JPEG   │     │ • Deskripsi      │
│ • Timeout 15 det │     │ • Validasi       │     │ • Kirim laporan  │
└──────────────────┘     │   vision (HSV)   │     └──────────────────┘
                          │   otomatis       │
                          │ • Cek duplikat   │
                          │   50m otomatis   │
                          └──────────────────┘
```

### Validasi Otomatis (Client-side)

Setelah foto diambil, 3 validasi berjalan paralel:

1. **💧 Deteksi Genangan Air** — Analisis pixel HSV:
   - Sampling 8000 pixel dari gambar
   - Klasifikasi warna air (biru, keruh, coklat)
   - Rejection logic untuk selfie, vegetasi, gambar digital
   - Confidence score berdasarkan rasio air & clustering

2. **📸 Keaslian Foto** — Cek metadata EXIF:
   - Ada/tidaknya metadata kamera (Make, Model)
   - Real-time check (foto < 1 jam)
   - Resolusi minimal 640x480
   - Analisis variasi warna (tekstur alami vs digital)

3. **🔄 Cek Duplikat** — Haversine distance:
   - Cari laporan dalam radius 50m dari posisi GPS
   - Cegah laporan ganda untuk lokasi yang sama

---

## Cara Install & Jalankan

### Prasyarat
- Node.js >= 18
- NPM >= 9

### 1. Backend

```bash
cd backend
npm install
cp .env .env.local  # edit jika perlu
npm start
```

Backend berjalan di `http://localhost:4000`.

### 2. Frontend

```bash
cd frontend
npm install
npm start
```

Frontend berjalan di `http://localhost:3000`.

### Konfigurasi

Backend (`.env`):
```
PORT=4000
NODE_ENV=development
CORS_ORIGIN=http://localhost:3000
DB_PATH=./flood.db
UPLOAD_MAX_SIZE=10485760
```

Frontend (`.env`):
```
REACT_APP_API_URL=http://localhost:4000
```

---

## API Endpoints

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| `GET` | `/api/reports?page=1&limit=50` | Daftar laporan (paginasi) |
| `GET` | `/api/reports/stats` | Statistik laporan |
| `GET` | `/api/reports/nearby?lat=&lng=&radius=` | Cari laporan terdekat |
| `GET` | `/api/reports/:id` | Detail laporan |
| `POST` | `/api/reports` | Buat laporan baru (multipart) |
| `PATCH` | `/api/reports/:id/verify` | Verifikasi laporan |

### Response Format

```
GET /api/reports?page=1&limit=3
{
  "rows": [ ... ],
  "total": 12,
  "page": 1,
  "limit": 3,
  "pages": 4
}
```

---

## Struktur Project

```
flood-monitor-bulukumba/
├── backend/
│   ├── models/
│   │   └── Report.js         # SQLite ORM, seed data, queries
│   ├── routes/
│   │   └── reports.js        # REST API + file upload
│   ├── server.js             # Express + rate limit + CORS
│   ├── socket.js             # Socket.IO real-time
│   ├── uploads/              # Foto yang diupload
│   ├── package.json
│   └── .env
└── frontend/
    ├── public/
    │   └── index.html
    ├── src/
    │   ├── components/
    │   │   ├── BottomNav.js      # Navigasi bawah
    │   │   ├── CameraCapture.js  # Kamera (getUserMedia)
    │   │   ├── MapView.js        # Peta MapLibre GL
    │   │   ├── Navbar.js         # Navigasi atas
    │   │   └── ReportForm.js     # Form laporan 3 langkah
    │   ├── pages/
    │   │   ├── HomePage.js       # Peta + FAB lapor
    │   │   ├── DashboardPage.js  # Statistik + BMKG
    │   │   ├── ReportsPage.js    # Daftar laporan
    │   │   └── EmergencyPage.js  # Kontak darurat
    │   ├── services/
    │   │   ├── api.js           # Axios instance
    │   │   ├── bmkg.js          # BMKG API client + cache
    │   │   ├── socket.js        # Socket.IO client
    │   │   └── vision.js        # HSV detection + EXIF
    │   ├── App.js
    │   └── index.js
    ├── package.json
    └── .env
```

---

## Keamanan

- **CORS whitelist** — Origin dibatasi via env `CORS_ORIGIN`
- **Rate limiting** — 60 request/menit global, 10 upload/menit
- **File upload validation** — Hanya JPEG/PNG/WebP, maks 10MB
- **No XSS** — Popup peta menggunakan `setDOMContent` (React portal), bukan `innerHTML`
- **No hardcoded secrets** — Semua konfigurasi via env vars

---

## Data Seed

12 laporan awal tersebar di titik-titik strategis Bulukumba:

| Lokasi | Kedalaman | Status |
|--------|-----------|--------|
| Jl. Sam Ratulangi | 35 cm | Terverifikasi |
| Jl. Ahmad Yani | 50 cm | Terverifikasi |
| Jl. Jenderal Sudirman | 20 cm | Terverifikasi |
| Pasar Sentral Bulukumba | 30 cm | Menunggu |
| Kelurahan Caile | 80 cm | Terverifikasi |
| ... dan 7 lokasi lainnya | | |

---

## Pengembangan Selanjutnya

- [ ] Otentikasi admin (verifikasi laporan)
- [ ] Notifikasi push via Web Push API
- [ ] PWA (offline capability)
- [ ] Reverse geocoding nama jalan
- [ ] Riwayat banjir per lokasi
- [ ] Export data ke CSV/GeoJSON

---

## Lisensi

MIT © 2026 — Dibangun untuk mitigasi bencana banjir di Kabupaten Bulukumba.
