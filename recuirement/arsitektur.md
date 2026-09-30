# 🏗️ Dokumen Arsitektur Teknis
## Sinar Harapan Frontdesk & Property Management System (PMS)

---

## Dokumen Kontrol

| Item | Detail |
|---|---|
| Versi | 1.0 — Baseline |
| Terkait | `prd.md`, `design-system.md` |
| Prinsip Desain | Modular monolith, API-first, mobile/tablet-first frontend, keamanan data sensitif sebagai prioritas utama |

---

## 1. Ikhtisar Arsitektur (High-Level Overview)

Sistem dibangun sebagai **modular monolith** dengan pemisahan tegas antara frontend (Flutter) dan backend (Next.js App Router) yang berkomunikasi murni via REST API. Backend berperan sebagai orkestrator yang menghubungkan database, layanan OCR pihak ketiga, gateway WhatsApp, dan storage dokumen.

```
                     ┌────────────────────────────────────────────────────────┐
                     │            FRONTEND: FLUTTER APPLICATION               │
                     │  (Web Desktop / Tablet Kasir Meja Resepsionis)          │
                     │  - Role: Receptionist UI / Manager UI                  │
                     │  - State Management: Riverpod / Bloc                   │
                     │  - Local Cache: Hive / SharedPreferences (offline)     │
                     └──────────────────────────┬───────────────────────────────┘
                                                 │ HTTPS / REST API (JSON)
                                                 │ Authorization: Bearer <JWT>
                                                 ▼
                     ┌────────────────────────────────────────────────────────┐
                     │            BACKEND: NEXT.JS (APP ROUTER)                │
                     │  • Route Handlers (API Endpoints)                       │
                     │  • Middleware: Auth Guard, RBAC, Rate Limiter           │
                     │  • Business Logic Engine & Validation (Zod)             │
                     │  • Cron Scheduler (Trigger Pengingat Check-out)         │
                     │  • Prisma ORM Layer                                     │
                     └───────┬──────────────────┬────────────────────┬─────────┘
                              │                  │                    │
             ┌────────────────┴─────┐            │                    │
             ▼                      ▼            ▼                    ▼
┌──────────────────────┐ ┌───────────────┐ ┌───────────────┐ ┌───────────────┐
│   DATABASE ENGINE     │ │  OCR SERVICE  │ │  WA GATEWAY   │ │ REPORT ENGINE │
│  PostgreSQL (Supabase │ │  Google Cloud │ │ Fonnte/Wablas │ │ ExcelJS /     │
│   / Prisma ORM)       │ │  Vision API   │ │ API + Webhook │ │ @react-pdf    │
└──────────────────────┘ └───────────────┘ └───────────────┘ └───────────────┘
             │
             ▼
┌──────────────────────┐
│  STORAGE               │
│  (Bucket foto dokumen  │
│   identitas: KTP/      │
│   Paspor/SIM, signed   │
│   URL 15 menit)        │
└──────────────────────┘
```

### 1.1 Prinsip Arsitektural

1. **API-first** — semua fungsionalitas frontend dikonsumsi via REST API terdokumentasi, tidak ada logic bisnis di sisi client selain validasi UX (form) dan kalkulasi tampilan sementara.
2. **Stateless backend** — sesi disimpan di JWT, bukan server session, memudahkan horizontal scaling backend di masa depan.
3. **Defense in depth** — validasi berlapis: middleware auth → RBAC guard → validasi skema (Zod) → constraint database.
4. **Graceful degradation** — jika layanan pihak ketiga (OCR/WA Gateway) gagal, alur utama (check-in/check-out) tetap bisa diselesaikan secara manual.
5. **Audit-first** — setiap operasi tulis (create/update/delete) yang berdampak pada data transaksi atau inventaris tercatat ke `activity_logs`.

---

## 2. Arsitektur Frontend (Flutter)

### 2.1 Struktur Folder (Feature-first)

```
lib/
├── main.dart
├── app/
│   ├── router.dart               # GoRouter — role-based routing
│   └── theme.dart                # Design tokens (lihat design-system.md)
├── core/
│   ├── network/                  # Dio client, interceptors (JWT, retry)
│   ├── storage/                  # Hive boxes untuk offline cache
│   ├── constants/
│   └── utils/
├── features/
│   ├── auth/
│   │   ├── data/                 # AuthRepository, AuthApi
│   │   ├── domain/                # Entities, use cases
│   │   └── presentation/          # LoginScreen, AuthController (Riverpod)
│   ├── room_management/
│   │   ├── data/
│   │   ├── domain/
│   │   └── presentation/          # RoomGridScreen, RoomCard, RoomFilterBar
│   ├── reservation/
│   │   ├── data/
│   │   ├── domain/
│   │   └── presentation/          # CheckInModal, OcrScannerWidget, ReservationForm
│   ├── checkout/
│   │   └── presentation/          # CheckOutScreen, InvoicePreview
│   ├── reporting/
│   │   └── presentation/          # ManagerDashboard, ChartsWidgets, ExportButtons
│   └── shared_widgets/            # StatusBadge, AppButton, AppTextField, dsb.
└── generated/                     # Localization, assets
```

### 2.2 State Management
- **Riverpod** (StateNotifier/AsyncNotifier) untuk state per-fitur — dipilih karena testability tinggi dan cocok untuk arsitektur feature-first.
- **Realtime room status:** polling interval 15 detik ke endpoint `GET /api/rooms/status` (opsi upgrade ke WebSocket/Supabase Realtime pada fase berikutnya bila diperlukan latensi lebih rendah).

### 2.3 Offline-Caching Strategy (NFR terkait FR-RES-08)
- Form check-in yang sedang diisi disimpan otomatis ke **Hive local box** setiap perubahan field (debounce 500ms).
- Saat submit gagal karena jaringan terputus, data tersimpan dalam antrian **"pending sync"** dengan indikator visual di UI.
- Background retry setiap 30 detik hingga berhasil terkirim atau resepsionis membatalkan secara manual.
- Foto dokumen identitas (KTP/Paspor/SIM) yang sudah discan disimpan sementara secara lokal (cache) sebelum upload berhasil, untuk mencegah pemindaian ulang.

### 2.4 Modul OCR Multi Jenis Dokumen di Sisi Client
- Resepsionis memilih jenis dokumen (KTP/Paspor/SIM) terlebih dahulu sebelum kamera aktif — dikirim sebagai `documentType` ke backend.
- Kamera diakses via `camera` / `image_picker` package.
- Gambar dikompres (max 1.5MB, resize longest-edge 1600px) sebelum dikirim ke backend agar sesuai batas performa OCR (FR non-fungsional: proses OCR ≤ 3 detik).
- Endpoint: `POST /api/ocr/extract-identity` (multipart/form-data, field `image` + `documentType`) → backend memilih parser (KTP/SIM berbasis label, Paspor berbasis MRZ) lalu meneruskan hasil OCR mentah ke Google Cloud Vision API sebelum diparsing.

### 2.5 Cetak Thermal Printer
- Integrasi via plugin `esc_pos_printer` / `blue_thermal_printer` (Bluetooth/USB) untuk printer 58mm/80mm.
- Format struk dirender sebagai layout ESC/POS command generator terpisah dari layout invoice PDF (dua template berbeda, satu sumber data).

---

## 3. Arsitektur Backend (Next.js App Router)

### 3.1 Struktur Folder

```
app/
├── api/
│   ├── auth/
│   │   ├── login/route.ts
│   │   └── refresh/route.ts
│   ├── rooms/
│   │   ├── route.ts                    # GET (list), POST (create - manager)
│   │   ├── [id]/route.ts               # GET, PATCH, DELETE
│   │   └── status/route.ts             # GET realtime status grid
│   ├── ocr/
│   │   └── extract-identity/route.ts   # POST — proxy ke Google Vision API, dispatch parser per documentType
│   ├── reservations/
│   │   ├── route.ts                    # POST create check-in
│   │   └── [id]/
│   │       ├── route.ts                # GET detail
│   │       └── checkout/route.ts       # POST proses check-out
│   ├── notifications/
│   │   ├── send-reminder/route.ts      # POST manual resend
│   │   └── webhook/route.ts            # POST callback status WA Gateway
│   ├── reports/
│   │   ├── summary/route.ts            # GET KPI dashboard
│   │   ├── transactions/route.ts       # GET tabel rekap + filter
│   │   ├── export-excel/route.ts       # GET generate .xlsx
│   │   └── export-pdf/route.ts         # GET generate .pdf
│   └── audit-logs/route.ts             # GET (manager only)
├── lib/
│   ├── prisma.ts                       # Prisma client singleton
│   ├── auth/
│   │   ├── jwt.ts                      # sign/verify token
│   │   └── rbac.ts                     # middleware guard per role
│   ├── services/
│   │   ├── ocr.service.ts              # Google Vision integration
│   │   ├── whatsapp.service.ts         # Fonnte/Wablas integration
│   │   ├── invoice.service.ts          # generator nomor invoice & kalkulasi
│   │   └── storage.service.ts          # Supabase Storage signed URL
│   ├── validators/                     # Zod schemas per endpoint
│   └── cron/
│       └── checkout-reminder.ts        # scheduler job (setiap 10 menit)
├── middleware.ts                       # Global auth/JWT verification
└── prisma/
    └── schema.prisma
```

### 3.2 Prinsip Desain API

- **Konvensi REST:** noun-based resource paths, HTTP verb menentukan aksi (`GET`, `POST`, `PATCH`, `DELETE`).
- **Format respons konsisten:**
```json
{
  "success": true,
  "data": { ... },
  "meta": { "timestamp": "2026-09-24T10:00:00Z" }
}
```
Error response:
```json
{
  "success": false,
  "error": { "code": "VALIDATION_ERROR", "message": "Format nomor identitas tidak valid untuk jenis dokumen KTP" }
}
```
- **Validasi input:** setiap route handler memvalidasi body/query dengan skema Zod sebelum diteruskan ke business logic layer.
- **Versioning:** MVP menggunakan `/api/...` tanpa versi eksplisit; jika terjadi breaking change di masa depan, gunakan `/api/v2/...`.

### 3.3 Middleware & Keamanan Endpoint

| Layer | Fungsi |
|---|---|
| `middleware.ts` | Verifikasi JWT di header `Authorization: Bearer`, tolak request tanpa token valid pada route `/api/**` kecuali `/api/auth/login` |
| RBAC Guard | Per-route, mengecek `role` di payload JWT terhadap matriks hak akses (lihat `prd.md` §2.3) |
| Rate Limiter | Membatasi percobaan login (maks 5x/menit per IP) untuk mencegah brute-force |
| Request Logger | Mencatat setiap request ke `activity_logs` untuk aksi sensitif (CREATE_ROOM, EDIT_PRICE, CHECK_IN, CHECK_OUT, EXPORT_REPORT) |

### 3.4 Cron Scheduler — Pengingat Check-out (FR-WA-01, FR-WA-02)

```
Job: checkout-reminder
Interval: setiap 10 menit (cron: "*/10 * * * *")
Logic:
  1. Query reservations WHERE actual_check_out_time IS NULL
     AND expected_check_out_time BETWEEN NOW() AND NOW() + 60 minutes
     AND wa_reminder_sent_at IS NULL
  2. Untuk setiap hasil → panggil whatsapp.service.sendReminder(reservation)
  3. Jika sukses → UPDATE wa_reminder_sent_at = NOW()
  4. Jika gagal → log ke activity_logs (action_type: WA_REMINDER_FAILED),
     tersedia untuk resend manual dari UI resepsionis
```
Implementasi: Vercel Cron Jobs / node-cron pada deployment container terpisah (tergantung platform hosting — lihat §6).

### 3.5 Integrasi Google Cloud Vision API (OCR Multi Jenis Dokumen)

```
POST /api/ocr/extract-identity
Request: multipart/form-data { image: File, documentType: "KTP" | "PASSPORT" | "SIM" }

Alur:
1. Terima file gambar dari Flutter (sudah dikompres di client) + jenis dokumen yang dipilih resepsionis
2. Simpan sementara ke storage (bucket: identity-temp)
3. Kirim ke Google Vision API (Document Text Detection) — hasil OCR mentah sama untuk ketiga jenis dokumen
4. Backend dispatch ke parser sesuai documentType (lihat backend.md §8.3 untuk detail lengkap):
   - KTP: regex/pattern matcher berbasis label ("Nama", "Alamat") — NIK pattern 16 digit angka
   - SIM: regex serupa KTP, No. SIM 12-16 digit, tanpa alamat
   - PASSPORT: parsing MRZ (Machine Readable Zone) berbasis posisi karakter tetap (BUKAN regex
     label — paspor tidak punya label field seperti KTP), menghasilkan nomor paspor, nama, dan
     kode kewarganegaraan 3 huruf (ICAO 9303)
5. Kembalikan JSON terstruktur + confidence score ke client
6. Jika confidence rendah (<70%) → flag "perluVerifikasiManual": true

Response (contoh KTP):
{
  "success": true,
  "data": {
    "idType": "KTP",
    "idNumber": "3578xxxxxxxxxxxx",
    "namaLengkap": "BUDI SANTOSO",
    "alamat": "JL. MERDEKA NO. 10, MALANG",
    "nationality": "Indonesia",
    "confidence": 0.92,
    "perluVerifikasiManual": false
  }
}
```
Timeout: 3 detik (sesuai NFR). Jika timeout → response fallback yang mengarahkan client ke mode input manual penuh. Berlaku sama untuk ketiga jenis dokumen — OCR tidak pernah memblokir proses check-in.

### 3.6 Integrasi WhatsApp Gateway (Fonnte/Wablas)

```
Service: whatsapp.service.ts

sendReminder(reservation):
  POST https://api.fonnte.com/send
  Body: { target: phone_whatsapp, message: renderedTemplate }
  → simpan message_id dari response untuk pelacakan status

Webhook (callback dari provider):
POST /api/notifications/webhook
  Body: { message_id, status: "sent"|"delivered"|"read"|"failed" }
  → UPDATE status pengiriman terkait di tabel reservations/log terpisah
```
Retry policy: maksimum 3x percobaan otomatis dengan interval 5 menit jika status `failed`, sebelum diserahkan ke resepsionis untuk resend manual (FR-WA-04).

### 3.7 Report Engine

| Format | Library | Endpoint |
|---|---|---|
| Excel (.xlsx) | ExcelJS | `GET /api/reports/export-excel?startDate=&endDate=` |
| PDF (.pdf) | @react-pdf/renderer | `GET /api/reports/export-pdf?startDate=&endDate=` |

- Kedua endpoint hanya dapat diakses role `MANAGER` (RBAC Guard).
- Setiap pemanggilan endpoint ekspor tercatat di `activity_logs` (action_type: `EXPORT_REPORT`) sesuai FR-REP-05.
- Generasi file dilakukan secara sinkron untuk rentang data ≤ 3 bulan; untuk rentang lebih besar, disiapkan job asinkron dengan notifikasi selesai (roadmap pasca-MVP jika volume data besar).

---

## 4. Skema Database Relasional Lengkap

### 4.1 Entity Relationship Diagram (Deskriptif)

```
users (1) ──< reservations (receptionist_user_id)
rooms (1) ──< reservations (room_id)
guests (1) ──< reservations (guest_id)
users (1) ──< activity_logs (user_id)
```

### 4.2 DDL Lengkap

```sql
-- 1. TABEL PENGGUNA & PERAN
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    role VARCHAR(20) CHECK (role IN ('RECEPTIONIST', 'MANAGER')) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX idx_users_username ON users(username);

-- 2. TABEL MASTER INVENTARIS KAMAR
CREATE TABLE rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_number VARCHAR(10) UNIQUE NOT NULL,
    room_type VARCHAR(50) NOT NULL, -- Standard, Superior, Deluxe, Family
    floor INTEGER NOT NULL,
    base_price_per_night DECIMAL(12, 2) NOT NULL,
    facilities JSONB DEFAULT '[]',
    status VARCHAR(20) CHECK (status IN ('AVAILABLE', 'OCCUPIED', 'DIRTY', 'MAINTENANCE')) DEFAULT 'AVAILABLE',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX idx_rooms_status ON rooms(status);
CREATE INDEX idx_rooms_type_floor ON rooms(room_type, floor);

-- 3. TABEL DATA INDUK TAMU (mendukung KTP/Paspor/SIM — lihat database.md §2.3 untuk detail)
CREATE TABLE guests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_type VARCHAR(20) CHECK (id_type IN ('KTP', 'PASSPORT', 'SIM', 'OTHER')) NOT NULL,
    id_number VARCHAR(30) NOT NULL,
    full_name VARCHAR(150) NOT NULL,
    address TEXT,
    nationality VARCHAR(50),
    phone_whatsapp VARCHAR(20) NOT NULL,
    id_image_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (id_type, id_number)
);
CREATE INDEX idx_guests_id_number ON guests(id_type, id_number);
CREATE INDEX idx_guests_phone ON guests(phone_whatsapp);

-- 4. TABEL TRANSAKSI RESERVASI
CREATE TABLE reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_number VARCHAR(50) UNIQUE NOT NULL,
    guest_id UUID REFERENCES guests(id) ON DELETE RESTRICT,
    room_id UUID REFERENCES rooms(id) ON DELETE RESTRICT,
    booking_source VARCHAR(20) CHECK (booking_source IN ('REDDOORZ', 'WALK_IN')) NOT NULL,
    reddoorz_booking_code VARCHAR(50),
    check_in_time TIMESTAMP WITH TIME ZONE NOT NULL,
    expected_check_out_time TIMESTAMP WITH TIME ZONE NOT NULL,
    actual_check_out_time TIMESTAMP WITH TIME ZONE,
    total_nights INTEGER NOT NULL,
    room_rate DECIMAL(12, 2) NOT NULL,
    additional_charges DECIMAL(12, 2) DEFAULT 0,
    additional_charges_detail JSONB DEFAULT '[]',
    total_amount DECIMAL(12, 2) NOT NULL,
    payment_method VARCHAR(30) NOT NULL, -- CASH, QRIS, TRANSFER, REDDOORZ_PREPAID
    payment_status VARCHAR(20) CHECK (payment_status IN ('PAID', 'PENDING', 'CANCELLED')) DEFAULT 'PAID',
    receptionist_user_id UUID REFERENCES users(id),
    wa_reminder_sent_at TIMESTAMP WITH TIME ZONE,
    wa_delivery_status VARCHAR(20), -- SENT, DELIVERED, READ, FAILED
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX idx_reservations_room ON reservations(room_id);
CREATE INDEX idx_reservations_guest ON reservations(guest_id);
CREATE INDEX idx_reservations_checkin ON reservations(check_in_time);
CREATE INDEX idx_reservations_expected_checkout ON reservations(expected_check_out_time)
    WHERE actual_check_out_time IS NULL;
CREATE INDEX idx_reservations_invoice ON reservations(invoice_number);

-- 5. TABEL AUDIT LOG AKTIVITAS SISTEM
CREATE TABLE activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    action_type VARCHAR(50) NOT NULL, -- CHECK_IN, CHECK_OUT, CREATE_ROOM, EDIT_PRICE, EXPORT_REPORT, WA_REMINDER_FAILED
    resource_type VARCHAR(50), -- reservation, room, report
    resource_id UUID,
    details JSONB,
    ip_address VARCHAR(45),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX idx_activity_logs_user ON activity_logs(user_id);
CREATE INDEX idx_activity_logs_action ON activity_logs(action_type);
CREATE INDEX idx_activity_logs_created ON activity_logs(created_at);
```

### 4.3 Aturan Integritas Data Tambahan

- `rooms.status` tidak dapat diubah menjadi `MAINTENANCE` oleh sistem jika terdapat reservasi aktif (`actual_check_out_time IS NULL`) pada kamar tersebut — divalidasi di business logic layer sebelum query UPDATE.
- Penghapusan `rooms` (FR-ROOM-06) menggunakan validasi aplikasi: cek `NOT EXISTS (SELECT 1 FROM reservations WHERE room_id = ? AND actual_check_out_time IS NULL)` sebelum eksekusi `DELETE`.
- `invoice_number` digenerate melalui fungsi service (`invoice.service.ts`) dengan format `INV/SH/YYYYMMDD/XXXX`, `XXXX` adalah sequence harian yang direset setiap tanggal berganti.

---

## 5. Keamanan (Security Architecture)

| Aspek | Implementasi |
|---|---|
| Autentikasi | JWT (HS256 minimum, disarankan RS256), expiry 12 jam, refresh token opsional untuk shift panjang |
| Password | bcrypt, cost factor ≥ 10, tidak pernah di-log |
| Transport | HTTPS/TLS 1.3 wajib di seluruh endpoint, HSTS header diaktifkan |
| Data at rest | AES-256 encryption pada bucket storage untuk foto dokumen identitas (KTP/Paspor/SIM) |
| Akses foto dokumen identitas | Signed URL dengan masa berlaku 15 menit, regenerasi otomatis saat dibutuhkan, tidak ada URL publik permanen |
| Otorisasi | RBAC middleware di setiap route backend, validasi ulang di frontend untuk UX (bukan pengganti validasi backend) |
| Rate limiting | Login endpoint dibatasi untuk mencegah brute-force |
| Audit trail | Seluruh aksi sensitif tercatat dengan `user_id`, `action_type`, `resource_id`, timestamp, IP address |
| Kepatuhan | Prinsip minimisasi data & retensi selaras dengan UU PDP — data dokumen identitas (KTP/Paspor/SIM) hanya digunakan untuk keperluan administrasi hotel |

---

## 6. Deployment & Infrastruktur

### 6.1 Lingkungan

| Environment | Tujuan | Catatan |
|---|---|---|
| Development | Pengembangan aktif tim | Database lokal/Supabase project terpisah |
| Staging | UAT bersama klien (Sprint 4) | Data dummy, mirror konfigurasi production |
| Production | Operasional hotel | Domain resmi, monitoring aktif |

### 6.2 Topologi Deployment yang Disarankan

- **Frontend Flutter Web:** build sebagai static web bundle, di-hosting via CDN (Vercel/Netlify/Firebase Hosting) atau di-package sebagai aplikasi desktop (Flutter Windows/Linux build) untuk instalasi lokal di PC kasir bila diperlukan mode kios.
- **Backend Next.js:** deploy di Vercel (serverless functions untuk Route Handlers) atau container (Docker) di VPS bila cron job memerlukan proses long-running yang lebih stabil daripada serverless cron.
- **Database:** Supabase managed PostgreSQL (termasuk backup otomatis harian, point-in-time recovery).
- **Storage:** Supabase Storage bucket privat (`identity-documents`) dengan RLS (Row Level Security) policy hanya dapat diakses via signed URL dari backend.
- **Cron Scheduler:** Vercel Cron (jika serverless) atau `node-cron` dalam container terpisah yang selalu aktif (jika self-hosted) untuk memastikan job 10-menit tidak terlewat akibat cold-start serverless.

### 6.3 Monitoring & Observability

- Logging terpusat (mis. Logtail/Axiom) untuk seluruh Route Handlers, khususnya error dari integrasi pihak ketiga (OCR/WA Gateway).
- Uptime monitoring (mis. Better Uptime/UptimeRobot) untuk endpoint kesehatan `GET /api/health`.
- Alert otomatis ke tim developer bila cron job pengingat WhatsApp gagal berturut-turut ≥ 3 kali.

### 6.4 CI/CD

```
Alur:
1. Push ke branch feature/* → lint + unit test otomatis (GitHub Actions)
2. Pull Request ke develop → code review wajib minimal 1 approver
3. Merge ke develop → auto-deploy ke Staging
4. Merge ke main (setelah UAT sign-off) → auto-deploy ke Production
```

---

## 7. Strategi Pengujian (Testing Strategy)

| Jenis Test | Cakupan | Tools |
|---|---|---|
| Unit Test | Business logic (kalkulasi tarif, validasi nomor identitas per jenis dokumen/WA, generator invoice number) | Jest (backend), Flutter Test (frontend) |
| Integration Test | Endpoint API kritis: login, check-in, check-out, export laporan | Jest + Supertest |
| E2E Test | Alur penuh check-in → check-out → invoice (Sprint 4) | Playwright / Flutter Integration Test |
| Load Test | Simulasi beban bergantian sesuai DoD §8.2 PRD | k6 / Artillery |
| Security Test | Validasi RBAC tidak bisa dilewati, signed URL kedaluwarsa berfungsi | Manual + automated script |

---

## 8. Roadmap Teknis Pasca-MVP (Referensi)

- Migrasi polling status kamar → WebSocket/Supabase Realtime untuk latensi lebih rendah.
- Dukungan multi-hotel/multi-tenant pada skema database (`hotel_id` sebagai foreign key tambahan).
- Integrasi Channel Manager multi-OTA selain RedDoorz.
- Modul housekeeping terpisah dengan checklist digital per kamar.
