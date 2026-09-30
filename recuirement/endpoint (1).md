# 🔌 API Endpoint Documentation
## Sinar Harapan Frontdesk & Property Management System (PMS)

---

## Dokumen Kontrol

| Item | Detail |
|---|---|
| Versi | 1.0 — Baseline |
| Base URL (Dev) | `http://localhost:3000/api` |
| Base URL (Prod) | `https://api.sinarharapanpms.com/api` |
| Format | JSON (`application/json`), upload gambar via `multipart/form-data` |
| Autentikasi | `Authorization: Bearer <JWT>` di setiap request kecuali `POST /auth/login` |
| Terkait | `prd.md`, `arsitektur.md`, `design-system.md` |

---

## 1. Konvensi Umum

### 1.1 Format Respons Sukses
```json
{
  "success": true,
  "data": { },
  "meta": { "timestamp": "2026-09-24T10:00:00Z" }
}
```

### 1.2 Format Respons Error
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Format nomor identitas tidak valid untuk jenis dokumen KTP",
    "fields": { "idNumber": "NIK harus 16 digit angka" }
  }
}
```

### 1.3 Kode Error Standar

| Code | HTTP Status | Keterangan |
|---|---|---|
| `UNAUTHORIZED` | 401 | Token tidak ada / tidak valid / kedaluwarsa |
| `FORBIDDEN` | 403 | Role tidak memiliki akses ke endpoint ini |
| `VALIDATION_ERROR` | 400 | Body/query tidak lolos validasi skema |
| `NOT_FOUND` | 404 | Resource tidak ditemukan |
| `CONFLICT` | 409 | Konflik state (mis. kamar sudah occupied, nomor identitas duplikat aktif) |
| `RATE_LIMITED` | 429 | Terlalu banyak percobaan (mis. login) |
| `EXTERNAL_SERVICE_ERROR` | 502 | Layanan pihak ketiga gagal (OCR/WA Gateway) |
| `INTERNAL_ERROR` | 500 | Kesalahan tak terduga di server |

### 1.4 Header Wajib

| Header | Contoh | Keterangan |
|---|---|---|
| `Authorization` | `Bearer eyJhbGciOi...` | Wajib di semua endpoint kecuali login |
| `Content-Type` | `application/json` atau `multipart/form-data` | Sesuai jenis body |
| `X-Request-Id` | `uuid` (opsional, client-generated) | Untuk tracing log antara client-server |

### 1.5 Pagination (untuk endpoint list/tabel)

Query params standar:
```
?page=1&limit=20&sortBy=created_at&sortOrder=desc
```
Respons:
```json
{
  "success": true,
  "data": [ ... ],
  "pagination": { "page": 1, "limit": 20, "totalItems": 143, "totalPages": 8 }
}
```

### 1.6 Ringkasan Matriks Akses per Endpoint

| Simbol | Arti |
|---|---|
| 🟢 | Resepsionis & Manajer boleh akses |
| 🔵 | Resepsionis saja |
| 🟠 | Manajer saja |
| ⚪ | Publik (tanpa token) |

---

## 2. Modul AUTH

### 2.1 `POST /auth/login` ⚪
Login dan menerbitkan JWT.

**Request:**
```json
{ "username": "resepsionis01", "password": "••••••••" }
```

**Response `200`:**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOi...",
    "expiresIn": 43200,
    "user": {
      "id": "uuid",
      "fullName": "Siti Aminah",
      "role": "RECEPTIONIST"
    }
  }
}
```

**Error:** `401 UNAUTHORIZED` (kredensial salah), `429 RATE_LIMITED` (>5x/menit per IP).

Referensi: FR-AUTH-01, FR-AUTH-02, FR-AUTH-03.

---

### 2.2 `POST /auth/refresh` 🟢
Memperbarui token sebelum kedaluwarsa (opsional, untuk shift panjang).

**Request Header:** `Authorization: Bearer <token lama>`

**Response `200`:**
```json
{ "success": true, "data": { "token": "eyJhbGciOi...", "expiresIn": 43200 } }
```

---

### 2.3 `POST /auth/logout` 🟢
Invalidasi sesi sisi client (opsional blacklist token di server jika diperlukan).

**Response `200`:**
```json
{ "success": true, "data": { "message": "Berhasil logout" } }
```

---

## 3. Modul ROOM MANAGEMENT

### 3.1 `GET /rooms` 🟢
List seluruh kamar, mendukung filter.

**Query params:**
```
?roomType=Deluxe&floor=2&status=AVAILABLE&page=1&limit=50
```

**Response `200`:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "roomNumber": "101",
      "roomType": "Standard",
      "floor": 1,
      "basePricePerNight": 250000,
      "facilities": ["AC", "TV", "Water Heater"],
      "status": "AVAILABLE",
      "updatedAt": "2026-09-24T09:00:00Z"
    }
  ]
}
```
Referensi: FR-ROOM-01, FR-ROOM-03.

---

### 3.2 `GET /rooms/status` 🟢
Endpoint ringan khusus untuk polling status grid kamar real-time (dipanggil tiap 15 detik oleh Flutter).

**Response `200`:**
```json
{
  "success": true,
  "data": [
    { "id": "uuid", "roomNumber": "101", "status": "OCCUPIED", "updatedAt": "..." }
  ]
}
```
Referensi: FR-ROOM-07.

---

### 3.3 `GET /rooms/{id}` 🟢
Detail satu kamar termasuk reservasi aktif (jika ada).

**Response `200`:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "roomNumber": "101",
    "status": "OCCUPIED",
    "activeReservation": {
      "id": "uuid",
      "guestName": "Budi Santoso",
      "checkInTime": "2026-09-24T14:00:00Z",
      "expectedCheckOutTime": "2026-09-25T12:00:00Z"
    }
  }
}
```
**Error:** `404 NOT_FOUND`

---

### 3.4 `POST /rooms` 🟠
Tambah kamar baru. **Role: MANAGER.**

**Request:**
```json
{
  "roomNumber": "205",
  "roomType": "Deluxe",
  "floor": 2,
  "basePricePerNight": 450000,
  "facilities": ["AC", "TV", "Balkon"]
}
```

**Response `201`:**
```json
{ "success": true, "data": { "id": "uuid", "roomNumber": "205", "status": "AVAILABLE" } }
```
**Error:** `409 CONFLICT` (roomNumber sudah ada), `403 FORBIDDEN` (bukan MANAGER).
Referensi: FR-ROOM-04. Dicatat ke `activity_logs` (action_type: `CREATE_ROOM`).

---

### 3.5 `PATCH /rooms/{id}` 🟠
Ubah data kamar (tarif, status, fasilitas). **Role: MANAGER.**

**Request (contoh ubah tarif):**
```json
{ "basePricePerNight": 480000 }
```

**Request (contoh ubah ke maintenance):**
```json
{ "status": "MAINTENANCE" }
```

**Response `200`:** data kamar terbaru.
**Error:** `409 CONFLICT` — jika mencoba set `MAINTENANCE` pada kamar dengan reservasi aktif.
Referensi: FR-ROOM-05. Dicatat ke `activity_logs` (action_type: `EDIT_PRICE` atau `EDIT_ROOM_STATUS`).

---

### 3.6 `DELETE /rooms/{id}` 🟠
Hapus kamar. **Role: MANAGER.**

**Response `200`:** `{ "success": true, "data": { "message": "Kamar berhasil dihapus" } }`
**Error:** `409 CONFLICT` — jika kamar memiliki riwayat reservasi aktif.
Referensi: FR-ROOM-06.

---

## 4. Modul OCR

### 4.1 `POST /ocr/extract-identity` 🔵
Ekstraksi data dari foto dokumen identitas — mendukung **KTP, Paspor, dan SIM**.
**Role: RECEPTIONIST.**

**Request:** `multipart/form-data`
```
image: <file.jpg>
documentType: KTP | PASSPORT | SIM
```

**Response `200` — jenis KTP:**
```json
{
  "success": true,
  "data": {
    "idType": "KTP",
    "idNumber": "3578012345670001",
    "namaLengkap": "BUDI SANTOSO",
    "alamat": "JL. MERDEKA NO. 10, MALANG",
    "nationality": "Indonesia",
    "confidence": 0.92,
    "perluVerifikasiManual": false,
    "tempImageUrl": "https://.../identity-temp/xxxx.jpg"
  }
}
```

**Response `200` — jenis Paspor (diparsing dari MRZ):**
```json
{
  "success": true,
  "data": {
    "idType": "PASSPORT",
    "idNumber": "C1234567",
    "namaLengkap": "JOHN SMITH",
    "alamat": null,
    "nationality": "GBR",
    "confidence": 1.0,
    "perluVerifikasiManual": false,
    "tempImageUrl": "https://.../identity-temp/yyyy.jpg"
  }
}
```

**Response `200` — jenis SIM:**
```json
{
  "success": true,
  "data": {
    "idType": "SIM",
    "idNumber": "901234567890",
    "namaLengkap": "BUDI SANTOSO",
    "alamat": null,
    "nationality": "Indonesia",
    "golonganSim": "SIM A",
    "confidence": 0.85,
    "perluVerifikasiManual": false,
    "tempImageUrl": "https://.../identity-temp/zzzz.jpg"
  }
}
```

**Response saat confidence rendah (berlaku untuk semua jenis dokumen):**
```json
{
  "success": true,
  "data": {
    "idType": "KTP",
    "idNumber": "35780123456700??",
    "namaLengkap": "BUDI SANTOSO",
    "alamat": null,
    "nationality": "Indonesia",
    "confidence": 0.55,
    "perluVerifikasiManual": true
  }
}
```

**Error:** `502 EXTERNAL_SERVICE_ERROR` (Google Vision API timeout/down — client fallback ke input manual), `400 VALIDATION_ERROR` (format file tidak didukung/ukuran > 5MB, atau `documentType` tidak dikenali).

Timeout server-side: 3 detik (NFR). Referensi: FR-RES-03, FR-RES-04.

> **Catatan khusus Paspor:** field diambil dari MRZ (Machine Readable Zone), bukan teks bebas —
> lihat `backend.md` §8.3 untuk detail parsing. `nationality` untuk Paspor berupa kode 3 huruf
> ICAO (mis. `"IDN"`, `"GBR"`), berbeda dari KTP/SIM yang langsung berisi nama negara penuh.

---

## 5. Modul RESERVATION & CHECK-IN

### 5.1 `POST /reservations` 🔵
Membuat reservasi baru + proses check-in. **Role: RECEPTIONIST.**

**Request (contoh tamu KTP):**
```json
{
  "roomId": "uuid",
  "bookingSource": "WALK_IN",
  "reddoorzBookingCode": null,
  "guest": {
    "idType": "KTP",
    "idNumber": "3578012345670001",
    "fullName": "Budi Santoso",
    "address": "Jl. Merdeka No. 10, Malang",
    "nationality": "Indonesia",
    "phoneWhatsapp": "081234567890",
    "idImageUrl": "https://.../identity-temp/xxxx.jpg"
  },
  "checkInTime": "2026-09-24T14:00:00Z",
  "expectedCheckOutTime": "2026-09-25T12:00:00Z",
  "totalNights": 1,
  "roomRate": 250000,
  "paymentMethod": "CASH"
}
```

**Request (contoh tamu WNA dengan Paspor):**
```json
{
  "roomId": "uuid",
  "bookingSource": "WALK_IN",
  "guest": {
    "idType": "PASSPORT",
    "idNumber": "C1234567",
    "fullName": "John Smith",
    "address": null,
    "nationality": "GBR",
    "phoneWhatsapp": "6281234567890",
    "idImageUrl": "https://.../identity-temp/yyyy.jpg"
  },
  "checkInTime": "2026-09-24T14:00:00Z",
  "expectedCheckOutTime": "2026-09-25T12:00:00Z",
  "totalNights": 1,
  "roomRate": 350000,
  "paymentMethod": "QRIS"
}
```

**Response `201`:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "invoiceNumber": "INV/SH/20260924/0007",
    "roomId": "uuid",
    "totalAmount": 250000,
    "status": "OCCUPIED"
  }
}
```

**Validasi & Error:**
- `409 CONFLICT` — kamar sudah tidak `AVAILABLE` (race condition dua resepsionis klik kamar sama).
- `409 CONFLICT` — nomor identitas (kombinasi `idType`+`idNumber`) sudah check-in aktif di kamar lain (FR-RES-07).
- `400 VALIDATION_ERROR` — format nomor WhatsApp tidak valid (`+62`/`08...`); `idNumber` tidak sesuai format `idType` (KTP wajib 16 digit, Paspor/SIM mengikuti pola masing-masing — lihat `backend.md` §8.1).
- `400 VALIDATION_ERROR` — `bookingSource: REDDOORZ` tanpa `reddoorzBookingCode`.
- `400 VALIDATION_ERROR` — `idType` di luar `KTP`/`PASSPORT`/`SIM`/`OTHER`.

Efek samping: status kamar → `OCCUPIED`, cron scheduler otomatis mulai memantau reservasi ini untuk pengingat WA. Dicatat ke `activity_logs` (action_type: `CHECK_IN`).
Referensi: FR-RES-01 s.d. FR-RES-07.

---

### 5.2 `GET /reservations/{id}` 🟢
Detail satu reservasi.

**Response `200`:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "invoiceNumber": "INV/SH/20260924/0007",
    "room": { "roomNumber": "101", "roomType": "Standard" },
    "guest": { "fullName": "Budi Santoso", "phoneWhatsapp": "081234567890" },
    "checkInTime": "...",
    "expectedCheckOutTime": "...",
    "actualCheckOutTime": null,
    "totalAmount": 250000,
    "paymentStatus": "PAID",
    "waDeliveryStatus": null
  }
}
```

---

### 5.3 `GET /reservations` 🟢
List reservasi dengan filter (dipakai juga oleh dashboard "hari ini" resepsionis).

**Query params:**
```
?status=ACTIVE|COMPLETED&roomType=&paymentMethod=&startDate=&endDate=&page=&limit=
```
> Untuk role `RECEPTIONIST`, backend memaksa filter `startDate=hari ini` walau query lain dikirim (sesuai RBAC: "Terbatas Hari Ini").

**Response `200`:** array reservasi + `pagination`.

---

## 6. Modul CHECK-OUT

### 6.1 `POST /reservations/{id}/checkout` 🔵
Proses check-out + generate invoice final. **Role: RECEPTIONIST.**

**Request:**
```json
{
  "additionalCharges": [
    { "label": "Late Check-out (2 jam)", "amount": 100000 },
    { "label": "Laundry", "amount": 35000 }
  ],
  "actualCheckOutTime": "2026-09-25T14:00:00Z"
}
```

**Response `200`:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "invoiceNumber": "INV/SH/20260924/0007",
    "roomRate": 250000,
    "additionalCharges": 135000,
    "totalAmount": 385000,
    "invoicePdfUrl": "https://.../invoices/INV-SH-20260924-0007.pdf"
  }
}
```

**Efek samping:** status kamar → `DIRTY`. Dicatat ke `activity_logs` (action_type: `CHECK_OUT`).
**Error:** `409 CONFLICT` — reservasi sudah checkout sebelumnya.
Referensi: FR-OUT-01 s.d. FR-OUT-05.

---

### 6.2 `GET /reservations/{id}/invoice` 🟢
Ambil ulang invoice PDF (mis. untuk cetak ulang).

**Response `200`:** `{ "success": true, "data": { "invoicePdfUrl": "https://..." } }`

---

### 6.3 `PATCH /rooms/{id}/mark-clean` 🔵
Ubah status kamar dari `DIRTY` → `AVAILABLE` setelah dibersihkan. **Role: RECEPTIONIST.**

**Response `200`:** data kamar terbaru dengan `status: AVAILABLE`.
Referensi: FR-OUT-04.

---

## 7. Modul WHATSAPP GATEWAY

### 7.1 `POST /notifications/send-reminder` 🔵
Trigger manual resend pengingat check-out. **Role: RECEPTIONIST.**

**Request:**
```json
{ "reservationId": "uuid" }
```

**Response `200`:**
```json
{ "success": true, "data": { "messageId": "wa-msg-id", "status": "SENT" } }
```
**Error:** `502 EXTERNAL_SERVICE_ERROR` — gateway WA down.
Referensi: FR-WA-04.

---

### 7.2 `POST /notifications/webhook` ⚪ (khusus dipanggil provider Fonnte/Wablas)
Callback status pengiriman dari WhatsApp Gateway. **Autentikasi: signature/secret khusus provider, bukan JWT.**

**Request (contoh payload dari provider):**
```json
{ "messageId": "wa-msg-id", "status": "delivered", "timestamp": "2026-09-24T13:05:00Z" }
```

**Response `200`:** `{ "success": true }`

> Endpoint ini harus divalidasi menggunakan secret/token khusus dari provider (bukan JWT internal) untuk mencegah spoofing.

---

### 7.3 `GET /notifications/scheduler-status` 🟠
Melihat riwayat eksekusi cron job pengingat (untuk debugging manajer/dev). **Role: MANAGER.**

**Response `200`:**
```json
{
  "success": true,
  "data": [
    { "runAt": "2026-09-24T13:00:00Z", "remindersProcessed": 4, "failed": 0 }
  ]
}
```

---

## 8. Modul REPORTING (MANAGER ONLY)

### 8.1 `GET /reports/summary` 🟠
Ringkasan KPI dashboard eksekutif.

**Query params:**
```
?startDate=2026-09-01&endDate=2026-09-30
```

**Response `200`:**
```json
{
  "success": true,
  "data": {
    "totalCheckIn": 128,
    "totalCheckOut": 120,
    "occupancyRate": 78.5,
    "channelComposition": { "reddoorz": 74, "walkIn": 54 },
    "totalNetRevenue": 45200000
  }
}
```
Referensi: FR-REP-01.

---

### 8.2 `GET /reports/transactions` 🟠
Tabel rekapitulasi transaksi dengan filter.

**Query params:**
```
?startDate=&endDate=&roomType=&paymentMethod=&page=&limit=
```

**Response `200`:** array transaksi + `pagination`.
Referensi: FR-REP-02.

---

### 8.3 `GET /reports/export-excel` 🟠
Unduh laporan Excel (2 sheet: Summary KPI + Raw Data).

**Query params:**
```
?startDate=2026-09-01&endDate=2026-09-30
```

**Response `200`:** binary file `.xlsx` (`Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `Content-Disposition: attachment; filename="laporan-sept-2026.xlsx"`).
Dicatat ke `activity_logs` (action_type: `EXPORT_REPORT`, details: `{ format: "excel", range }`).
Referensi: FR-REP-03, FR-REP-05.

---

### 8.4 `GET /reports/export-pdf` 🟠
Unduh laporan PDF resmi A4.

**Query params:** sama seperti export-excel.

**Response `200`:** binary file `.pdf` (`Content-Type: application/pdf`).
Dicatat ke `activity_logs` (action_type: `EXPORT_REPORT`, details: `{ format: "pdf", range }`).
Referensi: FR-REP-04, FR-REP-05.

---

## 9. Modul AUDIT LOG (MANAGER ONLY)

### 9.1 `GET /audit-logs` 🟠
List log aktivitas staf.

**Query params:**
```
?userId=&actionType=CHECK_IN&startDate=&endDate=&page=&limit=
```

**Response `200`:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "user": { "fullName": "Siti Aminah", "role": "RECEPTIONIST" },
      "actionType": "CHECK_IN",
      "resourceType": "reservation",
      "resourceId": "uuid",
      "details": { "roomNumber": "101" },
      "ipAddress": "182.x.x.x",
      "createdAt": "2026-09-24T14:00:05Z"
    }
  ],
  "pagination": { "page": 1, "limit": 20, "totalItems": 312, "totalPages": 16 }
}
```
Referensi: matriks RBAC — Audit Trail hanya untuk MANAGER.

---

## 10. Modul SISTEM (Health & Utility)

### 10.1 `GET /health` ⚪
Endpoint kesehatan untuk uptime monitoring.

**Response `200`:**
```json
{ "success": true, "data": { "status": "ok", "dbConnected": true, "uptime": 123456 } }
```

---

## 11. Ringkasan Tabel Seluruh Endpoint

| Method | Path | Akses | Ref. FR |
|---|---|---|---|
| POST | `/auth/login` | ⚪ | FR-AUTH-01 |
| POST | `/auth/refresh` | 🟢 | FR-AUTH-02 |
| POST | `/auth/logout` | 🟢 | — |
| GET | `/rooms` | 🟢 | FR-ROOM-01, 03 |
| GET | `/rooms/status` | 🟢 | FR-ROOM-07 |
| GET | `/rooms/{id}` | 🟢 | FR-ROOM-01 |
| POST | `/rooms` | 🟠 | FR-ROOM-04 |
| PATCH | `/rooms/{id}` | 🟠 | FR-ROOM-05 |
| DELETE | `/rooms/{id}` | 🟠 | FR-ROOM-06 |
| PATCH | `/rooms/{id}/mark-clean` | 🔵 | FR-OUT-04 |
| POST | `/ocr/extract-identity` | 🔵 | FR-RES-03, 04 |
| POST | `/reservations` | 🔵 | FR-RES-01–07 |
| GET | `/reservations/{id}` | 🟢 | — |
| GET | `/reservations` | 🟢 | — |
| POST | `/reservations/{id}/checkout` | 🔵 | FR-OUT-01–05 |
| GET | `/reservations/{id}/invoice` | 🟢 | FR-OUT-03 |
| POST | `/notifications/send-reminder` | 🔵 | FR-WA-04 |
| POST | `/notifications/webhook` | ⚪ (secret) | FR-WA-05 |
| GET | `/notifications/scheduler-status` | 🟠 | FR-WA-01 |
| GET | `/reports/summary` | 🟠 | FR-REP-01 |
| GET | `/reports/transactions` | 🟠 | FR-REP-02 |
| GET | `/reports/export-excel` | 🟠 | FR-REP-03 |
| GET | `/reports/export-pdf` | 🟠 | FR-REP-04 |
| GET | `/audit-logs` | 🟠 | RBAC |
| GET | `/health` | ⚪ | NFR Availability |

---

## 12. Skema Validasi (class-validator, NestJS) — Referensi Cepat

> Backend memakai NestJS + `class-validator` (bukan Zod) — lihat `backend.md` §8.1 untuk DTO
> lengkap beserta custom validator `IdNumberFormatValidator` yang memvalidasi `idNumber` sesuai
> `idType` (format KTP/Paspor/SIM berbeda-beda, tidak bisa satu regex statis).

```ts
// Ringkasan struktur DTO — implementasi penuh ada di backend.md §8.1
class GuestDto {
  idType: 'KTP' | 'PASSPORT' | 'SIM' | 'OTHER';   // @IsEnum
  idNumber: string;                                // @Validate(IdNumberFormatValidator)
  fullName: string;                                // @IsString
  address?: string;                                // @IsOptional @IsString
  nationality?: string;                            // @IsOptional @IsString — dari MRZ untuk Paspor
  phoneWhatsapp: string;                            // @Matches(/^(\+62|08)\d{8,13}$/)
  idImageUrl?: string;                              // @IsOptional @IsString
}

class CreateReservationDto {
  roomId: string;                                   // @IsUUID
  bookingSource: 'REDDOORZ' | 'WALK_IN';             // @IsEnum
  reddoorzBookingCode?: string;                      // @IsOptional @IsString
  guest: GuestDto;                                   // @ValidateNested @Type(() => GuestDto)
  checkInTime: string;                               // @IsDateString
  expectedCheckOutTime: string;                       // @IsDateString
  totalNights: number;                                // @IsInt @IsPositive
  roomRate: number;                                    // @IsNumber @IsPositive
  paymentMethod: 'CASH' | 'QRIS' | 'TRANSFER' | 'REDDOORZ_PREPAID'; // @IsEnum
}
// Validasi silang "reddoorzBookingCode wajib jika bookingSource REDDOORZ" dicek manual
// di awal ReservationsService.createReservation(), lihat backend.md §8.2
```

---

## 13. Catatan Implementasi untuk Tim Backend

1. Semua endpoint yang mengubah `rooms.status` **wajib** dibungkus dalam **database transaction** (Prisma `$transaction`) untuk mencegah race condition dua resepsionis melakukan check-in ke kamar yang sama secara bersamaan (`409 CONFLICT` harus konsisten).
2. Endpoint `POST /reservations` sebaiknya menerapkan **row-level lock** (`SELECT ... FOR UPDATE`) pada baris kamar terkait sebelum validasi status, baru commit perubahan status.
3. Endpoint ekspor laporan (`export-excel`, `export-pdf`) sebaiknya diberi **timeout guard** dan dijalankan asinkron bila rentang tanggal sangat besar (roadmap pasca-MVP).
4. Endpoint `POST /notifications/webhook` **tidak boleh** menggunakan middleware JWT global — gunakan verifikasi signature terpisah sesuai dokumentasi provider (Fonnte/Wablas).
5. Seluruh endpoint `🟠` (Manager only) dan aksi sensitif `🔵`/`🟢` yang tercatat di `activity_logs` harus memasukkan `ipAddress` dari header `x-forwarded-for` (bila di belakang proxy/CDN).
