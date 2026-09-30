# 📑 Product Requirement Document (PRD)
## Sinar Harapan Frontdesk & Property Management System (PMS)

---

## Dokumen Kontrol

| Item | Detail |
|---|---|
| Nama Produk | Sinar Harapan Frontdesk & Property Management System (PMS) |
| Klien | Hotel Sinar Harapan (Mitra Resmi RedDoorz) |
| Status Dokumen | Approved / Baseline v1.0 |
| Target Rilis (MVP) | 8 Minggu (5 Sprint) |
| Tech Stack Utama | Flutter (Frontend Web/Desktop/Tablet) + Next.js App Router (Backend/API) + PostgreSQL (Database) |
| Platform Target | Tablet landscape 10"+ (utama), Desktop 1920x1080 (sekunder) |
| Dokumen Terkait | `arsitektur.md`, `design-system.md` |

---

## 1. Pendahuluan & Tujuan Bisnis (Executive Summary)

### 1.1 Latar Belakang Masalah

1. **Pencatatan Tamu Manual & Lambat** — Input identitas secara manual saat tamu datang (*walk-in*) memperpanjang antrean di meja lobi dan rawan kesalahan pengetikan nomor identitas atau nama, termasuk untuk tamu WNA yang membawa Paspor.
2. **Keterpisahan Kanal Pemesanan** — Kurangnya sinkronisasi cepat antara reservasi via aplikasi RedDoorz dengan tamu yang datang langsung secara offline, meningkatkan potensi kelebihan penjualan (*overbooking*).
3. **Keterlambatan Jam Check-out** — Tidak adanya sistem pengingat otomatis menyebabkan tamu sering terlambat keluar (*late check-out*), menghambat staf dalam menyiapkan kamar untuk tamu berikutnya.
4. **Visibilitas Manajemen yang Lemah** — Manajer kesulitan melihat rekapitulasi performa bulanan (okupansi, rasio RedDoorz vs Walk-in, dan pendapatan) secara instan tanpa merekap buku tamu fisik atau lembar Excel manual.

### 1.2 Tujuan Proyek (Goals & Objectives)

- Mempersingkat waktu pemrosesan *check-in* tamu dari rata-rata 5–7 menit menjadi **kurang dari 2 menit** menggunakan ekstraksi kamera/OCR dokumen identitas (KTP, Paspor, atau SIM).
- Menyediakan visualisasi ketersediaan kamar secara *real-time* berbasis kode warna untuk resepsionis.
- Mengotomatisasi 100% pengiriman pengingat waktu *check-out* ke WhatsApp tamu H-1 jam sebelum batas akhir.
- Menyediakan dasbor eksekutif untuk manajer yang dilengkapi fitur unduh laporan terformat (PDF dan Excel) untuk periode bulanan/kustom.
- Mengurangi kesalahan input data tamu (nomor identitas/nama) akibat pengetikan manual hingga mendekati nol melalui validasi OCR + koreksi manual.
- Menghilangkan ketergantungan pada buku tamu fisik dan rekap Excel manual oleh manajer.
- Mendukung tamu domestik (KTP/SIM) maupun mancanegara (Paspor) dalam satu alur check-in yang sama, tanpa proses terpisah.

### 1.3 Ruang Lingkup (Scope)

**Termasuk dalam MVP:**
- Autentikasi berbasis role (Resepsionis & Manajer)
- Manajemen denah & inventaris kamar
- Alur reservasi & check-in (RedDoorz + Walk-in) dengan OCR multi dokumen identitas (KTP/Paspor/SIM)
- Otomasi notifikasi WhatsApp pengingat check-out
- Alur check-out & invoice digital + cetak thermal
- Dashboard analitik manajerial + ekspor Excel/PDF
- Audit trail aktivitas staf

**Di luar lingkup MVP (Future Phase):**
- Integrasi Channel Manager multi-OTA (Traveloka, Agoda, dll — hanya RedDoorz di MVP)
- Modul housekeeping terpisah (checklist kebersihan per kamar)
- Modul HRD/payroll staf
- Aplikasi mobile native untuk tamu (guest self check-in)
- Sistem loyalti/membership tamu

### 1.4 Definisi & Istilah

| Istilah | Penjelasan |
|---|---|
| PMS | Property Management System |
| OCR | Optical Character Recognition — ekstraksi teks dari gambar |
| Walk-in | Tamu yang datang langsung tanpa reservasi online |
| RedDoorz | Platform OTA (Online Travel Agent) mitra hotel |
| NIK | Nomor Induk Kependudukan (16 digit, dari KTP) — salah satu jenis nomor identitas yang didukung sistem |
| MRZ | Machine Readable Zone — dua/tiga baris teks berformat tetap di halaman biodata Paspor, dipakai untuk ekstraksi data terstruktur |
| JWT | JSON Web Token — mekanisme sesi login |
| RBAC | Role-Based Access Control |

---

## 2. User Persona & Hak Akses (RBAC)

### 2.1 Persona 1: Resepsionis (Frontdesk Officer)

- **Karakteristik:** Fokus pada kecepatan pelayanan pelanggan di lobi, penggunaan aplikasi di PC kasir/tablet resepsionis, bekerja dalam sistem shift.
- **Tanggung Jawab:** Validasi ketersediaan kamar, melayani *check-in/check-out*, memindai identitas tamu, mencetak invoice kasir.
- **Pain point utama:** Tekanan waktu saat antrean tamu banyak, risiko human error saat mengetik nomor identitas panjang (NIK/Paspor/SIM).

### 2.2 Persona 2: Manajer Hotel (Property Manager)

- **Karakteristik:** Fokus pada kontrol inventaris, analisis keuntungan, pengawasan staf, dan pelaporan berkala kepada pemilik hotel.
- **Tanggung Jawab:** Menambah/mengubah/menonaktifkan kamar, memantau rasio okupansi, mengunduh rekapitulasi data periodik.
- **Pain point utama:** Tidak ada visibilitas real-time, laporan manual memakan waktu, sulit mendeteksi anomali transaksi staf.

### 2.3 Matriks Hak Akses (Role-Based Access Control)

| Modul / Fitur | Resepsionis | Manajer |
|---|---|---|
| Visual Grid Denah Kamar | View & Interaksi | View Only |
| Proses Check-in (Scan KTP/Paspor/SIM & Input Durasi) | Penuh (Create/Edit) | Tidak Ada Akses |
| Proses Check-out & Cetak Invoice Tamu | Penuh | View Only |
| Trigger Manual / Resend WhatsApp Reminder | Penuh | View Only |
| Tambah, Ubah, Hapus Kamar (Inventory) | Tidak Ada Akses | Penuh (CRUD) |
| Dashboard Rekapitulasi Check-in/Check-out Bulanan | Terbatas Hari Ini | Penuh (Semua Periode) |
| Ekspor Laporan Format Excel (.xlsx) | Tidak Ada Akses | Penuh |
| Ekspor Laporan Format PDF Resmi (.pdf) | Tidak Ada Akses | Penuh |
| Audit Trail & Log Transaksi Staf | Tidak Ada Akses | Penuh |

---

## 3. Spesifikasi Kebutuhan Fungsional (Functional Requirements)

### 3.1 Modul 1: Autentikasi & Sesi Pengguna (AUTH)

| ID | Requirement |
|---|---|
| FR-AUTH-01 | Sistem menyediakan halaman login tunggal dengan autentikasi berbasis kredensial (Username & Password terenkripsi bcrypt). |
| FR-AUTH-02 | Sistem menerapkan sesi berbasis JWT dengan masa kedaluwarsa token 12 jam (sesuai shift kerja resepsionis). |
| FR-AUTH-03 | *Role-Based Redirection*: Pengguna dengan role `RECEPTIONIST` diarahkan langsung ke Dashboard Denah Kamar, sedangkan role `MANAGER` diarahkan ke Dashboard Analitik Eksekutif. |
| FR-AUTH-04 | Sistem melakukan auto-logout otomatis saat token kedaluwarsa, dengan redirect ke halaman login dan pesan notifikasi yang jelas. |
| FR-AUTH-05 | Password disimpan dengan hashing bcrypt (cost factor minimum 10), tidak pernah disimpan/ditampilkan dalam bentuk plain text di log manapun. |

### 3.2 Modul 2: Denah & Ketersediaan Kamar (ROOM MANAGEMENT)

| ID | Requirement |
|---|---|
| FR-ROOM-01 | Sistem menampilkan denah seluruh kamar hotel dalam bentuk kartu grid interaktif. |
| FR-ROOM-02 | Indikator status warna: **Hijau** (Available — kamar kosong, bersih, siap ditempati), **Merah** (Occupied — kamar sedang terisi tamu aktif), **Kuning** (Dirty/Approaching Checkout — kamar baru ditinggalkan tamu atau H-1 jam sebelum batas sewa), **Abu-abu** (Under Maintenance — dinonaktifkan manajer karena renovasi/kerusakan). |
| FR-ROOM-03 | Resepsionis dapat memfilter tampilan berdasarkan tipe kamar (Standard, Superior, Deluxe, Family) dan lantai kamar. |
| FR-ROOM-04 | Manajer dapat menambah unit kamar baru (Nomor Kamar, Lantai, Tipe, Harga Dasar per Malam, Fasilitas). |
| FR-ROOM-05 | Manajer dapat mengedit tarif kamar atau mengubah status ke *Maintenance*. |
| FR-ROOM-06 | Manajer dapat menghapus kamar dengan ketentuan kamar tersebut tidak memiliki riwayat reservasi aktif (soft-delete/validasi constraint). |
| FR-ROOM-07 | Status kamar diperbarui secara real-time (polling/websocket) agar seluruh sesi resepsionis yang aktif melihat perubahan status tanpa perlu refresh manual. |

### 3.3 Modul 3: Alur Reservasi & Check-In (RESERVATION & OCR)

| ID | Requirement |
|---|---|
| FR-RES-01 | Resepsionis mengklik kamar berstatus Hijau (Available), lalu modal/dialog pemesanan terbuka. |
| FR-RES-02 | Pilihan kanal pemesanan: **RedDoorz (Online)** — mewajibkan input RedDoorz Booking Code, tarif mengikuti nominal platform; **Offline (Walk-in)** — menggunakan tarif standar hotel (dinamis, diatur manajer). |
| FR-RES-03 | Resepsionis memilih jenis dokumen identitas tamu terlebih dahulu (**KTP**, **Paspor**, atau **SIM**), lalu sistem mengaktifkan kamera perangkat atau opsi unggah berkas foto dokumen tersebut; mesin OCR mengekstraksi otomatis Nomor Identitas (format sesuai jenis dokumen), Nama Lengkap, Alamat (jika tersedia pada dokumen), dan Kewarganegaraan (khusus Paspor, diambil dari MRZ). |
| FR-RES-04 | Form terisi otomatis oleh data OCR, kolom tetap dapat disunting manual jika foto buram/terjadi kesalahan pembacaan karakter — berlaku sama untuk KTP, Paspor, maupun SIM. Wajib mengisi nomor WhatsApp aktif tamu (validasi format `+62` atau `08...`). |
| FR-RES-05 | Input tanggal & jam check-in serta rencana tanggal & jam check-out (standar checkout: 12:00 WIB). Sistem mengalkulasi otomatis Total Bayar = Jumlah Malam × Tarif Kamar. |
| FR-RES-06 | Pilihan metode bayar: Cash, QRIS, Transfer Bank, atau Paid via RedDoorz App. Setelah "Simpan & Check-in" ditekan: status kamar → Merah, data tersimpan ke database, scheduler WhatsApp diaktifkan. |
| FR-RES-07 | Sistem melakukan validasi anti-duplikasi: kombinasi jenis dokumen + nomor identitas yang sama tidak dapat digunakan untuk check-in di dua kamar berbeda secara bersamaan. Nomor yang sama dari jenis dokumen berbeda (mis. KTP vs Paspor) dianggap identitas berbeda. |
| FR-RES-08 | Jika koneksi internet terputus saat proses input, data form tersimpan sementara secara lokal (offline-caching) dan dikirim ulang otomatis saat koneksi pulih. |

### 3.4 Modul 4: Otomasi Notifikasi WhatsApp (WHATSAPP GATEWAY)

| ID | Requirement |
|---|---|
| FR-WA-01 | Sistem cron-job backend mengecek status reservasi aktif setiap 10 menit. |
| FR-WA-02 | Saat sisa waktu menginap menyentuh H-60 menit sebelum jam batas check-out, sistem otomatis memicu API WhatsApp Gateway. |
| FR-WA-03 | Template pesan pengingat check-out (lihat lampiran template di bawah). |
| FR-WA-04 | Resepsionis memiliki tombol pemicu manual di dashboard jika pesan otomatis gagal terkirim (misal jaringan tamu sempat terputus). |
| FR-WA-05 | Sistem mencatat status pengiriman pesan (Sent/Delivered/Read/Failed) berdasarkan callback webhook dari gateway, dan menampilkannya di UI resepsionis. |

**Template Pesan (FR-WA-03):**
```
Yth. Bpk/Ibu [Nama Tamu],

Terima kasih telah menginap di Hotel Sinar Harapan (Mitra RedDoorz).
Kami menginformasikan bahwa waktu check-out untuk Kamar [Nomor Kamar]
adalah pukul [Jam Check-out] WIB (tersisa 1 jam lagi).

Mohon pastikan seluruh barang bawaan Anda tidak tertinggal. Jika Anda
memerlukan bantuan staf atau perpanjangan durasi menginap, silakan
hubungi meja resepsionis.

Salam hangat,
Manajemen Hotel Sinar Harapan
```

### 3.5 Modul 5: Alur Check-Out & Pembuatan Faktur (INVOICE)

| ID | Requirement |
|---|---|
| FR-OUT-01 | Resepsionis mengklik kamar berstatus Merah/Kuning, lalu memilih tombol "Proses Check-out". |
| FR-OUT-02 | Form check-out menyediakan opsi input biaya tambahan (denda late check-out, minibar/laundry, penggantian kerusakan properti). |
| FR-OUT-03 | Sistem membuat nomor invoice unik otomatis (Format: `INV/SH/YYYYMMDD/XXXX`). Pratinjau invoice berisi: Logo Hotel Sinar Harapan, Logo Mitra RedDoorz, Nomor Kamar, Identitas Tamu, Saluran Reservasi, Rincian Waktu Inap, Total Biaya, Nama Resepsionis bertugas. Fitur cetak langsung ke thermal printer (58mm/80mm) atau unduh PDF. |
| FR-OUT-04 | Setelah konfirmasi selesai, status kamar berubah menjadi Kuning (Dirty/Needs Cleaning), resepsionis dapat mengembalikannya ke Hijau (Available) setelah kamar selesai dibersihkan. |
| FR-OUT-05 | Sistem menghitung otomatis denda late check-out apabila `actual_check_out_time` melewati `expected_check_out_time`, dengan aturan tarif yang dapat dikonfigurasi manajer. |

### 3.6 Modul 6: Analitik Manajerial & Rekapitulasi (REPORTING ENGINE)

| ID | Requirement |
|---|---|
| FR-REP-01 | Executive Dashboard Widgets: Total Check-in (hari ini/bulan berjalan/rentang kustom), Total Check-out, Rasio Okupansi (Kamar Terisi ÷ Total Kamar Aktif × 100%), Komposisi Saluran Pemesanan (pie chart RedDoorz vs Walk-in), Total Akumulasi Pendapatan Bersih. |
| FR-REP-02 | Tabel rekapitulasi transaksi lengkap dengan filter rentang tanggal, tipe kamar, dan metode pembayaran. |
| FR-REP-03 | Ekspor Excel via endpoint `/api/reports/export-excel?startDate=...&endDate=...`. Berisi 2 sheet: *Summary KPI* dan *Raw Data Detail Transaksi* (No. Invoice, Tanggal, No. Kamar, Jenis Dokumen, Nomor Identitas, Nama, No. WA, Sumber, Check-in, Check-out, Total Biaya, Operator). |
| FR-REP-04 | Ekspor PDF format A4 resmi dengan kop surat Hotel Sinar Harapan x RedDoorz, tabel rangkuman performa bulanan, grafik visual okupansi, kolom tanda tangan pengesahan Manajer. |
| FR-REP-05 | Data sensitif (nomor identitas KTP/Paspor/SIM, nomor WA) pada ekspor laporan hanya dapat diunduh oleh role MANAGER dan tercatat pada audit log setiap kali diunduh. |

---

## 4. Spesifikasi Non-Fungsional (Non-Functional Requirements)

### 4.1 Performa
- Pemuatan grid denah kamar (*Room Grid Load Time*) tidak boleh melebihi **1,5 detik** pada koneksi internet standar (10 Mbps).
- Proses pembacaan OCR dokumen identitas (KTP/Paspor/SIM) hingga memunculkan teks di form maksimal **3 detik**.
- Endpoint API rata-rata merespons di bawah 500ms (p95) untuk operasi baca (read), dan di bawah 1 detik untuk operasi tulis (write) transaksional.

### 4.2 Ketersediaan & Keandalan
- Sistem backend beroperasi dengan target *uptime* **99,5%**.
- Fitur *offline-caching* sederhana pada Flutter agar resepsionis tidak kehilangan data input formulir jika terjadi gangguan internet mendadak.
- Mekanisme retry otomatis untuk pengiriman WhatsApp yang gagal (maksimum 3 kali percobaan dengan backoff).

### 4.3 Keamanan Data & Privasi
- Data identitas sensitif (foto dokumen KTP/Paspor/SIM dan nomor identitasnya) disimpan di penyimpanan cloud terenkripsi (*encrypted at rest* menggunakan AES-256).
- Akses URL foto dokumen identitas menggunakan *signed URL* sementara (kedaluwarsa dalam 15 menit) sehingga tidak dapat diakses publik secara bebas.
- Seluruh komunikasi client-server wajib menggunakan protokol HTTPS/TLS 1.3.
- Kepatuhan terhadap prinsip perlindungan data pribadi sesuai UU PDP (Perlindungan Data Pribadi) Indonesia — minimisasi data, retensi terbatas, akses berbasis peran.

### 4.4 Kompatibilitas Antarmuka
- UI Flutter dioptimalkan untuk rasio layar desktop monitor resepsionis (1920x1080) dan layar tablet kasir landscape (min. 10 inci).
- Target tap area minimum 44x44px untuk kenyamanan penggunaan sentuh.

### 4.5 Skalabilitas & Maintainability
- Arsitektur backend modular (NestJS module terpisah per domain — lihat `backend.md` §3) agar mudah menambah properti/hotel baru di masa depan (multi-tenant ready).
- Kode wajib melalui code review sebelum merge ke branch production.

---

## 5. Arsitektur Teknis (Ringkasan)

Lihat detail lengkap pada **`arsitektur.md`** dan **`backend.md`**. Ringkasan stack:

- **Frontend:** Flutter (Web/Desktop/Tablet) — lihat `frontend.md`
- **Backend:** NestJS (Controller/Service/Module, Guards untuk RBAC, `@nestjs/schedule` untuk Cron)
- **Database:** PostgreSQL (VPS self-hosted atau Supabase / Prisma ORM)
- **OCR:** Google Cloud Vision API — mendukung multi jenis dokumen (KTP, Paspor via parsing MRZ, SIM)
- **WhatsApp Gateway:** Fonnte / Wablas API
- **Storage:** Foto dokumen identitas (KTP/Paspor/SIM) terenkripsi
- **Report Engine:** ExcelJS (.xlsx) / @react-pdf (.pdf)

---

## 6. Skema Database Relasional (Ringkasan)

Lihat detail lengkap (DDL, index, constraint) pada **`arsitektur.md`**. Entitas utama:

1. `users` — akun & role staf
2. `rooms` — master inventaris kamar
3. `guests` — data induk tamu
4. `reservations` — transaksi reservasi/check-in/check-out
5. `activity_logs` — audit trail aktivitas sistem

---

## 7. Rencana Pelaksanaan Sprint & Tenggat Waktu (8 Minggu)

| Periode | Milestone / Fokus Pengerjaan | Luaran Utama (Deliverables) |
|---|---|---|
| **Sprint 1 (W1–W2)** | Arsitektur Fondasi, Desain UI/UX & DB Schema | Figma/Design System (Web Kasir & Dashboard Manajer); Skema Database PostgreSQL & Konfigurasi Auth JWT; Setup Project Flutter & Next.js App Router |
| **Sprint 2 (W3–W4)** | Manajemen Kamar & Modul OCR Scanner Multi Dokumen | CRUD Kamar (Fitur Manajer); Grid Denah Kamar Visual Interaktif (Flutter); Integrasi Google Vision API untuk Ekstraksi KTP/Paspor(MRZ)/SIM |
| **Sprint 3 (W5–W6)** | Alur Check-in, Check-out & WA Automation | Transaksi Reservasi (RedDoorz vs Walk-in); Setup Cron Scheduler & Integrasi WhatsApp Gateway; Cetak Struk / Generator PDF Invoice Otomatis |
| **Sprint 4 (W7)** | Pelaporan Eksekutif, Ekspor Data & QA | Dashboard Analitik Manajer (Grafik Okupansi & Omzet); Generator Ekspor Laporan Excel (.xlsx) & PDF (.pdf); Pengujian Fungsional End-to-End & UAT |
| **Sprint 5 (W8)** | Deployment, Training Staf & Handover | Deployment Server Produksi & Cloud Storage; Pelatihan Staf Resepsionis & Manajer; Serah Terima Proyek (Final Acceptance Sign-Off) |

---

## 8. Definition of Done (DoD) & Kriteria Penerimaan (UAT)

Sebuah fitur/modul dinyatakan selesai (*Done*) dan siap diserahkan ke Hotel Sinar Harapan apabila memenuhi parameter berikut:

### 8.1 Penerimaan Fungsional
- Alur check-in berhasil membaca nomor identitas (KTP/Paspor/SIM) tamu dan memunculkannya pada form dalam waktu kurang dari 3 detik.
- Pesan WhatsApp otomatis terkirim dan diterima di nomor tamu tepat pada saat waktu sewa menyisakan H-1 jam sebelum check-out.
- Struk invoice dapat dicetak dan formatnya rapi sesuai identitas hotel.
- File Excel dan PDF hasil unduhan manajer menyajikan data agregat matematis yang akurat dan dapat dibuka tanpa kendala formatting.

### 8.2 Kualitas Teknis
- Bebas dari *critical bug* atau *system crash* saat dilakukan uji coba beban bergantian.
- Kode telah melalui tahapan code review dan berhasil di-merge ke branch utama (production).
- Seluruh endpoint API tervalidasi dengan skenario unit test & integration test minimum untuk jalur kritis (check-in, check-out, ekspor laporan).

### 8.3 Kriteria UAT (User Acceptance Test)
- Resepsionis dapat menyelesaikan simulasi check-in end-to-end tanpa bantuan developer.
- Manajer dapat mengunduh laporan bulanan dan memverifikasi kecocokan angka dengan pencatatan manual paralel selama periode transisi.
- Tidak ditemukan kebocoran data tamu (foto dokumen identitas/nomor identitas) yang dapat diakses tanpa otorisasi saat dilakukan audit keamanan dasar.

---

## 9. Risiko & Mitigasi

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Akurasi OCR rendah pada dokumen buram/rusak (KTP/Paspor/SIM) | Perlambatan proses check-in | Fallback input manual selalu tersedia (FR-RES-04); indikator confidence score OCR |
| Rate limit / downtime API Google Vision | Check-in terhambat | Timeout + fallback ke input manual otomatis setelah 3 detik |
| Gagal kirim WhatsApp (nomor tidak aktif/API down) | Tamu tidak menerima pengingat | Tombol resend manual (FR-WA-04) + log status pengiriman |
| Koneksi internet lobi tidak stabil | Data input hilang | Offline-caching Flutter + auto-retry sinkronisasi |
| Kebocoran data identitas tamu (KTP/Paspor/SIM) | Pelanggaran privasi, reputasi hotel | Enkripsi AES-256 at rest, signed URL 15 menit, akses RBAC ketat |

---

## 10. Lampiran — Glosarium Status Kamar

| Warna | Status | Kondisi |
|---|---|---|
| 🟩 Hijau | AVAILABLE | Kamar kosong, bersih, siap ditempati |
| 🟥 Merah | OCCUPIED | Kamar sedang terisi tamu aktif |
| 🟨 Kuning | DIRTY | Baru ditinggalkan tamu / H-1 jam sebelum checkout |
| ⬜ Abu-abu | MAINTENANCE | Dinonaktifkan manajer (renovasi/kerusakan) |
