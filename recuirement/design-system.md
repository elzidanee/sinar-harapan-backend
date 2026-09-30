# 🎨 Design System
## Sinar Harapan Frontdesk & Property Management System (PMS)

---

## Dokumen Kontrol

| Item | Detail |
|---|---|
| Versi | 1.0 — Baseline |
| Target Platform | Tablet landscape 10"+ (utama), Desktop 1920x1080 (sekunder) |
| Arahan Gaya | Profesional, modern, clean, data-forward — bukan gaya dekoratif/marketing |
| Terkait | `prd.md`, `arsitektur.md` |

---

## 1. Prinsip Desain

1. **Kejelasan di atas dekorasi.** Ini adalah alat operasional yang dipakai resepsionis di bawah tekanan waktu — setiap elemen visual harus punya fungsi, bukan hiasan.
2. **Skala warna disiplin.** Navy sebagai warna struktural dominan, oranye sebagai satu-satunya aksen untuk aksi utama — tidak pernah membanjiri layar.
3. **Flat & datar, bukan glossy.** Tidak ada glassmorphism, gradient ungu-biru generik, shadow tebal, atau ikon 3D — ciri khas "AI slop" yang harus dihindari secara eksplisit.
4. **Touch-first.** Semua target sentuh minimum 44x44px, spacing longgar antar elemen interaktif untuk mencegah salah tap di tablet.
5. **Skimmable.** Resepsionis dan manajer harus bisa memindai status penting (warna kamar, KPI) dalam hitungan detik tanpa membaca teks panjang.

---

## 2. Palet Warna

### 2.1 Warna Brand (terinspirasi dari kombinasi navy + oranye ala NasDem — digunakan murni sebagai bahasa warna korporat, bukan referensi politik)

| Token | Hex | Penggunaan |
|---|---|---|
| `color/navy/900` | `#001B4E` | Header utama, sidebar, teks pada background terang untuk elemen struktural terkuat |
| `color/navy/700` | `#0A2A6E` | Warna brand utama — tombol sekunder, ikon aktif, elemen navigasi |
| `color/navy/500` | `#1E4499` | Hover state, elemen interaktif tingkat menengah |
| `color/navy/100` | `#E6EBF7` | Background halus untuk highlight ringan, badge non-status |
| `color/orange/600` | `#FF6600` | **Satu-satunya** warna aksen — CTA utama, tab aktif, indikator penting |
| `color/orange/500` | `#FF7A1A` | Hover/pressed state pada elemen oranye |
| `color/orange/100` | `#FFEBDB` | Background halus untuk badge/alert ringan bernuansa oranye |

> **Aturan pemakaian oranye:** maksimal satu elemen oranye dominan per layar/viewport (misal satu tombol CTA utama). Jangan gunakan oranye untuk elemen dekoratif, ikon pasif, atau lebih dari satu CTA sejajar.

### 2.2 Warna Netral

| Token | Hex | Penggunaan |
|---|---|---|
| `color/neutral/bg` | `#F7F8FA` | Background utama aplikasi |
| `color/neutral/surface` | `#FFFFFF` | Kartu, modal, panel |
| `color/neutral/border` | `#E2E5EB` | Border tipis 1px antar elemen |
| `color/neutral/text-primary` | `#1E2430` | Teks judul & body utama |
| `color/neutral/text-secondary` | `#6B7280` | Teks label, caption, metadata |
| `color/neutral/text-disabled` | `#B0B5BE` | Teks/ikon nonaktif |

### 2.3 Warna Status (Independen dari warna brand — jangan dicampur dengan navy/oranye)

| Token | Hex | Status Kamar / Konteks |
|---|---|---|
| `color/status/available` | `#22C55E` (hijau) | Kamar kosong, siap ditempati |
| `color/status/occupied` | `#EF4444` (merah) | Kamar terisi tamu aktif |
| `color/status/dirty` | `#F59E0B` (amber) | Kamar kotor / mendekati checkout |
| `color/status/maintenance` | `#9CA3AF` (abu-abu) | Kamar dinonaktifkan |
| `color/status/success-bg` | `#DCFCE7` | Background notifikasi sukses |
| `color/status/error-bg` | `#FEE2E2` | Background notifikasi gagal |
| `color/status/warning-bg` | `#FEF3C7` | Background notifikasi peringatan |

### 2.4 Dark Mode (opsional, referensi untuk fase berikutnya)

| Token | Hex |
|---|---|
| `dark/bg` | `#0F1420` |
| `dark/surface` | `#1A2033` |
| `dark/border` | `#2A3348` |
| `dark/text-primary` | `#F1F3F7` |

---

## 3. Tipografi

**Font family:** `Plus Jakarta Sans` (primer) dengan fallback `Inter`, `-apple-system`, `sans-serif` — geometric sans yang tegas, modern, dan tetap hangat, menghindari kesan default/generik dari font seperti Roboto tanpa kustomisasi.

| Token | Ukuran | Weight | Line Height | Penggunaan |
|---|---|---|---|---|
| `type/display` | 32px | 700 (Bold) | 40px | Judul dashboard utama (mis. "Rp 45.200.000") |
| `type/h1` | 24px | 700 (Bold) | 32px | Judul halaman/section utama |
| `type/h2` | 20px | 600 (SemiBold) | 28px | Judul kartu, sub-section |
| `type/h3` | 16px | 600 (SemiBold) | 24px | Judul komponen kecil (nomor kamar di kartu) |
| `type/body-lg` | 16px | 400 (Regular) | 24px | Teks form, konten utama |
| `type/body` | 14px | 400 (Regular) | 20px | Teks default UI, tabel |
| `type/body-sm` | 13px | 500 (Medium) | 18px | Label form, tombol |
| `type/caption` | 12px | 400 (Regular) | 16px | Metadata, timestamp, helper text |
| `type/overline` | 11px | 600 (SemiBold), uppercase, letter-spacing 0.5px | 16px | Label kategori/status kecil |

**Aturan hierarki:** setiap layar maksimal menggunakan 3 tingkat tipografi aktif secara bersamaan agar tidak berisik secara visual.

---

## 4. Spacing & Grid System

### 4.1 Skala Spacing (basis 4px)

| Token | Nilai |
|---|---|
| `space/xs` | 4px |
| `space/sm` | 8px |
| `space/md` | 16px |
| `space/lg` | 24px |
| `space/xl` | 32px |
| `space/2xl` | 48px |
| `space/3xl` | 64px |

### 4.2 Grid Layout (Tablet Landscape 1280x800 sebagai basis)

- **Container margin:** 24px kiri-kanan
- **Kolom grid:** 12 kolom, gutter 16px
- **Sidebar (jika ada):** lebar tetap 240px (expanded) / 72px (collapsed, ikon saja)
- **Grid kamar (Room Grid):** 4–6 kolom kartu tergantung lebar layar, gap 16px antar kartu

### 4.3 Radius & Elevation

| Token | Nilai | Penggunaan |
|---|---|---|
| `radius/sm` | 6px | Badge, chip kecil |
| `radius/md` | 8px | Tombol, input field |
| `radius/lg` | 12px | Kartu, modal |
| `radius/full` | 999px | Avatar, pill badge |
| `elevation/none` | — | Default state (gunakan border 1px, bukan shadow) |
| `elevation/1` | `0 1px 2px rgba(16,24,40,0.05)` | Kartu hover ringan |
| `elevation/2` | `0 4px 12px rgba(16,24,40,0.08)` | Modal, dropdown, popover |

> **Larangan eksplisit:** tidak menggunakan shadow tebal/menyebar (`0 20px 60px`), tidak menggunakan blur/backdrop-filter (glassmorphism), tidak menggunakan gradient dekoratif pada background kartu.

---

## 5. Ikonografi

- **Gaya:** outline/line icon, stroke width konsisten 1.5–2px, sudut membulat ringan.
- **Library referensi:** Phosphor Icons / Lucide Icons (hindari ikon filled 3D, ikon glossy, atau ikon emoji-style berwarna-warni).
- **Ukuran standar:** 16px (inline teks), 20px (default UI), 24px (navigasi utama/header).
- **Warna ikon:** mengikuti `color/neutral/text-secondary` untuk ikon pasif, `color/navy/700` untuk ikon aktif/terpilih, `color/orange/600` hanya untuk ikon di dalam CTA utama.

---

## 6. Komponen UI (Component Library)

### 6.1 Tombol (Button)

| Varian | Background | Teks | Penggunaan |
|---|---|---|---|
| Primary | `color/orange/600` | Putih | Satu CTA utama per layar (mis. "Simpan & Check-in") |
| Secondary | `color/navy/700` | Putih | Aksi penting non-CTA-utama (mis. "Cetak Invoice") |
| Outline | Transparan, border `color/navy/700` | `color/navy/700` | Aksi sekunder (mis. "Unduh PDF", "Batal") |
| Ghost/Text | Transparan | `color/navy/700` | Aksi tersier, link dalam tabel |
| Destructive | `color/status/occupied` (merah) | Putih | Hapus kamar, batalkan reservasi |

**Spesifikasi:** tinggi minimum 48px (touch-friendly), padding horizontal 20px, radius `radius/md`, font `type/body-sm` weight 600.

### 6.2 Kartu Kamar (Room Card) — Komponen Kunci

```
┌─────────────────────────┐
│ ▍ 101                   │  ← garis tipis 4px di sisi kiri = warna status
│   Standard · Lt. 1       │
│                          │
│   ● Available            │  ← dot indicator + label teks (bukan full-fill warna)
└─────────────────────────┘
```
- Background kartu selalu putih/netral — warna status **hanya** pada aksen garis kiri (4px) + dot kecil, TIDAK mengisi seluruh kartu dengan warna solid. Ini menjaga grid tetap "clean" saat dilihat sekaligus, alih-alih menjadi blok warna yang berisik.
- Ukuran kartu: min 140x100px, radius `radius/lg`, border 1px `color/neutral/border`.
- State hover/pressed: elevation naik ke `elevation/1`, border berubah ke `color/navy/500`.

### 6.3 Badge Status

| Status | Background | Teks/Dot |
|---|---|---|
| Available | `#DCFCE7` | `#16A34A` |
| Occupied | `#FEE2E2` | `#DC2626` |
| Dirty | `#FEF3C7` | `#D97706` |
| Maintenance | `#F3F4F6` | `#6B7280` |

Format: dot 8px + label teks `type/caption` weight 600, padding 4px 10px, radius `radius/full`.

### 6.4 Input Field

- Tinggi 48px, border 1px `color/neutral/border`, radius `radius/md`.
- Focus state: border 2px `color/navy/700`, tanpa glow/shadow berlebihan.
- Error state: border `color/status/occupied`, helper text merah di bawah field.
- Field hasil OCR auto-fill: tambahkan tag kecil `type/caption` berlabel "Diisi otomatis" dengan background `color/navy/100`, dapat dihapus/diedit langsung oleh user.

### 6.5 Modal / Dialog

- Max-width 720px (form check-in), radius `radius/lg`, elevation `elevation/2`.
- Header modal: `type/h2` + tombol close (ikon X, 24px) kanan atas.
- Footer modal: tombol aksi rata kanan, urutan [Batal (outline)] → [Aksi Utama (primary orange)].

### 6.6 Tabel Data (Transaction Table)

- Header tabel: background `color/navy/100`, teks `type/overline`, uppercase.
- Baris: padding vertikal 12px, border-bottom 1px `color/neutral/border` (tanpa garis vertikal antar kolom agar tetap ringan).
- Hover baris: background `color/neutral/bg`.
- Kolom angka (nominal): rata kanan, tabular numerals.

### 6.7 KPI Card (Dashboard Manajer)

```
┌───────────────────────────┐
│ TOTAL CHECK-IN              │ ← type/overline, text-secondary
│ 128                         │ ← type/display, navy/900
│ ▲ 12% vs bulan lalu          │ ← type/caption, orange/600 untuk tren positif
└───────────────────────────┘
```
Background putih, border 1px, radius `radius/lg`, padding `space/lg`. Tidak ada ikon besar dekoratif di dalam kartu KPI — angka adalah fokus utama.

### 6.8 Grafik (Charts)

- Palet grafik: `navy/700` dan `orange/600` sebagai dua warna utama untuk perbandingan (mis. RedDoorz vs Walk-in).
- Tanpa efek 3D, tanpa gradient fill pada bar/pie chart — flat solid color.
- Gridlines tipis dan halus (`color/neutral/border`), sumbu dengan `type/caption`.
- Tooltip: background `color/navy/900`, teks putih, radius `radius/sm`.

### 6.9 Navigasi (Sidebar / Top Bar)

- **Top bar (Receptionist):** background `color/navy/900`, height 64px, berisi logo, nama user, jam shift, ikon logout. Teks/ikon putih.
- **Sidebar (Manager):** background `color/navy/900`, item aktif ditandai dengan indikator garis kiri `color/orange/600` 3px + background `color/navy/700` transparan 10%.
- Tab filter (mis. filter tipe kamar): pill-style, aktif = background `color/navy/700` teks putih, non-aktif = outline `color/neutral/border` teks `text-secondary`.

---

## 7. Tone Visual per Layar

| Layar | Prioritas Visual |
|---|---|
| Login | Navy dominan, satu aksen oranye pada tombol masuk, tanpa foto/ilustrasi dekoratif |
| Room Grid (Resepsionis) | Netral/putih dominan, warna status sebagai aksen minor per kartu (bukan blok warna penuh) |
| Modal Check-in (OCR) | Form-first, whitespace luas antar field, satu CTA oranye di akhir |
| Check-out & Invoice | Bagian input (form) netral; bagian preview invoice dirender formal seperti struk asli (border tegas, tipografi lebih kaku/formal) |
| Dashboard Manajer | Data-forward, KPI card + grafik flat, dua tombol ekspor outline di kanan atas (tidak kompetisi visual dengan CTA oranye) |

---

## 8. Aksesibilitas & Kontras

- Kontras teks minimum WCAG AA (4.5:1) untuk seluruh kombinasi teks/background dalam palet ini — sudah diverifikasi untuk `navy/900` di atas putih dan putih di atas `navy/900`/`orange/600`.
- Warna status tidak pernah menjadi satu-satunya penanda — selalu disertai label teks/ikon (penting untuk pengguna dengan buta warna, terutama membedakan merah/hijau pada grid kamar).
- Target sentuh minimum 44x44px di seluruh elemen interaktif tablet.

---

## 9. Hal yang Harus Dihindari ("Anti AI-Slop" Checklist)

Gunakan daftar ini sebagai checklist review sebelum desain final disetujui:

- ❌ Gradient ungu-ke-biru atau ungu-ke-pink generik
- ❌ Glassmorphism / efek blur transparan berlebihan
- ❌ Ikon 3D glossy atau ikon bergaya emoji berwarna-warni
- ❌ Drop shadow tebal & menyebar luas di bawah kartu
- ❌ Ilustrasi hero/stock generik yang tidak relevan dengan konteks hotel
- ❌ Lebih dari satu warna aksen (oranye) dominan dalam satu viewport
- ❌ Kartu status kamar yang di-fill warna solid penuh (harus tetap netral + aksen tipis)
- ❌ Font default tanpa kustomisasi hierarki (semua ukuran/berat teks terlihat sama)
- ✅ Sebagai gantinya: flat, border tipis, whitespace luas, satu aksen warna terkontrol, tipografi berhierarki jelas, ikon line-style konsisten.

---

## 10. Token Ringkasan (untuk implementasi Flutter `theme.dart`)

```dart
// Contoh referensi token warna — sesuaikan dengan struktur ThemeData Flutter
class AppColors {
  static const navy900 = Color(0xFF001B4E);
  static const navy700 = Color(0xFF0A2A6E);
  static const navy500 = Color(0xFF1E4499);
  static const navy100 = Color(0xFFE6EBF7);

  static const orange600 = Color(0xFFFF6600);
  static const orange500 = Color(0xFFFF7A1A);
  static const orange100 = Color(0xFFFFEBDB);

  static const bg = Color(0xFFF7F8FA);
  static const surface = Color(0xFFFFFFFF);
  static const border = Color(0xFFE2E5EB);
  static const textPrimary = Color(0xFF1E2430);
  static const textSecondary = Color(0xFF6B7280);

  static const statusAvailable = Color(0xFF22C55E);
  static const statusOccupied = Color(0xFFEF4444);
  static const statusDirty = Color(0xFFF59E0B);
  static const statusMaintenance = Color(0xFF9CA3AF);
}
```
