/**
 * Pengetahuan aplikasi untuk Tanya AI (SPEC-asisten-agen §4): fakta ringkas &
 * tetap tentang cara Money Tracker bekerja, disisipkan di prompt sistem.
 * Ditulis sebagai fakta, bukan contoh jawaban. WAJIB ikut diperbarui bila
 * perilaku aplikasi berubah (sumbernya spec di docs/specs/ yang disebut).
 */
export const PENGETAHUAN_APLIKASI = `Cara kerja aplikasi Money Tracker (fakta, untuk menjelaskan dan menyelidiki):

Kantong (SPEC-ai-kantong, SPEC-saldo-waktu, SPEC-simpanan, SPEC-tujuan-tabungan)
- Kantong = tempat uang: bank, e-wallet (DANA, GoPay, OVO, ShopeePay, …), tunai, kartu kredit, dan orang (piutang/utang dengan seseorang). Kantong Tunai bawaan selalu ada.
- Saldo kantong = saldo awal (berlaku sejak tanggal & jam tertentu) + pemasukan − pengeluaran − pindah keluar + pindah masuk, hanya dari transaksi tercatat sejak saldo awal itu. Draft tidak dihitung.
- Simpanan = tabungan/pocket atau deposito di dalam satu kantong bank. Saldo bank yang tampil = gabungan saldo kantong itu + simpanan di dalamnya, sama dengan m-banking. Deposito terkunci: hanya berubah lewat aksinya sendiri (buat, jatuh tempo, cairkan).
- Tujuan tabungan (mis. dana darurat) adalah kantong berisi uang yang disisihkan, punya target & tenggat. Belanja yang dibayar dari tujuan tabungan tidak dihitung sebagai pengeluaran bulan itu.
- Kantong orang & kartu kredit dihitung di Utang & Piutang, bukan aset.

Jenis transaksi
- Pengeluaran, pemasukan, dan pindah kantong. Pindah kantong = uang berpindah antar kantong milik pengguna sendiri (top up e-wallet dari bank, tarik tunai, setor ke tujuan tabungan). Pindah kantong BUKAN pengeluaran/pemasukan: tidak masuk laporan, total saldo tetap.
- Top up e-wallet yang kantongnya belum ada akan tercatat sebagai pengeluaran (uangnya seolah hilang). Perbaikannya: buat kantong e-wallet itu; aplikasi lalu menawarkan "Jadikan pindah kantong?" untuk transaksi lama yang tampaknya ke kantong itu (SPEC-kantong-sendiri), dan sisi lain yang sudah tercatat terpisah digabung.
- Ikutan: biaya admin dan cashback dicatat sebagai transaksi kecil yang menempel ke transaksi induknya.
- Transaksi bisa dipecah jadi beberapa bagian beda kategori (struk campuran); bagian pecahan menunjuk transaksi aslinya.
- Cicilan: rencana cicilan (paylater, kartu kredit) dengan jatuh tempo; pembayaran cicilan menempel ke rencananya.

Cara mencatat
- Catat lewat ketikan, foto struk, screenshot bukti bayar/transfer, atau unggah banyak gambar. Hasilnya selalu jadi kartu "Periksa dulu": baru dihitung ke saldo setelah pengguna menekan Simpan (SPEC-periksa-dulu).
- Draft = transaksi yang belum disimpan (status needs_review): "Belum selesai" (masih ada yang ditanya: kantong, kantong tujuan, jam, arah kirim/terima) atau "Tinggal dicek". Draft tidak memengaruhi saldo dan laporan.
- "Cara dicatat" di detail transaksi menyimpan asal catatan, teks/ringkasan hasil baca AI, tanya-jawab, dan thumbnail gambarnya.
- Dugaan dobel: hasil Catat yang sama persis dengan transaksi tercatat ditandai, tidak langsung tersimpan.

Rekening koran (SPEC-impor-rekening)
- Impor PDF rekening koran SeaBank, Jago, dan BRI. Tiap baris bank menyimpan pengenal (ref_bank) yang juga memuat saldo bank sesudah baris itu. Angka bank menang: nominal & tanggal dari rekening koran adalah angka bank.
- Baris yang sudah tercatat (mis. dari screenshot) ditautkan, tidak ditambah dua kali. Pindah antar rekening sendiri yang sama-sama diimpor jadi satu pindah kantong (dua sisi).
- Baris tanpa merchant/kategori yang jelas ditandai "perlu dilengkapi". Lengkapi dari gambar (screenshot/struk) mengisi merchant & kategorinya tanpa mengubah angka bank (SPEC-lengkapi).
- Urutan impor yang benar: rekening koran dulu, lalu screenshot, lalu struk. Sebaliknya bisa membuat dobel bila pencocokan gagal.
- Pratinjau impor membandingkan saldo akhir menurut bank dengan saldo aplikasi; bila beda, ada tawaran "Samakan saldo awal".

Kenapa saldo aplikasi bisa beda dengan bank
- Transaksi dobel (mis. dicatat dari screenshot dan juga dari rekening koran tapi tidak tertaut).
- Pindah kantong yang tercatat sebagai pengeluaran + pemasukan terpisah, atau top up ke e-wallet yang kantongnya belum ada.
- Pindah kantong yang dicatat manual ke/dari kantong ini padahal tidak ada di rekening koran (atau sebaliknya).
- Transaksi sesudah periode rekening koran terakhir, draft yang belum disimpan, atau saldo awal yang salah/berlaku sejak tanggal yang salah.
- Bunga, pajak, dan biaya admin bank yang belum tercatat.

Analitik & budget
- Laporan bulanan hanya menghitung pengeluaran & pemasukan tercatat; pindah kantong tidak ikut. Metode budgeting pilihan pengguna (per kategori, 50/30/20, 6 Jars, Kakeibo, Zero-Based, Pay Yourself First) membagi pengeluaran ke wadah.

Batas asisten (tahap ini)
- Asisten hanya membaca dan menjelaskan. Asisten belum bisa membuat kantong, mengubah, menghapus, atau menyimpan transaksi; satu-satunya usulan perubahan adalah ubah kategori per merchant (kartu Ubah). Untuk perbaikan lain, jelaskan langkahnya di aplikasi (mis. Profil → Kantong → tambah kantong; buka transaksi → Ubah; Belum selesai di Beranda).`;
