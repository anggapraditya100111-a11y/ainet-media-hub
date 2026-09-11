# Changelog

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
