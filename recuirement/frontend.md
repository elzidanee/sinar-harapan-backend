# 📱 frontend.md
## Frontend Implementation Spec — Sinar Harapan PMS (Flutter)
### Ditulis untuk dikonsumsi oleh AI coding agent (Claude Code / agent sejenis)

---

> **CARA MEMBACA DOKUMEN INI (untuk agent):**
> Dokumen ini adalah pasangan dari `backend.md` — kalau `backend.md` mengatur server, dokumen ini
> mengatur aplikasi Flutter yang dipakai resepsionis (tablet/desktop) dan manajer (desktop).
> Ikuti struktur folder, state management, dan urutan implementasi PERSIS seperti di sini.
> Jika ada ambiguitas dengan `arsitektur.md`/`design-system.md`/`endpoint.md`, **dokumen ini yang
> menang** untuk hal teknis implementasi kode Flutter, karena paling rinci untuk keperluan coding.

---

## 0. Ringkasan Proyek

```yaml
nama_proyek: Sinar Harapan Frontdesk & Property Management System (PMS) — Frontend
framework: Flutter (Web build utama untuk tablet/desktop; APK Android sebagai opsi kios)
bahasa: Dart (null-safety wajib aktif — sudah default di Flutter modern)
state_management: Riverpod (StateNotifier/AsyncNotifier)
routing: GoRouter dengan role-based redirect guard
http_client: Dio + interceptor (JWT attach, refresh, error mapping)
local_storage: Hive (offline-cache form) + flutter_secure_storage (token JWT)
target_platform_utama: Web (dibuka via browser Chrome kios di tablet 10"+ landscape & desktop 1920x1080)
target_platform_sekunder: Android APK (tablet kasir, mode kios) — opsional, roadmap
backend_yang_dikonsumsi: NestJS API sesuai backend.md & endpoint.md
dokumen_rujukan:
  - prd.md            # fitur & business rules
  - design-system.md  # warna, tipografi, komponen, aturan visual
  - endpoint.md       # kontrak request/response tiap endpoint
  - business-flow.md  # alur yang harus direfleksikan di UI
  - arsitektur.md     # struktur folder level tinggi (dokumen ini lebih rinci)
```

---

## 1. Tech Stack & Versi yang Wajib Dipakai

| Kebutuhan | Package | Fungsi |
|---|---|---|
| State management | `flutter_riverpod` | Provider, StateNotifier, AsyncNotifier |
| Routing | `go_router` | Role-based routing, redirect guard |
| HTTP client | `dio` | Request ke backend + interceptor |
| Local DB ringan | `hive` + `hive_flutter` | Offline-cache form check-in |
| Secure storage | `flutter_secure_storage` | Simpan JWT (BUKAN SharedPreferences biasa) |
| Kamera & upload foto | `camera`, `image_picker` | Scan/upload dokumen identitas (KTP/Paspor/SIM) |
| Kompresi gambar | `flutter_image_compress` | Kompres foto dokumen sebelum upload (maks 1.5MB) |
| Charts | `fl_chart` | Grafik dashboard manajer (donut, bar) |
| Thermal printer | `esc_pos_printer` + `esc_pos_utils` | Cetak invoice ke printer 58mm/80mm |
| Download & simpan file | `dio` (download) + `file_saver` | Unduh Excel/PDF laporan |
| Format tanggal/uang | `intl` | Format Rupiah, format tanggal Indonesia |
| Ikon | `phosphor_flutter` atau `lucide_icons` | Sesuai gaya line-icon di `design-system.md` §5 |
| Font | Google Fonts package ATAU bundling font lokal | `Plus Jakarta Sans` sesuai `design-system.md` §3 |
| Testing | `flutter_test` (bawaan) + `mocktail` | Unit & widget test |
| Environment config | `--dart-define` (bawaan Flutter, tanpa package tambahan) | Beda base URL per environment |

**Perintah inisialisasi:**
```bash
flutter create sinar_harapan_frontend --org com.sinarharapan --platforms web,windows,linux,android
cd sinar_harapan_frontend

flutter pub add flutter_riverpod go_router dio hive hive_flutter \
  flutter_secure_storage camera image_picker flutter_image_compress \
  fl_chart intl phosphor_flutter file_saver

flutter pub add --dev mocktail build_runner hive_generator
```

---

## 2. Konfigurasi Environment (Base URL per Lingkungan)

Flutter tidak pakai file `.env` seperti backend — gunakan `--dart-define` saat build/run:

```bash
# Development (nunjuk ke localhost backend)
flutter run -d chrome --dart-define=API_BASE_URL=http://localhost:3000

# Staging
flutter build web --dart-define=API_BASE_URL=https://staging-api.sinarharapanpms.com

# Production
flutter build web --dart-define=API_BASE_URL=https://api.sinarharapanpms.com
```

Baca nilainya di kode:
```dart
// lib/core/config/app_config.dart
class AppConfig {
  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://localhost:3000',
  );
}
```

**Aturan agent:** JANGAN hardcode URL backend di widget mana pun — selalu lewat `AppConfig.apiBaseUrl`.

---

## 3. Struktur Folder Wajib (Feature-First)

```
lib/
├── main.dart                          # Entry point, ProviderScope, MaterialApp.router
├── app/
│   ├── router.dart                    # GoRouter + redirect guard berbasis role
│   └── theme.dart                     # Design tokens dari design-system.md
│
├── core/
│   ├── config/
│   │   └── app_config.dart            # Base URL, konstanta environment
│   ├── network/
│   │   ├── dio_client.dart            # Instance Dio + seluruh interceptor
│   │   ├── api_response.dart          # Model envelope {success, data, error}
│   │   └── api_exception.dart         # Custom exception dari error backend
│   ├── storage/
│   │   ├── secure_storage_service.dart # Wrapper flutter_secure_storage (token)
│   │   └── hive_boxes.dart             # Registrasi box Hive (offline cache)
│   ├── constants/
│   │   ├── app_colors.dart             # Persis design-system.md §10
│   │   └── room_status.dart            # Enum status kamar
│   └── utils/
│       ├── currency_formatter.dart     # Format Rupiah
│       ├── date_formatter.dart
│       └── validators.dart             # Validasi nomor identitas per idType, No. WA (cermin backend DTO)
│
├── features/
│   ├── auth/
│   │   ├── data/
│   │   │   ├── auth_repository.dart
│   │   │   └── auth_api.dart
│   │   ├── domain/
│   │   │   └── user_model.dart
│   │   └── presentation/
│   │       ├── login_screen.dart
│   │       └── auth_controller.dart    # Riverpod StateNotifier
│   │
│   ├── room_management/
│   │   ├── data/
│   │   │   ├── room_repository.dart
│   │   │   └── room_api.dart
│   │   ├── domain/
│   │   │   └── room_model.dart
│   │   └── presentation/
│   │       ├── room_grid_screen.dart
│   │       ├── room_card_widget.dart
│   │       ├── room_filter_bar.dart
│   │       ├── room_form_screen.dart    # CRUD kamar (manajer)
│   │       └── room_grid_controller.dart # polling 15 detik
│   │
│   ├── reservation/
│   │   ├── data/
│   │   │   ├── reservation_repository.dart
│   │   │   └── ocr_api.dart
│   │   ├── domain/
│   │   │   └── reservation_model.dart
│   │   └── presentation/
│   │       ├── checkin_modal.dart
│   │       ├── ocr_scanner_widget.dart
│   │       ├── reservation_form.dart
│   │       └── checkin_controller.dart
│   │
│   ├── checkout/
│   │   └── presentation/
│   │       ├── checkout_screen.dart
│   │       ├── invoice_preview_widget.dart
│   │       ├── thermal_print_service.dart
│   │       └── checkout_controller.dart
│   │
│   ├── reporting/
│   │   ├── data/
│   │   │   └── report_repository.dart
│   │   └── presentation/
│   │       ├── manager_dashboard_screen.dart
│   │       ├── kpi_card_widget.dart
│   │       ├── channel_composition_chart.dart
│   │       ├── occupancy_trend_chart.dart
│   │       ├── transaction_table_screen.dart
│   │       └── export_buttons_widget.dart
│   │
│   ├── audit_log/
│   │   └── presentation/
│   │       └── audit_log_screen.dart
│   │
│   └── shared_widgets/
│       ├── app_button.dart             # Primary/Secondary/Outline/Ghost/Destructive
│       ├── app_text_field.dart
│       ├── status_badge.dart
│       ├── app_modal.dart
│       └── loading_indicator.dart
│
└── l10n/                               # (opsional) lokalisasi jika dibutuhkan
```

**Aturan agent:** setiap feature folder punya `data/` (API call + repository), `domain/` (model murni), `presentation/` (widget + controller Riverpod). **Widget TIDAK BOLEH memanggil Dio langsung** — selalu lewat repository yang dipanggil dari controller/provider.

---

## 4. State Management & Arsitektur (Pola Riverpod Wajib)

### 4.1 Lapisan

```
UI (Widget) --> Controller (StateNotifier/AsyncNotifier) --> Repository --> API (Dio)
```

### 4.2 Contoh Lengkap: Room Grid (Referensi Pola untuk SEMUA Fitur Lain)

```dart
// features/room_management/domain/room_model.dart
class RoomModel {
  final String id;
  final String roomNumber;
  final String roomType;
  final int floor;
  final double basePricePerNight;
  final String status; // AVAILABLE, OCCUPIED, DIRTY, MAINTENANCE
  final DateTime updatedAt;

  RoomModel({
    required this.id,
    required this.roomNumber,
    required this.roomType,
    required this.floor,
    required this.basePricePerNight,
    required this.status,
    required this.updatedAt,
  });

  factory RoomModel.fromJson(Map<String, dynamic> json) => RoomModel(
        id: json['id'],
        roomNumber: json['roomNumber'],
        roomType: json['roomType'],
        floor: json['floor'],
        basePricePerNight: (json['basePricePerNight'] as num).toDouble(),
        status: json['status'],
        updatedAt: DateTime.parse(json['updatedAt']),
      );
}
```

```dart
// features/room_management/data/room_api.dart
class RoomApi {
  final Dio _dio;
  RoomApi(this._dio);

  Future<List<RoomModel>> fetchRoomStatus() async {
    final response = await _dio.get('/rooms/status');
    final data = response.data['data'] as List;
    return data.map((e) => RoomModel.fromJson(e)).toList();
  }
}
```

```dart
// features/room_management/data/room_repository.dart
class RoomRepository {
  final RoomApi _api;
  RoomRepository(this._api);

  Future<List<RoomModel>> getRoomStatus() => _api.fetchRoomStatus();
}
```

```dart
// features/room_management/presentation/room_grid_controller.dart
final roomGridProvider = AsyncNotifierProvider<RoomGridController, List<RoomModel>>(
  RoomGridController.new,
);

class RoomGridController extends AsyncNotifier<List<RoomModel>> {
  Timer? _pollingTimer;

  @override
  Future<List<RoomModel>> build() async {
    ref.onDispose(() => _pollingTimer?.cancel());
    _startPolling();
    return _fetch();
  }

  Future<List<RoomModel>> _fetch() async {
    final repo = ref.read(roomRepositoryProvider);
    return repo.getRoomStatus();
  }

  void _startPolling() {
    _pollingTimer = Timer.periodic(const Duration(seconds: 15), (_) async {
      state = await AsyncValue.guard(_fetch);
    });
  }

  Future<void> refreshNow() async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(_fetch);
  }
}
```

```dart
// features/room_management/presentation/room_grid_screen.dart
class RoomGridScreen extends ConsumerWidget {
  const RoomGridScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final roomsAsync = ref.watch(roomGridProvider);

    return roomsAsync.when(
      loading: () => const LoadingIndicator(),
      error: (err, _) => Center(child: Text('Gagal memuat data kamar: $err')),
      data: (rooms) => GridView.builder(
        padding: const EdgeInsets.all(24),
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 5, // sesuaikan dengan lebar layar, lihat design-system.md §4.2
          crossAxisSpacing: 16,
          mainAxisSpacing: 16,
        ),
        itemCount: rooms.length,
        itemBuilder: (context, index) => RoomCardWidget(room: rooms[index]),
      ),
    );
  }
}
```

**Ikuti pola PERSIS ini untuk setiap fitur lain** (reservation, checkout, reporting) — Model -> Api -> Repository -> Controller (Notifier) -> Widget (ConsumerWidget).

---

## 5. API Client & Interceptor (Wajib Satu Instance Global)

```dart
// core/network/dio_client.dart
final dioProvider = Provider<Dio>((ref) {
  final dio = Dio(BaseOptions(
    baseUrl: AppConfig.apiBaseUrl,
    connectTimeout: const Duration(seconds: 10),
    receiveTimeout: const Duration(seconds: 15),
  ));

  dio.interceptors.add(InterceptorsWrapper(
    onRequest: (options, handler) async {
      final token = await ref.read(secureStorageProvider).getToken();
      if (token != null) {
        options.headers['Authorization'] = 'Bearer $token';
      }
      return handler.next(options);
    },
    onError: (error, handler) async {
      if (error.response?.statusCode == 401) {
        // Token expired atau invalid -> auto logout paksa
        await ref.read(secureStorageProvider).clearToken();
        ref.read(authControllerProvider.notifier).forceLogout();
      }
      return handler.next(error);
    },
  ));

  return dio;
});
```

### 5.1 Parsing Response Envelope (Cermin Format Backend)

Backend SELALU mengembalikan `{success, data, error}` (lihat `endpoint.md` §1.1-1.2) — buat helper terpusat, JANGAN parsing manual di tiap tempat:

```dart
// core/network/api_exception.dart
class ApiException implements Exception {
  final String code;
  final String message;
  final Map<String, String>? fields;

  ApiException({required this.code, required this.message, this.fields});

  factory ApiException.fromDioError(DioException e) {
    final data = e.response?.data;
    if (data is Map && data['error'] != null) {
      return ApiException(
        code: data['error']['code'] ?? 'UNKNOWN',
        message: data['error']['message'] ?? 'Terjadi kesalahan',
        fields: (data['error']['fields'] as Map?)?.cast<String, String>(),
      );
    }
    return ApiException(code: 'NETWORK_ERROR', message: 'Tidak dapat terhubung ke server');
  }
}
```

**Aturan agent:** SETIAP pemanggilan API di layer `data/*_api.dart` WAJIB dibungkus try-catch yang menangkap `DioException` dan melempar ulang sebagai `ApiException.fromDioError(e)` — supaya UI bisa menampilkan `error.message` langsung tanpa parsing ulang.

---

## 6. Konvensi Kode (WAJIB DIIKUTI)

### 6.1 Penamaan

| Elemen | Konvensi | Contoh |
|---|---|---|
| File | `snake_case.dart` | `room_grid_screen.dart` |
| Class Widget | `PascalCase` + akhiran jenis | `RoomGridScreen`, `RoomCardWidget` |
| Controller (Notifier) | `PascalCase` + `Controller` | `RoomGridController`, `CheckInController` |
| Provider | `camelCase` + `Provider` | `roomGridProvider`, `authControllerProvider` |
| Model | `PascalCase` + `Model` | `RoomModel`, `ReservationModel` |

### 6.2 Widget Wajib Reusable (dari `design-system.md` §6)

Semua tombol, badge, input field, dan modal HARUS lewat widget di `shared_widgets/`, TIDAK BOLEH membuat `ElevatedButton`/`TextField` mentah langsung di tiap screen — supaya konsisten dengan token desain.

```dart
// shared_widgets/app_button.dart
enum AppButtonVariant { primary, secondary, outline, ghost, destructive }

class AppButton extends StatelessWidget {
  final String label;
  final VoidCallback? onPressed;
  final AppButtonVariant variant;
  final IconData? icon;

  const AppButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.variant = AppButtonVariant.primary,
    this.icon,
  });

  @override
  Widget build(BuildContext context) {
    final colors = _colorsFor(variant); // ambil dari AppColors sesuai design-system.md
    return SizedBox(
      height: 48, // minimum touch target, design-system.md §6.1
      child: ElevatedButton.icon(
        onPressed: onPressed,
        icon: icon != null ? Icon(icon, size: 20) : const SizedBox.shrink(),
        label: Text(label),
        style: ElevatedButton.styleFrom(
          backgroundColor: colors.background,
          foregroundColor: colors.foreground,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
        ),
      ),
    );
  }
}
```

### 6.3 Status Badge (Kartu Kamar) — Sesuai `design-system.md` §6.2-6.3

```dart
// shared_widgets/status_badge.dart
class StatusBadge extends StatelessWidget {
  final String status;
  const StatusBadge({super.key, required this.status});

  @override
  Widget build(BuildContext context) {
    final (color, label) = switch (status) {
      'AVAILABLE' => (const Color(0xFF16A34A), 'Available'),
      'OCCUPIED' => (const Color(0xFFDC2626), 'Occupied'),
      'DIRTY' => (const Color(0xFFD97706), 'Dirty'),
      'MAINTENANCE' => (const Color(0xFF6B7280), 'Maintenance'),
      _ => (Colors.grey, 'Unknown'),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withOpacity(0.12),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(width: 8, height: 8, decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
          const SizedBox(width: 6),
          Text(label, style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}
```

### 6.4 Larangan Eksplisit untuk Agent

- ❌ Jangan panggil `Dio()` langsung di widget — selalu lewat `dioProvider` -> Repository.
- ❌ Jangan simpan JWT di `SharedPreferences` — WAJIB `flutter_secure_storage` (lihat `security.md` §4.1).
- ❌ Jangan hardcode warna (`Color(0xFF...)`) di luar `core/constants/app_colors.dart`.
- ❌ Jangan fetch data di dalam `build()` method widget — selalu lewat provider yang di-`watch`.
- ❌ Jangan bikin polling timer baru di banyak tempat — satu `RoomGridController` yang mengatur siklus hidup timer-nya sendiri (auto-cancel via `ref.onDispose`).
- ❌ Jangan lupa kompres gambar dokumen identitas sebelum upload — foto asli kamera bisa 5-10MB, harus di bawah 1.5MB (`design-system.md`/`arsitektur.md` §2.4).
- ❌ Jangan asumsikan semua tamu punya NIK 16 digit — field `idNumber` HARUS divalidasi sesuai `idType` yang dipilih resepsionis (KTP/Paspor/SIM punya pola beda, lihat §9.2).

---

## 7. Urutan Implementasi (Checklist Bertahap untuk Agent)

### Tahap 0 — Bootstrap Project
- [ ] `flutter create` dengan platform web + windows/linux + android
- [ ] Install seluruh dependency §1
- [ ] Setup `AppConfig`, `dioProvider`, `ApiException`
- [ ] Setup `theme.dart` dari `design-system.md` §10 (ColorScheme, TextTheme, font Plus Jakarta Sans)
- [ ] Setup `router.dart` dasar (GoRouter kosong dengan 1 halaman placeholder), pastikan `flutter run -d chrome` jalan

### Tahap 1 — Auth & Role-Based Routing
- [ ] `AuthApi`, `AuthRepository`, `AuthController` (login, logout, refresh)
- [ ] `SecureStorageService` — simpan/hapus token
- [ ] `LoginScreen` sesuai `design-system.md` §7 (split panel navy+putih)
- [ ] Redirect guard di GoRouter (lihat §9.1 di bawah)
- [ ] Widget test: `LoginScreen` menampilkan error saat kredensial salah

### Tahap 2 — Room Grid & Manajemen Kamar
- [ ] `RoomModel`, `RoomApi`, `RoomRepository`, `RoomGridController` (dengan polling, §4.2)
- [ ] `RoomGridScreen`, `RoomCardWidget`, `RoomFilterBar`
- [ ] `RoomFormScreen` (CRUD kamar, hanya bisa diakses role MANAGER — sembunyikan tombol di UI, tapi backend tetap validasi ulang)
- [ ] Widget test: filter kamar berdasarkan tipe & lantai berfungsi

### Tahap 3 — OCR & Check-in
- [ ] `OcrScannerWidget` (kamera + fallback upload file, kompresi sebelum kirim)
- [ ] `ReservationForm` dengan auto-fill dari hasil OCR + tag "Diisi otomatis" (`design-system.md` §6.4)
- [ ] `CheckInController` — panggil `POST /reservations`, tangani error 409 (kamar sudah terisi / nomor identitas aktif di kamar lain)
- [ ] Offline-cache form (lihat §9.3 di bawah)
- [ ] Widget test: field tetap bisa diedit manual meski sudah auto-fill OCR

### Tahap 4 — Check-out & Invoice
- [ ] `CheckoutScreen`, `InvoicePreviewWidget` (styling formal seperti struk, `design-system.md` §7)
- [ ] `ThermalPrintService` — generate ESC/POS command, kirim ke printer Bluetooth/USB
- [ ] Tombol "Unduh PDF" — download & simpan file (lihat §9.4)
- [ ] Widget test: kalkulasi total (tarif + biaya tambahan + denda) tampil benar di preview sebelum submit

### Tahap 5 — Dashboard Manajer & Laporan
- [ ] `KpiCardWidget`, `ChannelCompositionChart` (donut), `OccupancyTrendChart` (line/bar) pakai `fl_chart`
- [ ] `TransactionTableScreen` dengan filter tanggal/tipe kamar/metode bayar + pagination
- [ ] `ExportButtonsWidget` — trigger download Excel/PDF (§9.4)
- [ ] Widget test: KPI card menampilkan angka sesuai data provider (mock repository)

### Tahap 6 — Audit Log
- [ ] `AuditLogScreen` (MANAGER only) — tabel dengan filter user/actionType/tanggal

### Tahap 7 — Polish & Hardening
- [ ] Terapkan `design-system.md` §9 checklist "Anti AI-Slop" ke SEMUA screen (review manual)
- [ ] Pastikan seluruh tombol/input minimum 44x44px (touch target)
- [ ] Uji di ukuran layar tablet landscape (1280x800) DAN desktop (1920x1080)
- [ ] Uji offline-cache: matikan wifi saat isi form check-in, nyalakan lagi, pastikan auto-submit

### Tahap 8 — Testing & Build
- [ ] Jalankan seluruh widget test & unit test
- [ ] Build production untuk tiap target (lihat §11)

---

## 8. Pemetaan Layar → Endpoint (Quick Reference)

| Layar | Endpoint yang Dipanggil | Controller |
|---|---|---|
| `LoginScreen` | `POST /auth/login` | `AuthController` |
| `RoomGridScreen` | `GET /rooms/status` (polling 15 detik) | `RoomGridController` |
| `RoomFormScreen` | `POST /rooms`, `PATCH /rooms/:id`, `DELETE /rooms/:id` | `RoomFormController` |
| `CheckInModal` → `OcrScannerWidget` | `POST /ocr/extract-identity` | `CheckInController` |
| `CheckInModal` → submit | `POST /reservations` | `CheckInController` |
| `CheckoutScreen` | `POST /reservations/:id/checkout` | `CheckoutController` |
| Tombol "Tandai Bersih" di `RoomCardWidget` | `PATCH /rooms/:id/mark-clean` | `RoomGridController` |
| `ManagerDashboardScreen` | `GET /reports/summary` | `ReportController` |
| `TransactionTableScreen` | `GET /reports/transactions` | `ReportController` |
| `ExportButtonsWidget` | `GET /reports/export-excel`, `GET /reports/export-pdf` | `ReportController` |
| `AuditLogScreen` | `GET /audit-logs` | `AuditLogController` |
| Badge "Resend WA" | `POST /notifications/send-reminder` | `CheckInController` |

---

## 9. Implementasi Fitur Kritis (Kode Referensi)

### 9.1 Role-Based Routing dengan Redirect Guard (FR-AUTH-03)

```dart
// app/router.dart
final routerProvider = Provider<GoRouter>((ref) {
  return GoRouter(
    initialLocation: '/login',
    redirect: (context, state) {
      final authState = ref.read(authControllerProvider);
      final isLoggedIn = authState.valueOrNull != null;
      final isLoginRoute = state.matchedLocation == '/login';

      if (!isLoggedIn && !isLoginRoute) return '/login';
      if (isLoggedIn && isLoginRoute) {
        final role = authState.valueOrNull!.role;
        return role == 'MANAGER' ? '/manager/dashboard' : '/rooms';
      }
      return null;
    },
    routes: [
      GoRoute(path: '/login', builder: (context, state) => const LoginScreen()),
      GoRoute(path: '/rooms', builder: (context, state) => const RoomGridScreen()),
      GoRoute(
        path: '/manager/dashboard',
        builder: (context, state) => const ManagerDashboardScreen(),
        redirect: (context, state) => _requireRole(ref, 'MANAGER'),
      ),
      // ... route lain, setiap route MANAGER-only pakai redirect guard yang sama
    ],
  );
});

String? _requireRole(Ref ref, String requiredRole) {
  final role = ref.read(authControllerProvider).valueOrNull?.role;
  if (role != requiredRole) return '/rooms'; // tolak akses, lempar balik
  return null;
}
```
**Catatan penting:** guard ini HANYA untuk UX (mencegah resepsionis "nyasar" ke halaman manajer). **Otorisasi sesungguhnya tetap di backend** (`RolesGuard` NestJS, lihat `backend.md` §5.3) — kalau resepsionis panggil endpoint manager langsung lewat network request, backend yang menolak dengan 403, bukan Flutter.

### 9.2 OCR Scanner Multi Jenis Dokumen — KTP/Paspor/SIM (FR-RES-03, FR-RES-04)

Resepsionis **wajib memilih jenis dokumen dulu** sebelum kamera aktif — backend butuh
`documentType` untuk menentukan parser yang dipakai (KTP/SIM pakai regex label, Paspor pakai
parsing MRZ; lihat `backend.md` §8.3, strukturnya beda total sehingga tidak bisa auto-detect).

```dart
// features/reservation/presentation/document_type_selector.dart
enum DocumentType { ktp, passport, sim }

class DocumentTypeSelector extends StatelessWidget {
  final DocumentType selected;
  final ValueChanged<DocumentType> onChanged;
  const DocumentTypeSelector({super.key, required this.selected, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return SegmentedButton<DocumentType>(
      segments: const [
        ButtonSegment(value: DocumentType.ktp, label: Text('KTP'), icon: Icon(PhosphorIcons.identificationCard)),
        ButtonSegment(value: DocumentType.passport, label: Text('Paspor'), icon: Icon(PhosphorIcons.passport)),
        ButtonSegment(value: DocumentType.sim, label: Text('SIM'), icon: Icon(PhosphorIcons.car)),
      ],
      selected: {selected},
      onSelectionChanged: (set) => onChanged(set.first),
    );
  }
}
```

```dart
// features/reservation/presentation/ocr_scanner_widget.dart
Future<void> _captureAndExtract(WidgetRef ref, DocumentType documentType) async {
  final picker = ImagePicker();
  final XFile? photo = await picker.pickImage(source: ImageSource.camera, imageQuality: 85);
  if (photo == null) return;

  // Kompresi sebelum upload — target di bawah 1.5MB, resize longest-edge 1600px
  final compressed = await FlutterImageCompress.compressWithFile(
    photo.path,
    minWidth: 1600,
    quality: 80,
  );
  if (compressed == null) return;

  try {
    final result = await ref.read(checkInControllerProvider.notifier).extractIdentity(
          compressed,
          documentType: _apiDocumentType(documentType), // 'KTP' | 'PASSPORT' | 'SIM'
          timeout: const Duration(seconds: 3),
        );

    if (result.perluVerifikasiManual) {
      _showSnackbar('Hasil scan kurang jelas — mohon periksa & lengkapi manual');
    }
    // Form auto-fill dari result.idNumber, result.namaLengkap, result.alamat, result.nationality
    // Field tetap editable — TIDAK ADA field yang di-lock read-only, berlaku untuk SEMUA jenis dokumen
  } on ApiException catch (e) {
    if (e.code == 'EXTERNAL_SERVICE_ERROR') {
      _showSnackbar('OCR tidak tersedia — silakan isi manual');
      // TIDAK memblokir proses — form tetap kosong siap diisi manual (business-flow.md §4)
    } else {
      _showSnackbar(e.message);
    }
  }
}

String _apiDocumentType(DocumentType type) => switch (type) {
      DocumentType.ktp => 'KTP',
      DocumentType.passport => 'PASSPORT',
      DocumentType.sim => 'SIM',
    };
```

### 9.3 Offline-Caching Form Check-in dengan Hive (FR-RES-08)

```dart
// core/storage/hive_boxes.dart
Future<void> initHive() async {
  await Hive.initFlutter();
  await Hive.openBox('pending_checkin_drafts');
}
```

```dart
// features/reservation/presentation/checkin_controller.dart
class CheckInController extends StateNotifier<CheckInFormState> {
  final ReservationRepository _repo;
  final Box _draftBox = Hive.box('pending_checkin_drafts');
  Timer? _autoSaveDebounce;

  CheckInController(this._repo) : super(CheckInFormState.initial());

  void updateField(String key, dynamic value) {
    state = state.copyWith(fields: {...state.fields, key: value});
    _scheduleAutoSave();
  }

  void _scheduleAutoSave() {
    _autoSaveDebounce?.cancel();
    _autoSaveDebounce = Timer(const Duration(milliseconds: 500), () {
      _draftBox.put('current_draft', state.fields);
    });
  }

  Future<void> submit(String roomId) async {
    try {
      await _repo.createReservation(roomId, state.fields);
      _draftBox.delete('current_draft'); // submit berhasil, hapus draft
      state = state.copyWith(status: SubmitStatus.success);
    } on DioException catch (e) {
      if (e.type == DioExceptionType.connectionError) {
        // Simpan ke antrian pending-sync, retry otomatis tiap 30 detik
        state = state.copyWith(status: SubmitStatus.pendingSync);
        _scheduleRetry(roomId);
      } else {
        rethrow;
      }
    }
  }

  void _scheduleRetry(String roomId) {
    Timer.periodic(const Duration(seconds: 30), (timer) async {
      try {
        await _repo.createReservation(roomId, state.fields);
        _draftBox.delete('current_draft');
        state = state.copyWith(status: SubmitStatus.success);
        timer.cancel();
      } catch (_) {
        // Masih gagal, coba lagi 30 detik berikutnya
      }
    });
  }

  /// Dipanggil saat modal dibuka — cek ada draft tertunda dari sesi sebelumnya
  void restoreDraftIfExists() {
    final saved = _draftBox.get('current_draft');
    if (saved != null) {
      state = state.copyWith(fields: Map<String, dynamic>.from(saved));
    }
  }
}
```

### 9.4 Download & Simpan File Excel/PDF (FR-REP-03, FR-REP-04)

```dart
// features/reporting/data/report_repository.dart
Future<void> downloadExcelReport(DateTime start, DateTime end) async {
  final dio = ref.read(dioProvider);
  final response = await dio.get(
    '/reports/export-excel',
    queryParameters: {'startDate': start.toIso8601String(), 'endDate': end.toIso8601String()},
    options: Options(responseType: ResponseType.bytes),
  );

  final fileName = 'laporan-${DateFormat('yyyyMMdd').format(start)}-${DateFormat('yyyyMMdd').format(end)}.xlsx';
  await FileSaver.instance.saveFile(
    name: fileName,
    bytes: Uint8List.fromList(response.data),
    mimeType: MimeType.microsoftExcel,
  );
}
```
**Catatan:** di Flutter Web, `file_saver` otomatis memicu dialog download browser. Di desktop (Windows/Linux), file tersimpan ke folder Downloads pengguna.

### 9.5 Thermal Printer — Cetak Invoice (FR-OUT-03)

```dart
// features/checkout/presentation/thermal_print_service.dart
class ThermalPrintService {
  Future<void> printInvoice(ReservationModel reservation) async {
    final profile = await CapabilityProfile.load();
    final generator = Generator(PaperSize.mm58, profile);
    List<int> bytes = [];

    bytes += generator.text('HOTEL SINAR HARAPAN',
        styles: const PosStyles(align: PosAlign.center, bold: true));
    bytes += generator.text('Mitra RedDoorz', styles: const PosStyles(align: PosAlign.center));
    bytes += generator.hr();
    bytes += generator.text('No. Invoice: ${reservation.invoiceNumber}');
    bytes += generator.text('Kamar: ${reservation.roomNumber}');
    bytes += generator.text('Tamu: ${reservation.guestName}');
    bytes += generator.hr();
    bytes += generator.text(
      'Total: ${CurrencyFormatter.format(reservation.totalAmount)}',
      styles: const PosStyles(bold: true, height: PosTextSize.size2),
    );
    bytes += generator.feed(2);
    bytes += generator.cut();

    // Kirim ke printer via Bluetooth/USB — implementasi koneksi sesuai
    // device printer yang dipakai hotel (esc_pos_bluetooth atau usb serial)
    await PrinterConnection.instance.printBytes(bytes);
  }
}
```

### 9.6 Grafik Dashboard Manajer (FR-REP-01)

```dart
// features/reporting/presentation/channel_composition_chart.dart
class ChannelCompositionChart extends StatelessWidget {
  final int reddoorzCount;
  final int walkInCount;
  const ChannelCompositionChart({super.key, required this.reddoorzCount, required this.walkInCount});

  @override
  Widget build(BuildContext context) {
    return PieChart(
      PieChartData(
        sections: [
          PieChartSectionData(
            value: reddoorzCount.toDouble(),
            color: AppColors.navy700,
            title: 'RedDoorz',
            radius: 60,
          ),
          PieChartSectionData(
            value: walkInCount.toDouble(),
            color: AppColors.orange600,
            title: 'Walk-in',
            radius: 60,
          ),
        ],
        sectionsSpace: 2,
        centerSpaceRadius: 40, // donut, bukan pie penuh — sesuai design-system.md §6.8
      ),
    );
  }
}
```
**Aturan visual:** hanya dua warna (`navy700` & `orange600`), tanpa gradient/efek 3D — sesuai `design-system.md` §6.8 & §9.

---

## 10. Testing Requirements

### 10.1 Cakupan Minimum

| Layer | Jenis Test | Tools |
|---|---|---|
| Controller/Notifier | Unit test dengan mock Repository | `mocktail` |
| Widget individual (`StatusBadge`, `AppButton`) | Widget test | `flutter_test` |
| Screen penuh (interaksi user) | Widget test dengan `pumpWidget` + `ProviderScope overrides` | `flutter_test` |
| Alur penuh (login → check-in → checkout) | Integration test | `integration_test` package |

### 10.2 Skenario Test Wajib

```
✅ LoginScreen menampilkan pesan error saat kredensial salah (mock 401)
✅ Setelah login sebagai RECEPTIONIST, redirect ke /rooms (bukan /manager/dashboard)
✅ Setelah login sebagai MANAGER, redirect ke /manager/dashboard
✅ RoomCardWidget menampilkan warna & label sesuai status (AVAILABLE/OCCUPIED/DIRTY/MAINTENANCE)
✅ Filter kamar (tipe + lantai) mengubah daftar yang ditampilkan sesuai kriteria
✅ Form check-in tetap bisa diedit manual setelah auto-fill OCR
✅ Saat OCR gagal (mock 502), form tetap tampil kosong, TIDAK memblokir submit
✅ Submit check-in yang gagal karena koneksi terputus -> status berubah ke "pendingSync",
   BUKAN hilang begitu saja
✅ Total biaya di CheckoutScreen menghitung ulang otomatis saat biaya tambahan diubah
✅ Tombol/aksi yang butuh role MANAGER tidak muncul di UI resepsionis
```

### 10.3 Command Testing

```bash
flutter test                          # unit + widget test
flutter test integration_test/        # integration test (butuh device/emulator)
flutter test --coverage               # dengan laporan coverage
```

---

## 11. Build & Deployment

### 11.1 Target Platform & Command Build

| Platform | Command | Output | Kegunaan |
|---|---|---|---|
| Web | `flutter build web --dart-define=API_BASE_URL=https://api.sinarharapanpms.com` | `build/web/` | Dibuka via Chrome kios mode di tablet & PC kasir — **target utama** sesuai `prd.md` |
| Windows Desktop | `flutter build windows --dart-define=...` | `.exe` | PC resepsionis yang prefer aplikasi native, bukan browser |
| Linux Desktop | `flutter build linux --dart-define=...` | binary | Opsional, jika hotel pakai Linux di PC kasir |
| Android APK | `flutter build apk --dart-define=...` | `.apk` | Opsional, tablet Android mode kios (roadmap, lihat `prd.md` §1.3) |

### 11.2 Mode Kios untuk Web (Direkomendasikan sebagai Target Utama)

Karena `prd.md` menyebut target device tablet 10"+ landscape & desktop 1920x1080, cara paling sederhana untuk deploy adalah **Chrome Kiosk Mode** menunjuk ke hasil `flutter build web` yang di-hosting (bisa di server VPS yang sama dengan backend, disajikan via Nginx sebagai static file, atau di-hosting terpisah):

```bash
# Di Windows (shortcut kios)
chrome.exe --kiosk --app=https://app.sinarharapanpms.com

# Di Linux
google-chrome --kiosk --app=https://app.sinarharapanpms.com
```

**Serving hasil build via Nginx (satu VPS dengan backend):**
```nginx
server {
    listen 80;
    server_name app.sinarharapanpms.com;
    root /home/deploy/sinar-harapan-frontend/build/web;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;  # wajib untuk SPA routing GoRouter
    }
}
```
Lalu `sudo certbot --nginx -d app.sinarharapanpms.com` untuk SSL, sama seperti langkah backend.

### 11.3 Checklist Sebelum Build Production

```
[ ] API_BASE_URL production benar (bukan localhost/staging)
[ ] Seluruh widget test & unit test lolos
[ ] Uji manual di ukuran layar tablet landscape (1280x800) dan desktop (1920x1080)
[ ] Uji offline-cache: matikan koneksi saat isi form, pastikan draft tersimpan & auto-sync
[ ] Cek tidak ada API key/secret ter-hardcode di kode (semua backend-side, Flutter tidak
    pernah menyimpan credential OCR/WA Gateway)
[ ] Ikon & label sesuai design-system.md, tidak ada elemen "AI-slop" (gradient, shadow tebal, dsb.)
```

---

## 12. Definisi Selesai untuk Agent (Definition of Done per Task)

Sebuah task dari checklist §7 dianggap selesai HANYA jika:

1. Kode ter-compile tanpa error (`flutter analyze` bersih)
2. Widget/unit test terkait ditulis DAN lolos (`flutter test`)
3. Tampilan sudah dicek terhadap `design-system.md` (warna, spacing, radius, tipografi sesuai token)
4. Tidak ada widget yang manggil Dio langsung (semua lewat Repository → Controller)
5. Aksi yang butuh role tertentu sudah disembunyikan di UI (meski validasi sesungguhnya tetap di backend)
6. State/loading/error ditangani eksplisit di setiap async call (tidak ada crash saat API gagal)
7. Diuji minimal di dua ukuran layar: tablet landscape (1280x800) dan desktop (1920x1080)
