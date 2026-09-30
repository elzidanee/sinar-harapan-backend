# 🔐 Security Documentation
## Sinar Harapan Frontdesk & Property Management System (PMS)

---

## Dokumen Kontrol

| Item | Detail |
|---|---|
| Versi | 1.0 — Baseline |
| Tujuan | Threat model, kontrol keamanan, dan checklist kepatuhan untuk data tamu hotel (PII sensitif: nomor identitas KTP/Paspor/SIM, foto dokumen identitas, nomor WA) |
| Terkait | `prd.md`, `arsitektur.md`, `backend.md`, `database.md` |
| Regulasi Acuan | UU No. 27 Tahun 2022 tentang Pelindungan Data Pribadi (UU PDP) |

---

## 1. Prinsip Keamanan

1. **Defense in depth** — tidak ada satu kontrol tunggal yang diandalkan; validasi berlapis di setiap layer (network, aplikasi, database).
2. **Least privilege** — setiap role hanya mendapat akses minimum yang dibutuhkan untuk tugasnya (lihat matriks RBAC di `prd.md` §2.3).
3. **Data minimization** — hanya mengumpulkan data tamu yang benar-benar diperlukan untuk administrasi hotel (nomor identitas, nama, alamat, WA — tidak lebih; untuk Paspor, kewarganegaraan turut disimpan karena relevan untuk pelaporan tamu WNA).
4. **Secure by default** — endpoint baru default TERTUTUP (butuh auth) kecuali secara eksplisit didaftarkan sebagai publik.
5. **Auditability** — setiap aksi sensitif harus bisa ditelusuri: siapa, kapan, apa yang diubah.
6. **Fail securely** — saat terjadi error tak terduga, sistem menolak akses (fail closed), bukan mengizinkan (fail open).

---

## 2. Klasifikasi Data

| Kategori | Contoh Data | Tingkat Sensitivitas | Perlakuan Khusus |
|---|---|---|---|
| **PII Sangat Sensitif** | Nomor identitas (KTP/Paspor/SIM), foto dokumen identitas | Kritis | Enkripsi at rest (AES-256), signed URL 15 menit, TIDAK PERNAH di-log |
| **PII Sensitif** | Nama tamu, alamat, kewarganegaraan, nomor WhatsApp | Tinggi | Akses dibatasi RBAC, tidak diekspos ke role yang tidak berkepentingan |
| **Data Finansial** | Total transaksi, metode bayar, invoice | Tinggi | Akses ekspor hanya MANAJER, tercatat di audit log |
| **Data Operasional** | Status kamar, tarif, tipe kamar | Sedang | Dapat dilihat semua role terautentikasi |
| **Kredensial** | Password (hash), JWT secret | Kritis | bcrypt hash, secret di environment variable, tidak pernah di-commit |
| **Log Aktivitas** | `activity_logs` | Sedang-Tinggi | Hanya MANAJER, berisi IP address (perlu retensi terbatas) |

---

## 3. Threat Model (Ringkasan per Kategori STRIDE)

| Kategori Ancaman | Skenario Spesifik di PMS Ini | Mitigasi |
|---|---|---|
| **Spoofing** (penyamaran identitas) | Penyerang mencoba login sebagai resepsionis/manajer dengan kredensial curian | bcrypt hashing, rate limiting login (§5.3), JWT expiry 12 jam |
| **Spoofing** | Penyerang mengirim payload palsu ke `/notifications/webhook` mengaku sebagai WA Gateway | Verifikasi HMAC signature wajib (§5.7), TIDAK menggunakan JWT untuk endpoint ini |
| **Tampering** (manipulasi data) | Resepsionis nakal mengubah tarif kamar tanpa otorisasi | RBAC — hanya MANAGER yang punya akses `PATCH /rooms/:id` |
| **Tampering** | Race condition dua check-in ke kamar sama menyebabkan data korup | Row-level lock (`FOR UPDATE`) dalam database transaction — lihat `backend.md` §8.2 |
| **Repudiation** (penyangkalan aksi) | Staf menyangkal telah mengubah harga kamar atau menghapus reservasi | `activity_logs` mencatat setiap aksi sensitif dengan `userId`, timestamp, IP (§7) |
| **Information Disclosure** (kebocoran data) | Foto dokumen identitas (KTP/Paspor/SIM) tamu bocor via URL publik permanen | Signed URL Supabase Storage, expiry 15 menit (§6.2) |
| **Information Disclosure** | Nomor identitas/nomor WA muncul di application log/error trace | Larangan eksplisit logging PII (§8), review kode wajib |
| **Denial of Service** | Brute-force percobaan login berulang membebani server | Rate limiting (`@nestjs/throttler`), maksimum 5x/menit per IP |
| **Elevation of Privilege** | Resepsionis mencoba akses endpoint MANAGER via manipulasi request langsung (bukan lewat UI) | `RolesGuard` di backend memvalidasi role dari JWT payload, BUKAN dari input client — UI hanya lapisan UX, bukan kontrol keamanan |

---

## 4. Autentikasi

### 4.1 Mekanisme

- **JWT (JSON Web Token)**, algoritma HS256, ditandatangani dengan `JWT_SECRET` (minimum 32 karakter random, disimpan di environment variable, berbeda antara dev/staging/production).
- **Masa berlaku token:** 12 jam, disesuaikan dengan durasi shift kerja resepsionis.
- **Payload token** hanya berisi data non-sensitif: `{ id, role, fullName, iat, exp }` — TIDAK PERNAH menyimpan password, nomor identitas, atau data tamu di dalam token.
- **Penyimpanan token di client (Flutter):** secure storage (`flutter_secure_storage`), BUKAN `SharedPreferences` biasa yang tidak terenkripsi.

### 4.2 Password

- Hashing dengan **bcrypt**, cost factor minimum **10**.
- Password TIDAK PERNAH disimpan atau ditampilkan dalam bentuk plain text — termasuk di log aplikasi, response API, atau pesan error.
- Tidak ada endpoint yang mengembalikan `passwordHash` dalam response apa pun (field ini di-exclude eksplisit di setiap query Prisma yang mengembalikan data user ke client, mis. via `select` yang eksplisit menyebutkan field yang diizinkan).

### 4.3 Rate Limiting Login

```yaml
endpoint: POST /auth/login
batas: 5 percobaan per menit per alamat IP
implementasi: '@nestjs/throttler'
respons_saat_terkena_limit: 429 RATE_LIMITED
logging: setiap percobaan gagal dicatat sebagai LOGIN_FAILED di activity_logs
  (tanpa userId jika username tidak ditemukan, dengan IP address)
```

### 4.4 Kebijakan Sesi

- Auto-logout otomatis saat token kedaluwarsa — redirect paksa ke halaman login.
- Tidak ada mekanisme "remember me" jangka panjang — setiap shift baru wajib login ulang, sesuai konteks operasional hotel dengan shift kerja jelas.
- (Roadmap opsional) refresh token dengan masa berlaku lebih panjang jika dibutuhkan shift >12 jam — belum diimplementasikan di MVP karena risiko token jangka panjang lebih tinggi jika perangkat hilang/dicuri.

---

## 5. Otorisasi (RBAC)

### 5.1 Model

Dua role: `RECEPTIONIST` dan `MANAGER`, dengan matriks akses lengkap di `prd.md` §2.3. Otorisasi ditegakkan di **backend**, bukan hanya UI — setiap endpoint memvalidasi role dari JWT payload melalui `RolesGuard` (lihat `backend.md` §5.3).

### 5.2 Prinsip Penegakan

- **UI hanya kontrol UX** (menyembunyikan tombol yang tidak relevan) — BUKAN kontrol keamanan. Semua validasi otorisasi WAJIB terjadi ulang di backend, karena UI dapat dilewati (mis. panggilan API langsung via Postman/script).
- **Default deny:** endpoint tanpa `@Roles()` eksplisit dapat diakses semua role yang login (`RECEPTIONIST` & `MANAGER`), TAPI setiap endpoint yang membuka data sensitif (laporan, audit log, harga) WAJIB eksplisit `@Roles('MANAGER')`.
- **Tidak ada privilege escalation via data milik sendiri** — resepsionis tidak bisa mengakses laporan meski itu "transaksi yang dia buat sendiri"; laporan tetap MANAGER-only sesuai kebijakan bisnis.

### 5.3 Test Wajib

Setiap kombinasi endpoint x role harus punya test otomatis eksplisit (lihat `backend.md` §9.3) — tidak boleh diasumsikan "seharusnya sudah benar" tanpa verifikasi test.

---

## 6. Perlindungan Data Sensitif (Dokumen Identitas: KTP, Paspor, SIM)

### 6.1 Enkripsi at Rest

- Foto dokumen identitas disimpan di **Supabase Storage** bucket privat (`identity-documents`), dengan enkripsi AES-256 di level storage (bawaan Supabase/S3-compatible) — berlaku sama untuk foto KTP, Paspor, maupun SIM.
- Kolom `idNumber` di database TIDAK dienkripsi secara kolom-terpisah pada MVP (mengandalkan enkripsi disk-level PostgreSQL/Supabase) — **catatan roadmap:** pertimbangkan enkripsi kolom (`pgcrypto`) jika audit keamanan formal mensyaratkan defense-in-depth tambahan di level database.

### 6.2 Signed URL untuk Akses Foto Dokumen Identitas

```yaml
mekanisme: Supabase Storage signed URL
masa_berlaku: 15 menit (SUPABASE_SIGNED_URL_EXPIRY_SECONDS)
regenerasi: otomatis setiap kali frontend butuh menampilkan ulang foto
  (mis. resepsionis membuka detail reservasi) — TIDAK ADA URL permanen
  yang di-cache/disimpan di client dalam bentuk dapat diakses tanpa otorisasi
akses: hanya melalui backend yang sudah memvalidasi JWT + role peminta
berlaku_untuk: foto KTP, Paspor, dan SIM — tidak ada perlakuan berbeda antar jenis dokumen
```

### 6.3 Retensi & Penghapusan Data

| Data | Kebijakan Retensi (Rekomendasi) |
|---|---|
| Foto dokumen identitas (KTP/Paspor/SIM) | Disarankan retensi maksimum sesuai kebutuhan operasional hotel (mis. 1-2 tahun) — implementasi job pembersihan otomatis adalah roadmap pasca-MVP, perlu dikonfirmasi kebijakan retensi resmi hotel & regulasi perhotelan setempat |
| Data tamu (`guests`) | Disimpan selama diperlukan untuk keperluan administrasi/pajak hotel; penghapusan permintaan tamu (hak akses UU PDP) memerlukan prosedur manual di MVP. Untuk tamu WNA (Paspor), retensi turut mempertimbangkan kewajiban pelaporan tamu asing ke otoritas keimigrasian setempat bila berlaku |
| `activity_logs` | Disarankan retensi minimum 1 tahun untuk keperluan audit, dengan arsip/pembersihan berkala agar tabel tidak membengkak tanpa batas |

> **Catatan:** kebijakan retensi resmi harus dikonfirmasi bersama pemilik hotel & memperhatikan regulasi terkait sebelum implementasi otomatis job penghapusan data — dokumen ini memberi kerangka kerja, bukan keputusan bisnis final.

### 6.4 Prinsip Minimisasi

- OCR HANYA mengekstrak field yang dibutuhkan (nomor identitas, nama, alamat/kewarganegaraan) — tidak menyimpan data tambahan dari dokumen yang tidak relevan (mis. golongan darah, agama, status perkawinan pada KTP; foto wajah tertanam pada chip e-Paspor — sistem ini hanya membaca MRZ, bukan chip biometrik).
- Foto dokumen identitas asli tetap disimpan (untuk keperluan verifikasi/audit hotel), namun akses ke foto dibatasi ketat sesuai §6.2.
- Untuk SIM, field golongan SIM (`golonganSim`) hanya ditampilkan sebagai info tambahan opsional di UI, TIDAK disimpan sebagai kolom database formal — bukan data yang relevan untuk keperluan administrasi hotel.

---

## 7. Audit Trail

### 7.1 Prinsip

Setiap aksi yang mengubah state penting ATAU mengakses data sensitif dalam skala (ekspor laporan) WAJIB tercatat. Lihat daftar lengkap di `backend.md` §8.8.

### 7.2 Struktur Log

```json
{
  "userId": "uuid-resepsionis",
  "actionType": "CHECK_IN",
  "resourceType": "reservation",
  "resourceId": "uuid-reservasi",
  "details": { "roomNumber": "101", "guestName": "Budi Santoso" },
  "ipAddress": "182.x.x.x",
  "createdAt": "2026-09-24T14:00:05Z"
}
```

**Aturan isi `details`:** boleh berisi konteks operasional (nomor kamar, jenis perubahan), TAPI TIDAK BOLEH berisi nomor identitas lengkap atau data dokumen (KTP/Paspor/SIM) mentah — cukup referensi (`resourceId`) yang bisa di-lookup oleh MANAGER dengan akses yang sesuai, bukan duplikasi data sensitif ke tabel log.

### 7.3 Akses Log

Hanya `MANAGER` yang dapat membaca `activity_logs` (`GET /audit-logs`). Log bersifat **append-only** — tidak ada endpoint `UPDATE`/`DELETE` untuk tabel ini di level aplikasi, mencegah staf menghapus jejak aksinya sendiri.

---

## 8. Larangan Logging Data Sensitif

Aturan berikut WAJIB ditegakkan di seluruh codebase (relevan untuk code review & AI agent yang menulis kode):

```
❌ console.log(request.body) di endpoint yang menerima data tamu/dokumen identitas
❌ Mencetak nomor identitas, nomor WA, atau isi foto dokumen (KTP/Paspor/SIM) ke stdout/log aplikasi
❌ Menyertakan payload lengkap request di pesan error yang dikirim ke client
❌ Logging Interceptor (backend.md §3) mencatat body mentah tanpa masking
✅ Log HANYA boleh berisi: resourceId, actionType, status code, durasi request,
   userId (bukan data personal tamu)
✅ Jika debugging memerlukan data spesifik, gunakan lingkungan development
   dengan data dummy, BUKAN data produksi asli
```

---

## 9. Keamanan Transport & Infrastruktur

| Aspek | Kontrol |
|---|---|
| Enkripsi transport | HTTPS/TLS 1.3 wajib di seluruh endpoint — tidak ada endpoint yang menerima HTTP plain |
| HSTS | Header `Strict-Transport-Security` diaktifkan di reverse proxy/platform hosting |
| CORS | Dibatasi hanya ke origin resmi aplikasi Flutter (`CORS_ORIGIN` env var), TIDAK menggunakan wildcard `*` di production |
| Header keamanan | `helmet` middleware di NestJS untuk header standar (`X-Content-Type-Options`, `X-Frame-Options`, dsb.) |
| Secrets management | Seluruh secret (JWT_SECRET, API key OCR/WA, kredensial database) di environment variable platform hosting (Railway/Fly.io), TIDAK PERNAH di-commit ke repository |
| Dependency scanning | `pnpm audit` dijalankan di CI pipeline setiap PR untuk mendeteksi kerentanan dependency |
| Database access | Koneksi database hanya dari backend (tidak ada akses langsung publik ke PostgreSQL), menggunakan connection string dengan kredensial terbatas (bukan superuser) |

---

## 10. Validasi Input & Pencegahan Injeksi

| Jenis Serangan | Relevansi | Mitigasi |
|---|---|---|
| SQL Injection | Rendah — Prisma ORM menggunakan parameterized query secara default | Query raw (`$queryRaw`) HANYA dipakai untuk `FOR UPDATE` lock (lihat `backend.md` §8.2), selalu dengan parameter binding, TIDAK PERNAH string concatenation |
| NoSQL/Object Injection | N/A — tidak menggunakan NoSQL | — |
| Mass Assignment | Sedang — client bisa mengirim field ekstra yang tidak diinginkan | `ValidationPipe` global dengan `whitelist: true, forbidNonWhitelisted: true` (lihat `backend.md` §5.4) — field di luar DTO otomatis ditolak |
| File Upload Malicious | Sedang — upload foto dokumen identitas bisa disalahgunakan untuk upload file berbahaya | Validasi tipe file (`image/jpeg`, `image/png` saja), validasi ukuran maksimum (5MB), scan tipe MIME asli (bukan hanya ekstensi) |
| XSS | Rendah — backend adalah API murni, tidak me-render HTML dari input user | Tetap terapkan output encoding jika data tamu (nama) ditampilkan di PDF/Excel export untuk mencegah formula injection di Excel (lihat §10.1) |
| Command Injection | N/A — tidak ada eksekusi shell command dari input user | — |

### 10.1 Excel Formula Injection

Saat generate laporan `.xlsx` (`ExcelJS`), field teks dari input user (nama tamu, alamat) **wajib di-sanitasi** jika diawali karakter `=`, `+`, `-`, `@` — karakter ini bisa dieksekusi sebagai formula berbahaya saat file dibuka di Excel. Tambahkan prefix karakter aman (`'`) atau escape sebelum menulis ke cell.

---

## 11. Keamanan Integrasi Pihak Ketiga

### 11.1 Google Cloud Vision API
- Kredensial service account disimpan sebagai JSON string di environment variable (`GOOGLE_APPLICATION_CREDENTIALS_JSON`), TIDAK sebagai file yang di-commit ke repository.
- Gambar dokumen identitas (KTP/Paspor/SIM) yang dikirim ke Google Vision tunduk pada kebijakan privasi Google Cloud — dipastikan menggunakan API level enterprise/paid (bukan free-tier consumer) yang tidak menggunakan data untuk pelatihan model, sesuai ketentuan Google Cloud Platform data processing. Berlaku sama untuk ketiga jenis dokumen, termasuk data MRZ Paspor yang berisi informasi kewarganegaraan.

### 11.2 WhatsApp Gateway (Fonnte/Wablas)
- API token disimpan sebagai secret, tidak pernah diekspos ke frontend.
- Webhook callback diverifikasi via HMAC signature (`WA_WEBHOOK_SECRET`) — mencegah pihak ketiga tak dikenal mengirim payload palsu yang bisa memanipulasi status pengiriman (§3, kategori Spoofing).
- Nomor WhatsApp tamu HANYA digunakan untuk pengingat check-out — tidak digunakan untuk marketing/broadcast tanpa consent eksplisit tamu (relevan untuk kepatuhan UU PDP).

---

## 12. Pemetaan OWASP API Security Top 10

| # | Risiko OWASP API Top 10 | Status di PMS Ini |
|---|---|---|
| API1 | Broken Object Level Authorization | Ditangani — setiap query resource (reservation, room) memvalidasi kepemilikan/role sebelum expose data |
| API2 | Broken Authentication | Ditangani — JWT + bcrypt + rate limiting (§4) |
| API3 | Broken Object Property Level Authorization | Ditangani — DTO `whitelist` mencegah field tak sah diubah; `passwordHash` selalu di-exclude dari response |
| API4 | Unrestricted Resource Consumption | Sebagian — rate limiting login ada; export laporan skala besar perlu guard tambahan (roadmap, lihat `backend.md` §3.7) |
| API5 | Broken Function Level Authorization | Ditangani — `RolesGuard` per-endpoint (§5) |
| API6 | Unrestricted Access to Sensitive Business Flows | Ditangani — check-in/checkout melalui transaction lock, tidak bisa di-automate/spam tanpa role valid |
| API7 | Server Side Request Forgery (SSRF) | Rendah risiko — tidak ada endpoint yang fetch URL sembarang dari input user |
| API8 | Security Misconfiguration | Perlu checklist deploy (§13) — CORS, Swagger production, header keamanan |
| API9 | Improper Inventory Management | Ditangani — `endpoint.md` sebagai dokumentasi lengkap seluruh endpoint aktif |
| API10 | Unsafe Consumption of APIs | Ditangani — timeout & error handling eksplisit untuk OCR/WA Gateway (§11), tidak trust blind terhadap response eksternal |

---

## 13. Checklist Keamanan Pra-Produksi

```
[ ] JWT_SECRET production berbeda dari development, minimum 32 karakter random
[ ] Semua environment variable sensitif tidak ter-commit di git history
[ ] Rate limiting aktif di endpoint login
[ ] CORS dibatasi ke origin resmi, tidak wildcard
[ ] Swagger dinonaktifkan atau dilindungi auth tambahan di production
[ ] Signed URL foto dokumen identitas terbukti expired setelah 15 menit (test manual)
[ ] RBAC teruji untuk SETIAP endpoint x role (test otomatis, bukan asumsi)
[ ] Tidak ada nomor identitas/foto dokumen identitas muncul di log aplikasi (review manual + automated check)
[ ] Webhook WA menolak request tanpa signature valid
[ ] Password tidak pernah muncul di response API mana pun
[ ] Dependency audit (`pnpm audit`) bersih dari kerentanan kritis/tinggi
[ ] HTTPS/TLS aktif, HTTP request otomatis redirect ke HTTPS
[ ] Backup database terjadwal & prosedur restore sudah diuji minimal sekali (lihat `database.md` §7)
[ ] Kebijakan retensi data dokumen identitas (KTP/Paspor/SIM) dikonfirmasi dengan pemilik hotel
```

---

## 14. Rencana Respons Insiden (Ringkas)

| Skenario | Langkah Awal |
|---|---|
| Dugaan kebocoran foto dokumen identitas/nomor identitas (KTP/Paspor/SIM) | 1) Cabut/rotate semua signed URL & service key Supabase Storage, 2) Audit `activity_logs` untuk akses mencurigakan, 3) Informasikan pemilik hotel sesuai kewajiban UU PDP jika kebocoran terkonfirmasi |
| Kredensial staf dicuri/disalahgunakan | 1) Nonaktifkan (`isActive = false`) user terkait, 2) Rotate `JWT_SECRET` (memaksa semua sesi aktif logout), 3) Review `activity_logs` user tersebut |
| Serangan brute-force terdeteksi | 1) Rate limiting otomatis menahan sebagian besar, 2) Blokir IP sumber di level infrastruktur jika berlanjut, 3) Review log `LOGIN_FAILED` |
| Layanan pihak ketiga (OCR/WA) mengalami insiden keamanan di sisi mereka | 1) Rotate API key/token terkait, 2) Pantau advisory resmi provider, 3) Nonaktifkan integrasi sementara jika perlu (fallback manual tetap tersedia sesuai `business-flow.md` §4 & §5.1) |
