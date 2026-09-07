# AXINDO Media Hub

AXINDO Media Hub adalah aplikasi internal PT Axindo Infinitas Network untuk mengelola produksi konten AINET dan IMAS dari permintaan sampai bukti tayang. Aplikasi dirancang untuk berjalan mandiri di Docker/CasaOS dengan database SQLite dan penyimpanan berkas di server perusahaan.

Versi: **0.1.1 — Phase 1 MVP**

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

## Instalasi di CasaOS

Lokasi yang disarankan:

```text
/DATA/AppData/media-hub/app
```

Clone repository, lalu jalankan:

```bash
cd /DATA/AppData/media-hub/app
chmod +x install.sh update.sh backup.sh
./install.sh
```

Installer akan:

1. membuat `.env` dan secret keamanan;
2. membuat password awal Super Admin secara acak;
3. menyiapkan volume database, upload, dan backup;
4. membangun container;
5. menjalankan aplikasi pada `http://IP-CASAOS:8095`.

Simpan password yang ditampilkan installer, login menggunakan username `admin`, lalu ubah password dari menu **Profil & Password**.

## Lokasi data

| Data | Lokasi CasaOS |
|---|---|
| Source dan `.env` | `/DATA/AppData/media-hub/app` |
| Database SQLite | `/DATA/AppData/media-hub/database` |
| Draft, aset, bukti, logo | `/DATA/AppData/media-hub/uploads` |
| Backup | `/DATA/AppData/media-hub/backups` |

Jangan menaruh `.env`, database, upload, atau backup di dalam Git.

## Update dari GitHub

```bash
cd /DATA/AppData/media-hub/app
./update.sh
```

Script membuat backup database, menarik commit terbaru dengan fast-forward, membangun image baru, lalu memeriksa health endpoint.

## Backup

Backup database dapat dibuat melalui menu **Backup Data**. Untuk backup lengkap database dan seluruh berkas:

```bash
./backup.sh
```

Arsip lengkap disimpan di `/DATA/AppData/media-hub/backups` dan sebaiknya ikut disalin ke NAS atau media cadangan lain.

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

- Password di-hash menggunakan `scrypt`, salt unik, dan pepper aplikasi.
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
