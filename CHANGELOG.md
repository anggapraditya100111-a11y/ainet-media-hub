# Changelog

## 0.12.1 — 2026-10-08

- Menambahkan tombol Buat Tugas Vendor pada menu Konten untuk Koordinator dan Super Admin.
- Menyederhanakan form tugas menjadi judul, brand, Vendor, instruksi singkat, deadline opsional, serta link atau file referensi.
- Memungkinkan Vendor langsung mengunggah hasil final berupa video, foto, desain, atau dokumen tanpa tahapan produksi lama.
- Membuat link review Koordinator secara otomatis setelah hasil Vendor dikirim, lengkap dengan preview file, keterangannya, dan keputusan menggunakan PIN.
- Memungkinkan Vendor mengirim versi revisi dan otomatis memasukkan hasil yang disetujui ke Media Library.

## 0.12.0 — 2026-10-08

- Menyatukan produksi internal dan Vendor ke alur sederhana: Upload Konten → Review Koordinator → Revisi atau Disetujui → Media Library.
- Mengganti menu Video Instan dengan satu menu Konten untuk upload, pencarian, filter status, review, dan riwayat.
- Memungkinkan Asisten Koordinator, Koordinator, Super Admin, dan Vendor mengunggah hasil jadi berupa video, foto, desain, atau dokumen.
- Mengurangi kolom wajib menjadi judul, brand, jenis konten, Koordinator, dan file final; channel, caption, hashtag, CTA, jadwal, serta Petugas Upload dapat dilengkapi bila diperlukan.
- Menampilkan sumber Produksi Internal atau Produksi Vendor pada detail dan halaman review Koordinator.
- Mempertahankan review melalui link dan PIN Koordinator, termasuk pilihan minta revisi, setujui, atau teruskan ke Direksi.
- Membuat aset Media Library otomatis saat konten sederhana disetujui oleh Koordinator atau Direksi, tanpa tombol tambahan.
- Menjaga seluruh data dan endpoint workflow lama agar riwayat sebelumnya tetap dapat dibuka.

## 0.11.1 — 2026-10-01

- Menampilkan video Video Instan langsung saat link approval Koordinator dibuka, lengkap dengan kontrol putar dan layar penuh.
- Menampilkan nomor konten, brand, channel, rencana tayang, pengunggah, tanggal kirim, versi file, caption, hashtag, dan CTA pada halaman approval.
- Memindahkan input PIN Koordinator ke formulir keputusan sehingga PIN berfungsi sebagai pengesahan Setujui, Minta Revisi, atau Teruskan ke Direksi.
- Tetap membatasi keputusan maksimal lima kegagalan PIN serta menutup link setelah keputusan, pembatalan, atau penerbitan ulang.

## 0.11.0 — 2026-10-01

- Memberikan izin kepada Asisten Koordinator untuk mengunggah foto dan video Raw Footage serta mengubah metadata unggahannya sendiri.
- Tetap membatasi arsip, aktivasi ulang, perubahan footage pengguna lain, dan penghapusan sesuai kewenangan Koordinator atau Super Admin.
- Membuat link approval Koordinator secara otomatis untuk setiap Video Instan dan revisinya.
- Memungkinkan Koordinator membuka link tanpa menavigasi aplikasi, melakukan preview video termasuk layar penuh, lalu memasukkan PIN pribadi 8 digit.
- Menambahkan keputusan Setujui, Minta Revisi dengan catatan wajib, atau Teruskan ke Direksi dari halaman link approval.
- Mengunci link setelah lima kegagalan PIN, keputusan, pembatalan, penggantian file, atau penerbitan link baru serta mencatat seluruh aktivitas pada Audit Log.
- Memungkinkan Asisten, Koordinator terkait, dan Super Admin menyalin, membatalkan, atau menerbitkan ulang link sesuai konteks Video Instan.

## 0.10.0 — 2026-09-30

- Menambahkan role Asisten Koordinator dan pemetaan grup AXINDO ID terkait.
- Menambahkan menu Video Instan untuk mengunggah video internal langsung ke review Koordinator tanpa tahap permintaan, brief, atau produksi.
- Menyimpan setiap revisi Video Instan sebagai versi baru dan melarang Asisten menyetujui unggahannya sendiri.
- Memungkinkan Koordinator menyetujui langsung, meminta revisi, atau meneruskan Video Instan kepada Direksi sebelum penjadwalan.
- Memungkinkan Asisten Koordinator dipilih sebagai Petugas Upload per platform.
- Menambahkan delegasi granular dan dapat dicabut untuk pembuatan permintaan konten serta review proses Vendor, lengkap dengan Audit Log.
- Menambahkan migrasi aman untuk memperluas role SQLite lama tanpa kehilangan akun maupun relasi data.

## 0.9.0 — 2026-09-30

- Menambahkan menu Raw Footage yang terpisah dari Media Library untuk menyimpan foto dan video mentah.
- Menambahkan kategori, brand, tanggal pengambilan, lokasi, tag, deskripsi, pencarian, filter, galeri thumbnail, dan preview layar penuh.
- Memungkinkan Super Admin dan Koordinator mengunggah, mengedit, mengarsipkan, dan memilih Raw Footage untuk Brief Produksi.
- Membatasi Vendor agar hanya dapat melihat dan mengunduh footage yang ditautkan ke tugasnya.
- Memberikan akses lihat kepada Direksi serta membatasi penghapusan permanen hanya untuk Super Admin.
- Memperjelas Media Library sebagai penyimpanan aset final dan materi resmi siap digunakan.

## 0.8.2 — 2026-09-29

- Memperbaiki urutan migrasi database lama agar kolom Sampah dibuat sebelum indeksnya sehingga container dapat berjalan setelah pembaruan.

## 0.8.1 — 2026-09-29

- Menambahkan tindakan hapus pada Ringkasan Progres untuk Super Admin dan Direksi dengan alasan wajib.
- Memindahkan data yang dihapus ke Sampah sehingga tidak tampil pada daftar aktif, kalender, tautan publik, dan laporan.
- Memungkinkan Super Admin dan Direksi memulihkan data beserta seluruh riwayat dan lampirannya.
- Membatasi penghapusan permanen untuk Super Admin setelah masa retensi 30 hari.
- Mencatat pemindahan, pemulihan, dan penghapusan permanen pada Audit Log.

## 0.8.0 — 2026-09-25

- Mengubah Kalender Konten menjadi kalender bulanan dengan navigasi bulan, indikator hari ini, dan agenda tanggal terpilih.
- Menyederhanakan kalender pada layar mobile menjadi indikator jadwal per tanggal serta daftar agenda yang mudah dibaca.
- Menambahkan preview gambar dan PDF langsung di dalam aplikasi.
- Menambahkan player video dan audio tanpa berpindah tab, termasuk kontrol layar penuh untuk video.
- Mempertahankan tombol unduh sebagai tindakan tambahan dan dukungan streaming video agar durasi dapat digeser.

## 0.7.1 — 2026-09-24

- Memperjelas setiap judul materi dengan header, garis aksen, dan jarak yang konsisten.
- Memperkecil tipografi isi agar judul dan materi lebih mudah dibedakan.
- Menampilkan usulan Vendor yang masih menunggu sebagai kartu review khusus.
- Merapikan usulan yang sudah diterima atau ditolak ke dalam bagian Riwayat Usulan yang dapat dibuka saat diperlukan.
- Menyederhanakan label atribusi menjadi Diedit oleh [nama vendor].

## 0.7.0 — 2026-09-24

- Menyederhanakan alur menjadi lima tahap utama: Brief & Diskusi, Produksi, Review Hasil, Approval Direksi opsional, serta Jadwal & Tayang.
- Menghapus tombol Brief Siap dan Pra-Produksi dari alur pengguna; Koordinator kini memakai satu tombol Setujui Brief & Mulai Produksi.
- Mengganti checklist izin edit per kolom dengan satu pilihan Izinkan Vendor membantu menyusun brief.
- Menempatkan kolom Usulan Vendor langsung di bawah Brief, Deskripsi, Caption, Hashtag, dan Call to Action.
- Menempatkan keputusan Terima/Tolak Koordinator pada materi yang sama, lengkap dengan status dan riwayat usulan.
- Menambahkan upload lampiran Brief langsung pada detail konten untuk Vendor yang diizinkan.
- Mengunci materi setelah Produksi dimulai; perubahan berikutnya hanya dibuka pada tahap Revisi.
- Mempertahankan status lama sebagai kompatibilitas database, tetapi menampilkannya sebagai Brief & Diskusi.

## 0.6.0 — 2026-09-24

- Menambahkan alur usulan konten yang seluruh ide dan brief awalnya dibuat oleh Vendor.
- Vendor dapat menyimpan draft, memilih Koordinator reviewer, mengisi materi lengkap, serta mengunggah gambar, video, dan PDF referensi.
- Koordinator dapat menyetujui brief, meminta revisi dengan catatan wajib, atau menolak usulan tanpa mengubah materi milik Vendor.
- Mengunci brief Vendor selama menunggu review dan memulai produksi Vendor secara otomatis setelah brief disetujui.
- Menyimpan snapshot setiap versi brief beserta lampiran, pengirim, keputusan, reviewer, catatan, dan waktu review.
- Menambahkan status khusus Draft Usulan, Menunggu Review Brief, Revisi Brief, dan Usulan Ditolak pada daftar serta detail konten.
- Mempertahankan alur permintaan oleh Koordinator dan pilihan Produksi Internal sebagai alur terpisah.

## 0.5.0 — 2026-09-18

- Menambahkan pilihan metode **Produksi Vendor** atau **Produksi Internal oleh Koordinator** pada permintaan konten.
- Produksi Internal melewati Pra-Produksi Vendor dan langsung masuk dari Brief Siap ke Produksi Internal.
- Koordinator dapat mengunggah hasil final, menyelesaikan produksi internal, lalu menyetujui langsung atau mengirimkannya ke Direksi.
- Menyembunyikan penugasan serta akses edit Vendor untuk konten Internal dan mencegah konten tersebut terlihat oleh akun Vendor.
- Mengunci perubahan metode setelah produksi dimulai serta mencatat metode dan aktivitas internal pada workflow dan audit.
- Menambahkan ringkasan produksi Internal dan Vendor pada Laporan & Performa.

## 0.4.4 — 2026-09-18

- Menambahkan dua pilihan keluar: hanya dari Media Hub atau sekaligus dari AXINDO Access.
- Menampilkan tombol keluar yang tetap mudah dijangkau pada mode mobile.
- Mengarahkan logout terpusat melalui endpoint aman AXINDO Access dengan `return_to` yang tervalidasi.

## 0.4.3 — 2026-09-17

- Mengizinkan Koordinator menambahkan channel upload baru setelah jadwal awal dikirim.
- Mengizinkan channel/platform pada jadwal yang belum tayang untuk diubah bersama waktu dan Petugas Upload.
- Mencegah duplikasi jadwal untuk channel yang sama dan mengunci perpindahan channel setelah tayang.
- Menyelaraskan daftar channel konten, notifikasi petugas, workflow, dan audit setelah channel jadwal berubah.

## 0.4.2 — 2026-09-17

- Menambahkan tombol **Edit Jadwal** per platform untuk Koordinator dan Super Admin.
- Mengizinkan perubahan waktu tayang dan Petugas Upload selama jadwal belum dipublikasikan.
- Mengunci jadwal yang sudah tayang agar riwayat publikasi tetap konsisten.
- Memberi notifikasi kepada petugas lama dan baru saat tugas dialihkan serta mencatat perubahan dalam workflow dan audit log.

## 0.4.1 — 2026-09-17

- Memindahkan kepemilikan PIN approval 8 digit sepenuhnya ke akun Direksi; PIN disimpan dengan hash dan tidak pernah ditampilkan kepada Koordinator.
- Menambahkan pengaturan PIN approval pada menu Profil Direksi, termasuk penggantian PIN dan pembukaan kembali batas percobaan.
- Menambahkan tombol **Salin Link** di samping tombol pembatalan approval tanpa menyalin PIN.
- Mengenkripsi token link approval yang perlu ditampilkan kembali kepada Koordinator.
- Membatalkan link approval aktif dari versi lama saat migrasi agar PIN lama yang pernah terlihat tidak dapat digunakan kembali.
- Menambahkan hingga 10 URL referensi serta upload banyak file gambar, video, atau PDF pada form permintaan konten.
- Menampilkan link dan lampiran referensi pada detail konten untuk alur kerja Koordinator–Vendor.
- Menambahkan checklist Koordinator untuk akses edit Vendor per kolom: Brief, Deskripsi, Caption, Hashtag, Call to Action, dan upload lampiran Brief.
- Perubahan Vendor diproses sebagai usulan tambahan sehingga tulisan Koordinator tidak dapat dihapus; Koordinator dapat menerima atau menolak setiap usulan.
- Menampilkan atribusi **Diedit oleh Vendor** beserta nama vendor pada materi yang usulannya diterima.

## 0.4.0 — 2026-09-16

- Menyederhanakan role operasional menjadi Super Admin, Koordinator Media, Vendor, Direksi, dan Petugas Upload.
- Koordinator menggantikan tahap Reviewer serta memegang keputusan lanjut produksi dan review hasil akhir.
- Menambahkan diskusi Koordinator–Vendor per fase: Brief, Pra-Produksi, dan Hasil Produksi.
- Menambahkan upload besar bertahap dengan progres, pembatalan, resume protokol, versioning, dan checksum.
- Menambahkan link Ringkasan Materi berbasis snapshot yang terbuka selama 12 jam dan dapat dicabut.
- Menambahkan approval Direksi untuk satu Direksi terpilih melalui link tanpa kedaluwarsa dan PIN 8 digit.
- Approval mendukung pratinjau gambar, PDF, video/audio streaming; file Office dan arsip diunduh.
- Menambahkan keputusan revisi/approval Direksi, pembatalan link, batas percobaan PIN, audit, dan invalidasi saat file berubah.
- Menambahkan jadwal serta bukti tayang terpisah per platform dan petugas upload.
- Menyempurnakan antarmuka mobile/PWA ala aplikasi Android untuk diskusi, upload, approval, dan publikasi.

## 0.3.6 — 2026-09-16

- Tambahkan tombol **Edit Deskripsi** untuk vendor pada tugas yang sedang berstatus Produksi.
- Batasi perubahan vendor hanya pada deskripsi tugas miliknya; brief Koordinator dan data lainnya tetap terkunci.
- Tampilkan Brief Produksi dan Deskripsi Produksi sebagai dua informasi terpisah pada detail konten.
- Catat perubahan deskripsi vendor pada audit log.

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
