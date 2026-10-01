# Matriks Implementasi Konsep AXINDO Media Hub

Dokumen ini memetakan konsep pada PDF **Konsep AXINDO Media Hub 2026** ke implementasi repository versi 0.11.0.

| Area konsep | Implementasi 0.11.0 | Status |
|---|---|---|
| Dual brand AINET / IMAS | Master brand, warna, filter, badge, dan branding UI | Selesai |
| Permintaan dan brief | Form tujuan, audiens, kampanye, format, channel, CTA, deadline, anggaran | Selesai |
| Usulan ide Vendor | Vendor membuat ide dan brief lengkap; Koordinator terpilih menyetujui, meminta revisi, atau menolak sebelum produksi | Selesai |
| Versi brief Vendor | Snapshot materi dan lampiran tersimpan pada setiap pengiriman ulang beserta keputusan serta catatan review | Selesai |
| Metode produksi | Pilihan Produksi Vendor atau Internal Koordinator; metode dikunci setelah produksi dimulai | Selesai |
| Penugasan vendor | Khusus mode Vendor: Koordinator, vendor, Direksi terpilih, dan Petugas Upload per platform | Selesai |
| Produksi dan draft | Vendor atau Koordinator dapat mengunggah hasil sesuai mode; upload besar bertahap, berversi, dan ber-checksum | Selesai |
| Review dan revisi | Keputusan Koordinator, catatan revisi wajib, diskusi vendor, dan jejak workflow | Selesai |
| Persetujuan | Direksi tertentu, link tanpa kedaluwarsa, PIN pribadi Direksi 8 digit, versi final terikat, salin link, dan pencabutan | Selesai |
| Video Instan | Asisten mengunggah video internal tanpa proses produksi panjang; approval Koordinator melalui link dan PIN pribadi | Selesai |
| Keputusan Video Instan | Koordinator menyetujui, meminta revisi, atau meneruskan video kepada Direksi dari halaman link | Selesai |
| Edit materi Vendor | Akses per kolom dari Koordinator, usulan tambahan non-destruktif, review terima/tolak, atribusi nama Vendor | Selesai |
| Ringkasan materi | Snapshot read-only, lampiran terpilih, masa berlaku 12 jam, dan pencabutan | Selesai |
| Jadwal | Channel, waktu, dan Petugas Upload terpisah per platform; dapat ditambah atau diedit Koordinator sebelum tayang | Selesai |
| Bukti tayang | URL, screenshot/PDF, waktu, channel, dan metrik | Selesai |
| Raw Footage | Galeri foto/video mentah terpisah, kategori, metadata, preview, dan pengaitan ke Brief Produksi | Selesai |
| Raw Footage Asisten | Asisten dapat upload serta mengubah metadata miliknya tanpa hak arsip, hapus, atau mengubah footage pengguna lain | Selesai |
| Akses Raw Footage Vendor | Vendor hanya melihat serta mengunduh footage yang ditautkan ke tugasnya | Selesai |
| Media Library | Aset final dalam enam kategori, versi, masa berlaku, checksum, status, owner | Selesai |
| Akses vendor ke Library | Baca/unduh aset aktif tanpa hak kelola | Selesai |
| Aset kedaluwarsa | Otomatis berstatus kedaluwarsa dan terkunci untuk non-pengelola | Selesai |
| Promosi draft menjadi aset | Versi disetujui dapat disalin ke Media Library | Selesai |
| Dashboard per role | Data otomatis mengikuti cakupan akses pengguna | Selesai |
| Laporan | Status, brand, vendor SLA, reach, engagement, leads, biaya/lead | Selesai |
| Notifikasi | Notifikasi dalam aplikasi berbasis perubahan workflow | Selesai |
| Audit | Pelaku, waktu, aksi, data sebelum/sesudah, alasan, IP | Selesai |
| Responsif dan dark mode | Desktop, tablet, mode aplikasi Android, navigasi bawah berbasis role, PWA, tema lokal | Selesai |
| Ubuntu Server | Dockerfile, Compose, volume persisten lokal, installer, updater, health check | Selesai |
| Backup | Database dari UI dan arsip volume melalui script | Selesai |
| AXINDO ID / SSO | Popup web AXINDO Access, kode satu kali + PKCE, provisioning, sinkronisasi grup/role; Authentik tetap backend | Selesai |
| Notifikasi eksternal | Email/WhatsApp | Phase 2 |
| Export laporan | Excel/PDF otomatis | Phase 2 |
| Restore lengkap dari UI | Validasi paket, rollback, restart terkontrol | Phase 2 |
| Integrasi platform sosial | Publisher dan metrik otomatis melalui API resmi | Phase 3 |

## Aturan kritis yang diterapkan

1. Status tidak dapat melompati tahap workflow.
2. Vendor tidak memiliki menu approval, pengguna, pengaturan, atau kredensial sosial.
3. Vendor hanya melihat konten yang terhubung ke vendornya.
4. Seluruh pengguna dapat membuka Media Library, tetapi hanya Admin/Koordinator yang dapat mengelola versi dan status.
5. Raw Footage terpisah dari Media Library; Vendor hanya dapat membukanya setelah ditautkan ke tugas produksi.
6. Aset kedaluwarsa/arsip tidak dapat diunduh oleh vendor maupun user baca-saja.
7. Video Instan diputuskan Koordinator melalui link dan PIN pribadi, bukan tombol approval di dalam aplikasi.
8. Koordinator dapat meneruskan Video Instan kepada satu Direksi tertentu; PIN setiap approver hanya diketahui pemiliknya.
9. Perubahan substansial setelah approval membuka kembali proses review.
10. Konten tayang tidak dapat diedit atau dihapus permanen.
11. Setiap platform wajib memiliki URL atau bukti; konten selesai setelah seluruh jadwal dipublikasikan.
12. Seluruh tindakan penting tersimpan dalam audit log.
13. Pengguna internal masuk melalui AXINDO ID; Login Personal hanya tersedia untuk Super Admin dan Vendor.
14. Akun tanpa grup Authentik yang dipetakan tidak memperoleh akses Media Hub.
