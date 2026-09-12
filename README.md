# AXINDO Media Hub

AXINDO Media Hub adalah aplikasi internal PT Axindo Infinitas Network untuk mengelola produksi konten AINET dan IMAS dari permintaan sampai bukti tayang. Aplikasi berjalan mandiri di server Ubuntu menggunakan Docker Compose, database SQLite, dan penyimpanan berkas lokal server.

Versi: **0.3.5 — Proteksi password AXINDO ID**

## Fitur yang sudah berfungsi

- Workflow terkunci: Permintaan → Brief → Penugasan → Produksi → Draft → Review → Revisi/Approval → Disetujui → Terjadwal → Tayang.
- Tujuh role: Super Admin, Koordinator Media, Vendor/Kreator, Reviewer, Approver, Petugas Uploader, dan Direksi/Manajemen.
- Vendor hanya melihat konten yang ditugaskan kepada vendornya dan tidak menyimpan kredensial media sosial.
- Konten sensitif membutuhkan izin approver khusus; konten rutin dapat disetujui Koordinator atau Approver.
- Upload draft berversi, catatan revisi, keputusan review, dan keputusan persetujuan.
- Jadwal publikasi serta bukti tayang berupa tautan dan/atau berkas.
- Pencatatan reach, impressions, engagement, leads/PSB, anggaran, dan biaya per lead.
- Media Library bersama untuk logo, brosur, template, foto/video, materi kampanye, dan arsip.
- Media Library memiliki versi aktif, tanggal berlaku, tanggal kedaluwarsa, checksum, pemilik, serta status.
- Seluruh user termasuk vendor dapat membaca/mengunduh aset aktif; aset kedaluwarsa atau diarsipkan dikunci untuk non-pengelola.
- Draft yang sudah disetujui dapat dipromosikan menjadi aset resmi Media Library.
- Notifikasi dalam aplikasi untuk tugas, draft, revisi, approval, jadwal, dan publikasi.
- Audit log untuk login, perubahan data, status workflow, versi berkas, publikasi, pengguna, pengaturan, dan backup.
- Branding aplikasi, warna AINET/IMAS, logo perusahaan, dark mode, serta tampilan responsif desktop/mobile.
- Backup database manual dari UI dan backup lengkap volume melalui script server.
- SSO pengguna melalui AXINDO Access; Authentik tetap menjadi backend AXINDO ID dan grup, dengan Authorization Code Flow, PKCE, state, dan nonce.
- Login dibuka sebagai popup halaman `akses.axindo.my.id`; sesi Access yang masih aktif langsung dipakai dan popup tertutup otomatis.
- Akun operasional dibuat serta diperbarui otomatis dari klaim OIDC; role mengikuti grup Authentik.
- Login Personal dibatasi untuk akun lokal Super Admin dan Vendor saat OIDC aktif; pengguna internal lainnya wajib memakai AXINDO ID.
- Mode mobile bergaya aplikasi Android dengan app bar, navigasi bawah berbasis role, bottom sheet, tombol sentuh, safe-area, dan dukungan instalasi PWA.

## Pembagian menu

| Role | Menu utama |
|---|---|
| Super Admin | Dashboard, Kalender, Pipeline, Permintaan, Review, Persetujuan, Siap Tayang, Media Library, Vendor, Laporan, Pengguna, Audit, Pengaturan, Backup |
| Koordinator Media | Dashboard, Kalender, Pipeline, Permintaan, Review Draft, Siap Tayang, Media Library, Vendor, Laporan |
| Vendor / Kreator | Dashboard, Tugas Saya, Jadwal, Permintaan Revisi, Media Library, Riwayat Tugas |
| Reviewer | Dashboard, Menunggu Review, Perlu Revisi, Riwayat Review, Kalender, Media Library |
| Approver | Dashboard, Approval Saya, Riwayat Persetujuan, Kalender, Media Library |
| Petugas Uploader | Dashboard, Konten Siap Tayang, Jadwal Upload, Riwayat Publikasi, Media Library |
| Direksi / Manajemen | Dashboard Executive, Kalender, Ringkasan Progres, Performa Konten, Kinerja Vendor, Media Library |

## Instalasi di Ubuntu

Persyaratan: Ubuntu Server, Git, Docker Engine, dan Docker Compose Plugin. Jalankan sebagai `root` atau pengguna yang memiliki akses Docker:

```bash
git clone https://github.com/anggapraditya100111-a11y/ainet-media-hub.git /opt/axindo-media-hub
cd /opt/axindo-media-hub
chmod +x install.sh update.sh backup.sh configure-oidc.sh
./install.sh
```

Installer akan:

1. membuat `.env` dan secret keamanan;
2. membuat password awal Super Admin secara acak;
3. menyiapkan folder persisten database, upload, dan backup;
4. membangun container;
5. menjalankan aplikasi pada `http://IP-SERVER:8095`.

Simpan password yang ditampilkan installer, login menggunakan username `admin`, lalu ubah password dari menu **Profil & Password**.

## Lokasi data

| Data | Lokasi Ubuntu bawaan |
|---|---|
| Source dan `.env` | `/opt/axindo-media-hub` |
| Database SQLite | `/opt/axindo-media-hub/runtime/database` |
| Draft, aset, bukti, logo | `/opt/axindo-media-hub/runtime/uploads` |
| Backup | `/opt/axindo-media-hub/runtime/backups` |

Jangan menaruh `.env`, database, upload, atau backup di dalam Git.

## Update dari GitHub

```bash
cd /opt/axindo-media-hub
./update.sh
```

Script membuat backup database, menarik commit terbaru dengan fast-forward, membangun image baru, lalu memeriksa health endpoint.

## Backup

Backup database dapat dibuat melalui menu **Backup Data**. Untuk backup lengkap database dan seluruh berkas:

```bash
./backup.sh
```

Arsip lengkap disimpan di `runtime/backups` dan sebaiknya ikut disalin ke NAS atau media cadangan lain.

## AXINDO Access dan Authentik

Standar lengkap untuk menghubungkan aplikasi AXINDO baru tersedia di [Blueprint Integrasi Aplikasi dengan AXINDO Access](https://github.com/anggapraditya100111-a11y/axindo-access-manager/blob/main/docs/APP_SSO_INTEGRATION_BLUEPRINT.md). Gunakan panduan tersebut untuk manifest, handoff, PKCE, fallback Safari iPhone, deployment, pengujian, dan troubleshooting.

Provider Authentik harus memakai slug yang menghasilkan issuer berikut (ubah `.env` jika slug berbeda):

```text
https://sso.axindo.my.id/application/o/axindo-media-hub/
```

Setelah domain Media Hub dan AXINDO Access dapat dibuka dari browser pengguna, jalankan:

```bash
cd /opt/axindo-media-hub
./configure-oidc.sh
```

Script akan meminta URL Media Hub, URL AXINDO Access, Client ID, dan Client Secret. Input Client Secret disembunyikan, disimpan hanya di `.env` dengan permission `600`, dan tidak masuk Git. Script juga menampilkan Redirect URI yang harus sama persis dengan nilai pada Provider Authentik, misalnya:

```text
https://mediahub.axindo.my.id/api/auth/oidc/callback
```

Pastikan scope Provider mencakup `openid`, `profile`, dan `email`, serta klaim `groups`. Pemetaan grup bawaan:

| Grup Authentik | Role Media Hub |
|---|---|
| `AXINDO - MEDIA HUB - SUPER ADMIN` | Super Admin |
| `AXINDO - MEDIA HUB - KOORDINATOR` | Koordinator Media |
| `AXINDO - MEDIA HUB - VENDOR` | Vendor/Kreator |
| `AXINDO - MEDIA HUB - REVIEWER` | Reviewer |
| `AXINDO - MEDIA HUB - APPROVER` | Approver |
| `AXINDO - MEDIA HUB - UPLOADER` | Petugas Uploader |
| `AXINDO - MEDIA HUB - MANAGEMENT` | Direksi/Manajemen |
| `AXINDO - DIREKSI` | Direksi/Manajemen |

Jika nama grup berbeda, isi pemetaan satu baris di `.env`, misalnya:

```env
OIDC_ROLE_MAPPING_JSON={"Tim Media":"COORDINATOR","Vendor Konten":"VENDOR","Direksi":"MANAGEMENT"}
```

Pengguna tanpa grup yang dipetakan akan ditolak. Jika satu pengguna memiliki beberapa grup, sistem memilih role dengan prioritas paling tinggi. Akun OIDC tidak memiliki password lokal; password dan MFA dikelola melalui AXINDO ID. Login Personal menggunakan username dan password tersendiri dan hanya dapat digunakan oleh Super Admin serta Vendor.

Tombol login utama membuka halaman AXINDO Access di dalam popup. Jika pengguna sudah login di Access, tidak ada form login kedua. Access menerbitkan kode satu kali berumur 90 detik yang terikat pada origin Media Hub dan PKCE. Backend Media Hub menukar kode tersebut menjadi sesi lokal, lalu popup tertutup otomatis. Authentik tetap menjadi backend identitas dan grup, tetapi halaman Authentik tidak dibuka pada alur normal ini. Browser harus mengizinkan popup untuk domain Media Hub.

Komunikasi backend Media Hub ke Access menggunakan `ACCESS_PORTAL_INTERNAL_URL`. Docker Compose memakai `http://host.docker.internal:8096` secara bawaan agar pertukaran tidak bergantung pada DNS publik atau Cloudflare Tunnel.

Untuk memberi akses kepada vendor, Super Admin membuka **Pengguna & Akses**, memilih **Tambah Login Personal**, mengisi username serta password awal, memilih role Vendor, lalu memasangkannya dengan data vendor. Sebelum dipasangkan, vendor dapat login tetapi belum melihat tugas produksi.

## Domain dan HTTPS

Untuk domain internal, arahkan reverse proxy ke port `8095`, aktifkan HTTPS, lalu ubah `.env`:

```env
TRUST_PROXY=true
COOKIE_SECURE=true
```

Terapkan perubahan dengan:

```bash
docker compose up -d
```

## Pengembangan lokal

Persyaratan: Node.js 22 atau lebih baru.

```bash
npm ci
cp .env.example .env
npm start
```

Untuk menampilkan data dan akun demo, set `SEED_DEMO=true`. Password semua akun demo adalah `Demo12345`.

| Username demo | Role |
|---|---|
| `koordinator` | Koordinator Media |
| `vendor` | Vendor / Kreator |
| `reviewer` | Reviewer |
| `approver` | Approver |
| `uploader` | Petugas Uploader |
| `manajemen` | Direksi / Manajemen |

Data demo tidak aktif pada instalasi produksi bawaan.

## Verifikasi

```bash
npm run verify
```

Pengujian mencakup urutan workflow, penolakan lompatan status, password scrypt, hak akses vendor, alur konten lengkap lintas role, publikasi, metrik, Media Library, penguncian aset kedaluwarsa, dan proteksi menu admin.

## Keamanan

- Password Login Personal di-hash menggunakan `scrypt`, salt unik, dan pepper aplikasi.
- OIDC memakai Authorization Code Flow + PKCE, validasi state/nonce, issuer discovery, dan identitas stabil `issuer + subject`.
- Client Secret hanya dibaca dari `.env`; token OIDC tidak disimpan ke database atau audit log.
- Sesi disimpan sebagai hash, cookie `HttpOnly`, `SameSite=Strict`, dan dapat memakai `Secure` pada HTTPS.
- Login dibatasi sepuluh kegagalan per menit.
- Endpoint memeriksa izin di server; penyembunyian menu bukan satu-satunya pengamanan.
- Berkas hanya dapat dibuka melalui endpoint yang memeriksa sesi serta akses konten/aset.
- Tidak ada hard delete untuk konten yang disetujui atau sudah tayang.
- Aset lama tetap tersimpan sebagai versi historis.
- Security headers disediakan oleh Helmet dan request lintas situs ditolak.

## Roadmap

### Phase 2

- Notifikasi email/WhatsApp dan pengingat deadline terjadwal.
- Export laporan Excel/PDF.
- SLA lebih rinci per tahap dan vendor.
- Restore lengkap melalui UI dengan validasi serta rollback otomatis.

### Phase 3

- Integrasi Meta, TikTok, YouTube, WhatsApp, dan website.
- Scheduler/publisher berbasis API sesuai kebijakan platform.
- Penarikan metrik otomatis.
- Integrasi leads/PSB dengan sistem internal AXINDO.

## Lisensi

Proprietary — internal PT Axindo Infinitas Network. Seluruh hak dilindungi.
