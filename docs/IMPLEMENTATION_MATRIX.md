# Matriks Implementasi Konsep AXINDO Media Hub

Dokumen ini memetakan konsep pada PDF **Konsep AXINDO Media Hub 2026** ke implementasi repository versi 0.1.0.

| Area konsep | Implementasi 0.1.0 | Status |
|---|---|---|
| Dual brand AINET / IMAS | Master brand, warna, filter, badge, dan branding UI | Selesai |
| Permintaan dan brief | Form tujuan, audiens, kampanye, format, channel, CTA, deadline, anggaran | Selesai |
| Penugasan vendor | Vendor, koordinator, reviewer, approver, uploader | Selesai |
| Produksi dan draft | Upload berkas berversi dengan caption dan catatan perubahan | Selesai |
| Review dan revisi | Keputusan reviewer, catatan wajib saat revisi, jejak workflow | Selesai |
| Persetujuan | Approval rutin/sensitif dan penguncian versi disetujui | Selesai |
| Jadwal | Rencana tayang, kalender, status terjadwal | Selesai |
| Bukti tayang | URL, screenshot/PDF, waktu, channel, dan metrik | Selesai |
| Media Library | Enam kategori, versi, masa berlaku, checksum, status, owner | Selesai |
| Akses vendor ke Library | Baca/unduh aset aktif tanpa hak kelola | Selesai |
| Aset kedaluwarsa | Otomatis berstatus kedaluwarsa dan terkunci untuk non-pengelola | Selesai |
| Promosi draft menjadi aset | Versi disetujui dapat disalin ke Media Library | Selesai |
| Dashboard per role | Data otomatis mengikuti cakupan akses pengguna | Selesai |
| Laporan | Status, brand, vendor SLA, reach, engagement, leads, biaya/lead | Selesai |
| Notifikasi | Notifikasi dalam aplikasi berbasis perubahan workflow | Selesai |
| Audit | Pelaku, waktu, aksi, data sebelum/sesudah, alasan, IP | Selesai |
| Responsif dan dark mode | Desktop, tablet, mobile, sidebar mobile, tema lokal | Selesai |
| CasaOS | Dockerfile, Compose, volume persisten, installer, updater, health check | Selesai |
| Backup | Database dari UI dan arsip volume melalui script | Selesai |
| Notifikasi eksternal | Email/WhatsApp | Phase 2 |
| Export laporan | Excel/PDF otomatis | Phase 2 |
| Restore lengkap dari UI | Validasi paket, rollback, restart terkontrol | Phase 2 |
| Integrasi platform sosial | Publisher dan metrik otomatis melalui API resmi | Phase 3 |

## Aturan kritis yang diterapkan

1. Status tidak dapat melompati tahap workflow.
2. Vendor tidak memiliki menu approval, pengguna, pengaturan, atau kredensial sosial.
3. Vendor hanya melihat konten yang terhubung ke vendornya.
4. Seluruh pengguna dapat membuka Media Library, tetapi hanya Admin/Koordinator yang dapat mengelola versi dan status.
5. Aset kedaluwarsa/arsip tidak dapat diunduh oleh vendor maupun user baca-saja.
6. Konten sensitif hanya dapat disetujui Approver atau Super Admin.
7. Perubahan substansial setelah approval membuka kembali proses review.
8. Konten tayang tidak dapat diedit atau dihapus permanen.
9. Publikasi harus melalui status Terjadwal dan wajib memiliki URL atau bukti.
10. Seluruh tindakan penting tersimpan dalam audit log.
