1.Tambahkan Fungsi Pengajuan Isi saldo masing2 staff di cabang tersebut dengan permintaan melalu chat room yg terkoneksi ke sheet Form Isi saldo di spreadsheet RAOS sama seperti tampilan,Fungsi dll di PWA https://isisaldo.vercel.app/ dan spreadsheet https://docs.google.com/spreadsheets/d/1T7gvlIPt2Un2mca43803oGpdMakaFuEUiSF7Z\_KeXqU/edit?gid=786718606#gid=786718606 file nya ad di Local C:\\Projects\\menala\\rifim-isi-saldo
target  cabang bukan Nominal saja tapi ada 2 jenis :
Order (Jumlah Scan Valid)
Saldo (nominal)
ID Cabang :
Cabang Aktif

1. ID Rifim Airport Batam
2. ID Rifim Airport Jambi
3. ID Rifim Airport Balikpapan
4. ID Rifim Airport Manado
5. ID Rifim Airport Pekanbaru
6. ID Rifim Airport Makassar
7. ID Rifim Airport Soeta (Khusus Order)
-. T1
-. T2
-. T3
ID Rifim Batam
ID Rifim Jambi Luar

bisakah PWA Raos ditambah 7 cabang dengan syarat :

1. setiap staff di satu cabang hanya bisa akses dan fungsikan cabang tersebut kecuali Room Chat Umum,pengumman dan khsuus staff dan Absensi berlaku untuk semua Cabang
2. Akses masing2 kordinator hanya bisa akses cabang nya sendiri
3. Akses admin,management dan Direksi bisa akses semua cabang
4. geofencing sesuai masing2 bandara > cek di file di Local C:\\Projects\\menala\\radms-driver
5. waktu mengikuti lokasi cabang tersebut seperti WIB,WIT,WITA
6. Driver hanya bisa akses untuk cabang nya sendiri
7. SHeet absen untuk semua cabang
8. sheet Target bonus untuk semua cabang
9. Chat Pribadi berlaku hanya untuk akses driver dan Staff di cabang tersebut begitu juga dengan semua AKSEs dan Pengaturan ROOM Chat
10. data driver yg tampil di pwa sesuai cabang nya
11. data riwayat yg tampil sesuai cabang
12. scan barcode sesuai database driver dan staff cabang masing2
13. PWA RAOS Terkoneksi ke PWA Rifim-os https://rifim-os.vercel.app/  yg berisi Modul SMART OFFICE,HRIS,RAOS,FINANCE,CRM,DASHBOARD DIREKSI sebagai PWA Pusat > File di C:\\Projects\\menala\\rifim-os
14. Fungsi antrean driver seperti konsep PWA tapi dibuat skrg Permintaan antrian,Monitoring antrian dan Panggilan driver oleh staff hanya Melalui Chat room Driver di cabang tersebut >https://radms-driver.vercel.app/login > file di Local C:\\Projects\\menala\\radms-driver
15. PWA Raos dibagi menjadi 5 PWA user berbeda yg memiliki akses,fungsi dan icon HP berbeda juga yaitu :
* PWA STaff > Khusus staff
* PWA Koordinator > Khusus Koordinator
* PWA Managaement > Khusus Management
* PWA Direksi > Khusus Direksi
* PWA Driver > Khsus Driver
17. Icon HP kamu buat seperti Icon yg skrg hanya ditambah Di bawah Logo M tulisan : M (bawahnya Tulisan : Staff,Driver,Koordinator,Admin,Management,Direksi)
18. PWA staff Hanya Bisa Lihat Riwayat Scan,Absen,isi saldo punya nya sendiri > 1 hari,7 hari,30hr
19. PWA driver Hanya Bisa Lihat Riwayat Order,antrian,Pengisisa saldo punya nya sendiri > 1 hari,7 hari,30hr
20. PWA Koordinator Bisa Lihat Riwayat Scan,Absen,isi saldo,antrian,order semua staff dan driver di cabangnya > 1 hari,7 hari,30hr
21. Akses dan Fungsi admin di Chat room bisa diakses juga oleh Koordinator masing2 Cabang
22. Semua Upgrade sekarang disinkronkran dengan spreadshet RAOS tidak boleh ke spreadsheet lain > https://docs.google.com/spreadsheets/d/1eYS2mM3Sy-BNAVGfp8BUHtsZuLiGDetnJeGw-AWk\_\_8/edit?usp=sharing
23. Segala yg membutuhkan Penyimpanan Data di pusatkan di Folder drive dan buat subfolder bila di perlukan  > https://drive.google.com/drive/folders/136ItduoAa\_abdiYpOSJS1G3X7ti0YUrU
24. upgrade disesuaikan dengan Blueprint,Rule Project,Claude,status dan ssot driver dan staff apabila ada Perubahan wajib di validasi saya
25. Upgrade Tidak Boleh mengurangi fungsi atau menghilangkan fungsi yg ada saat ini di PWA,Github,GAS,Vercel dan SUpabase
26. setiap update file apapun di Local folder wajib juga update file tersebut di github agar setiap sesi konsisten dengan Blueprint project,rule project dan claude..terutama di sesion\_prompt


Fungsi Isi saldo di room Chat :

Nominal per cabang yaitu 
1. /isisaldo 45000,95000,145000,195000
2. ID Rifim Airport Batam > 45000,95000
3. ID Rifim Airport Jambi > 45000,95000
4. ID Rifim Airport Balikpapan >45000,95000,145000,195000
5. ID Rifim Airport Manado > 45000,95000
6. ID Rifim Airport Pekanbaru > 45000,95000,145000,195000
7. ID Rifim Airport Makassar > 45000,95000,145000,195000
8. ID Rifim Batam > 45000,95000
9. ID Rifim Jambi Luar > 45000,95000
10. sync ke sheet (otomatis real time  atau staff tekan tombol kirim manual)
11. Koordinator/admin approve/reject: Koordinator hanya mengetahui melalui Riwayat dan Tombol Validasi seluruh Pengisian tidak mempengaruhi pengiriman ke sheet
12. di riwayat staff  Muncul Saldo sudah diisi atau belum diisi oleh admin (Pin Kuning,Hijau)
13. di riwayat Driver  Muncul Saldo sudah diisi atau belum diisi oleh admin (Pin Kuning,Hijau)
14. di riwayat Koordinator  Muncul Saldo sudah diisi atau belum diisi oleh admin (Pin Kuning,Hijau) dan di riwayat Validasi Ada Tombol Validasi 
15. beri Notifikasi bila sudah diisi Ke PWA staff,Driver,Koordinator
16. di PWA driver ada Chat otomatis dari admin "terimakasih sudah melakukan Pengisian saldo (nominal),silahkan bekerja....)
17. Jumlah Nominal di sheet Target staff otomatis bertambah jumlah pencapaian Target
18. di Room Chat Pengisian saldo akan muncul chat Pemberitahuan saldo belum diisi  apabila dalam 5 menit belum diiisi seperti di gambar.
19. Di halaman Validasi Koordinator ada Jumlah nominal seluruh pengisian saldo di Cabang tersebut yg sudah di isi oleh admin dengan Validasi centang di sheet Form isi saldo

