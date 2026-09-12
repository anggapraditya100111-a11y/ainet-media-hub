# Changelog

## 0.3.5 — 2026-09-12

- Sembunyikan form ubah password bagi pengguna yang masuk melalui AXINDO Access maupun OIDC langsung.
- Tampilkan sumber akun `ACCESS` sebagai AXINDO ID pada profil dan administrasi pengguna.
- Cegah Super Admin mengubah password atau role akun AXINDO ID yang dibuat melalui handoff AXINDO Access.

## 0.3.4 — 2026-09-12

- Tambahkan penyelesaian handoff melalui URL fragment bila Safari iPhone memutus `window.opener`.
- Simpan PKCE verifier hanya di `sessionStorage` dan hapus segera setelah pertukaran kode selesai.
- Periksa sesi Media Hub sebelum menyatakan popup yang tertutup sebagai kegagalan.

## 0.3.3 — 2026-09-12

- Cegah monitor popup membatalkan pertukaran kode login yang sedang diproses backend.
- Tambahkan toleransi 1,5 detik sebelum popup yang benar-benar ditutup pengguna dinyatakan gagal.
- Gunakan versi aset baru agar browser tidak mempertahankan logika monitor lama.

## 0.3.2 — 2026-09-12

- Mengarahkan popup login ke endpoint khusus `/handoff` milik AXINDO Access.
- Mempertahankan hubungan popup lintas subdomain agar kode login dapat dikirim kembali ke Media Hub.
- Membuat URL aset versi baru agar browser tidak memakai JavaScript login lama dari cache.

## 0.3.1 — 2026-09-12

- Membuka halaman web AXINDO Access di popup, bukan endpoint redirect Authentik.
- Menggunakan sesi Access yang sudah aktif sehingga pengguna tidak perlu login ulang di Media Hub.
- Menukar kode satu kali berbasis PKCE melalui backend dan memverifikasi origin, jendela popup, kanal, audience, serta role.
- Membuat sesi Media Hub dengan sumber `ACCESS` agar logout tidak mengarahkan browser ke Authentik.
- Menambahkan jalur internal Docker menuju Access Manager untuk menghindari ketergantungan pada DNS publik.

## 0.3.0 — 2026-09-12

- Mengubah login utama menjadi popup melalui AXINDO Access pada `akses.axindo.my.id`.
- Menambahkan handoff OIDC dua tahap dalam satu popup dengan verifikasi origin dan token kanal acak.
- Menutup popup otomatis setelah sesi Media Hub berhasil dibuat dan memuat dashboard tanpa refresh manual.
- Menambahkan tampilan penyelesaian popup untuk status berhasil atau gagal.
- Menambahkan mode mobile bergaya aplikasi Android dengan app bar, navigasi bawah sesuai role, bottom sheet, safe-area, serta target sentuh yang lebih nyaman.
- Menambahkan manifest PWA dan ikon aplikasi Media Hub.
- Menambahkan migrasi database untuk menyimpan mode dan kanal percobaan login popup.

## 0.2.2 — 2026-09-11

- Menambahkan manifest publik `/.well-known/axindo-access.json` untuk AXINDO Access Manager.
- Role AXINDO ID dan role Personal dipisahkan secara eksplisit pada manifest.
- Daftar role Media Hub kini dapat disinkronkan otomatis oleh panel akses pusat.

## 0.2.1 — 2026-09-11

- Mengganti istilah login lokal darurat menjadi **Login Personal**.
- Mengizinkan Login Personal hanya untuk akun lokal Super Admin dan Vendor saat AXINDO ID aktif.
- Mengizinkan Super Admin membuat akun Vendor beserta username, password, dan pasangan data vendornya.
- Pengguna internal selain Super Admin tetap wajib masuk melalui AXINDO ID.

## 0.2.0 — 2026-09-10

- Menambahkan Single Sign-On AXINDO ID melalui Authentik OIDC.
- Menggunakan Authorization Code Flow dengan PKCE, state, nonce, dan discovery issuer.
- Menambahkan provisioning serta sinkronisasi akun berdasarkan identitas `issuer + subject`.
- Memetakan grup Authentik ke tujuh role Media Hub dan menolak akun tanpa grup yang sesuai.
- Membatasi login lokal untuk Super Admin darurat saat OIDC aktif.
- Menambahkan tampilan login AXINDO ID, sumber akun, waktu sinkronisasi, dan profil SSO.
- Memindahkan target deployment dari CasaOS ke Docker Compose pada Ubuntu Server.
- Menambahkan installer konfigurasi OIDC interaktif yang tidak menampilkan Client Secret.
- Memperbarui Multer ke 2.3.0 untuk menutup kerentanan DoS pada pemrosesan multipart.

## 0.1.2 — 2026-09-07

- Menyamakan konfigurasi keamanan aset statis dengan aplikasi CasaOS AXINDO lainnya.
- Menonaktifkan pemaksaan HTTPS pada CSS dan JavaScript untuk akses IP lokal.
- Mengganti tag image dan versi aset agar Docker serta browser tidak memakai cache lama.

## 0.1.1 — 2026-09-07

- Port eksternal bawaan CasaOS dipindahkan ke 8095.
- Memperbaiki CSS dan JavaScript yang tidak termuat saat aplikasi dibuka melalui HTTP lokal.

## 0.1.0 — 2026-09-07

- Fondasi aplikasi AXINDO Media Hub untuk Docker/CasaOS.
- Workflow konten end-to-end dengan tujuh role.
- Media Library bersama dan versioning aset.
- Upload draft, review, approval, jadwal, bukti tayang, dan metrik.
- Dashboard, pipeline, kalender, vendor, laporan, notifikasi, audit, pengguna, pengaturan, dan backup.
- UI responsif AINET/IMAS dengan dark mode.
- Pengujian unit dan integrasi lintas role.
