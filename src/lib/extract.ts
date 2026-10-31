import { SchemaType, type GenerationConfig } from "@google/generative-ai";
import { getGeminiClient, GEMINI_MODEL } from "@/lib/gemini";
import { runGroqChain, parseJsonLoose } from "@/lib/groq";
import { isoLokal } from "@/lib/format";
import type { BuktiTransfer } from "@/lib/arah";
import type { InfoPaylater } from "@/lib/pinjaman";
import type { PetunjukJam } from "@/lib/waktu";
import { KATEGORI_BAWAAN, kategoriJenis, LAINNYA, type Kategori } from "@/lib/kategori";
import type { ExtractedReceipt, TransactionType } from "@/types/transaction";

/**
 * Petunjuk untuk kategori bawaan. Kategori buatan user tidak punya petunjuk;
 * model memilihnya dari arti namanya ("Kopi", "Kucing", "Kos").
 */
const PETUNJUK: Record<string, string> = {
  food: "makan/jajan/kopi/gorengan",
  groceries: "belanja bulanan/indomaret/supermarket",
  transport: "gojek/grab/bensin/parkir/tol",
  shopping: "baju/elektronik/tokopedia/shopee",
  health: "obat/dokter/rumah sakit",
  entertainment: "nonton/game/langganan",
  bills: "listrik/pln/air/pulsa/internet/wifi",
  fees: "biaya admin/biaya transfer",
  salary: "gaji/gajian",
  bonus: "bonus/THR/insentif",
  business: "jualan/usaha/omzet",
  freelance: "freelance/proyek/dibayar klien",
  gift: "dikasih/hadiah/angpao/kiriman ortu",
  refund: "cashback/refund/pengembalian dana",
  investment: "bunga/dividen/hasil investasi",
};

/**
 * Yang perlu diketahui model tentang user: kategorinya, orang & kartu kredit
 * (Lend & Borrow), dan rencana cicilannya — supaya memakai nama yang persis.
 */
export interface KonteksAI {
  kategori: Kategori[];
  pihak?: string[];
  cicilan?: { nama: string; penyedia: string | null }[];
}

const KONTEKS_BAWAAN: KonteksAI = { kategori: KATEGORI_BAWAAN };

/** Daftar kategori milik user untuk satu jenis, sebagai baris prompt. */
const daftarPrompt = (kategori: Kategori[], type: "expense" | "income") =>
  kategoriJenis(kategori, type)
    .map((k) => `    - ${k.slug} = ${k.name}${PETUNJUK[k.slug] ? ` (mis. ${PETUNJUK[k.slug]})` : ""}`)
    .join("\n");

/** Nominal pelengkap dari model (biaya admin, cashback): angka > 0 atau null. */
const nominalAtauNull = (v: unknown) => (Number(v) > 0 ? Math.round(Number(v)) : null);

/** "Hari ini" menurut WIB: server berjalan di UTC, jadi catatan sebelum
 * 07.00 WIB dulu ikut bertanggal kemarin. */
function toISODate(d: Date): string {
  return isoLokal(d);
}

// ---------------------------------------------------------------------------
// Prompt bersama (dipakai Groq maupun Gemini agar hasilnya konsisten)
// ---------------------------------------------------------------------------

function buildSystemPrompt(todayISO: string, { kategori, pihak = [], cicilan = [] }: KonteksAI): string {
  return `Anda adalah mesin ekstraksi data transaksi keuangan berbahasa Indonesia.
Kembalikan HANYA objek JSON valid sesuai skema.

Skema:
{
  "amount": number,
  "type": "income" | "expense" | "transfer",
  "merchant": string | null,
  "category": string,
  "transaction_date": "YYYY-MM-DD",
  "time": "HH:MM" | null,
  "time_hint": "pagi" | "siang" | "sore" | "malam" | "lampau" | null,
  "description": string | null,
  "payment_method": string | null,
  "payment_target": string | null,
  "fee": number | null,
  "cashback": number | null,
  "pinjaman": { "arah": "beri" | "terima_bayar" | "pinjam" | "bayar", "pihak": string } | null,
  "cicilan": string | null,
  "paylater": { "penyedia": string, "tenor": number | null, "per_cicilan": number | null, "jatuh_tempo": "YYYY-MM-DD" | null } | null,
  "document_type": "receipt" | "payment_proof",
  "bukti_transfer": { "pengirim": { "nama": string | null, "bank": string | null }, "penerima": { "nama": string | null, "bank": string | null } } | null,
  "kelompok": "kebutuhan" | "keinginan" | "tabungan" | "berbagi" | null,
  "rincian": [{ "amount": number, "category": string, "kelompok": "kebutuhan" | "keinginan" | "tabungan" | "berbagi" | null, "description": string | null }] | null,
  "usulan_pecah": [{ "category": string, "kelompok": "kebutuhan" | "keinginan" | "tabungan" | "berbagi" | null, "subtotal": number, "barang": string }] | null
}

Aturan:
- amount: nilai KEWAJIBAN transaksi, dalam angka murni Rupiah tanpa simbol
  maupun pemisah ribuan.
  Pahami singkatan: "10k"/"10rb"/"10ribu" = 10000, "1,5jt"/"1.5juta" = 1500000.

  Pada struk belanja, ambil baris TOTAL / TOTAL BELANJA / GRAND TOTAL / JUMLAH.
  JANGAN mengambil:
    * TUNAI / CASH / BAYAR / TENDER  -> itu uang yang diserahkan pembeli
    * KEMBALI / KEMBALIAN / CHANGE   -> itu uang kembalian
    * SUBTOTAL, harga satuan, PPN, atau diskon
  Bila baris TOTAL terbaca, SELALU pakai angka itu apa adanya. Jangan pernah
  menghitung ulang dari TUNAI dikurangi KEMBALI: kedua baris itu justru lebih
  sering salah baca, dan hasil hitungnya akan menimpa angka yang sudah benar.
  Contoh: "TOTAL 37.000 / TUNAI 50.000 / KEMBALI 19.000" -> amount = 37000,
  meskipun 50.000 - 19.000 tidak sama dengan 37.000.
  Hanya bila TOTAL benar-benar tidak ada, pakai TUNAI - KEMBALI sebagai dugaan.

  Pada bukti pembayaran digital (ShopeePay/GoPay/OVO/DANA/QRIS), ambil nominal
  utama transaksi yang biasanya tercetak paling besar di bagian atas. JANGAN
  mengambil angka promo/iklan ("Cashback up to ...", "Cashback Saldo s.d
  Rp100.000", baris "Download Aplikasi"), sisa saldo, nomor kartu, PAN, RRN,
  atau ID transaksi. Kalau nominal utamanya tidak terbaca, amount 0 — jangan
  mengambil angka lain sebagai gantinya.
  Bila ada rincian harga dan potongan, amount = yang BENAR-BENAR dibayar setelah
  diskon ("Kamu Membayar", "Total Bayar", "Total Pembayaran"), BUKAN harga sebelum
  diskon ("Total Pembelian", "Subtotal"). Contoh: "Kamu Membayar Rp15.680 / Total
  Pembelian Rp35.680 / SPayLater Diskon -Rp20.000" -> amount 15680.
- type: arah uang dari sudut pandang PEMILIK catatan.
  "income" bila uang MASUK ke pemilik: gaji/gajian, THR, bonus, cashback,
  refund, bunga, hasil jual barang, atau uang yang dikasih/dikirim/ditransfer
  orang lain ("dikasih ibu", "dapet dari teman", "terima transferan", "dibayar klien").
  "expense" bila uang KELUAR untuk membeli, membayar, atau memberi ke orang lain (default).
  "transfer" HANYA untuk memindahkan uang antar rekening/dompet milik sendiri:
  topup e-wallet ("topup gopay 100rb dari bca"), tarik tunai, atau "pindahin
  500rb dari bca ke seabank". Transfer ke orang lain atau bayar tagihan tetap
  "expense".
  Bukti transfer antar dua pihak dari aplikasi bank/e-wallet (ada pengirim —
  "Dari"/"Pengirim"/"Sumber Dana" — DAN penerima berupa nama orang — "Ke"/
  "Penerima"/"Tujuan"): Anda TIDAK tahu siapa pemilik catatan, jadi JANGAN
  menebak arahnya — bukti itu bisa kiriman orang lain kepada pemilik. Isi
  bukti_transfer (lihat di bawah), lalu type "expense", merchant = nama
  penerima, payment_method = bank pengirim, payment_target null; aplikasi
  yang memutuskan arah akhirnya.
  Topup ke e-wallet/akun layanan (tujuannya nama layanan, bukan nama orang)
  tetap "transfer" seperti biasa, dengan bukti_transfer null.
- bukti_transfer: HANYA untuk bukti transfer antar dua pihak (lihat type), selain itu null.
  nama = nama pengirim/penerima persis seperti tertulis (boleh tersamar, mis.
  "ALV*** R***"); bank = nama bank/dompet SINGKAT seperti payment_method
  ("BANK SEABANK INDONESIA" -> "SeaBank", "Saldo ShopeePay" -> "ShopeePay").
  Bank pengirim yang tidak tertulis boleh diambil dari logo/nama aplikasi
  bukti itu (bukti dari aplikasi OCBC -> "OCBC"). Nomor rekening bukan nama bank.
- kelompok: HANYA untuk "expense", dan HANYA bila jelas berbeda dari kelompok
  biasa kategorinya; selain itu null (aplikasi memakai kelompok kategorinya).
  "keinginan": makan di restoran mewah/fine dining, kafe premium, tiket
  konser, liburan. "berbagi": zakat, sedekah, infak, donasi, kado/hadiah.
  "tabungan": beli emas, reksadana, saham, deposito, setor tabungan/investasi.
  Makan biasa, belanja harian, bensin, tagihan: null.
- rincian: HANYA bila pengguna MENGETIK sendiri rincian belanja campuran
  dengan nominal per bagian, mis. "15rb di indomaret, 10rb sabun 5rb kopi"
  -> amount 15000, rincian [{amount 10000, category "groceries", kelompok
  null, description "sabun"}, {amount 5000, category "food", kelompok
  "keinginan", description "kopi"}]. Jumlah semua amount rincian HARUS sama
  dengan amount. Jangan diisi dari struk/daftar barang di gambar; selain itu null.
- usulan_pecah: HANYA untuk struk belanja (gambar atau teks OCR) yang daftar barangnya
  terbaca dan barangnya masuk ke DUA kategori atau lebih (mis. beras & sabun = groceries,
  cokelat & minuman ringan = food). Satu objek per kategori: category = slug kategorinya,
  kelompok seperti aturan kelompok di bawah (null bila biasa), subtotal = jumlah harga
  barang-barang itu SEBELUM diskon/PPN/biaya layanan (aplikasi yang membagi potongannya),
  barang = nama barangnya singkat ("Beras 5 kg, sabun"). Semua barang satu kategori,
  daftar barang tidak terbaca, bukti bayar e-wallet, atau teks ketikan: null.
- category: isi dengan SLUG (kiri) dari daftar milik user di bawah, sesuai type.
  Pilih berdasarkan arti NAMA kategorinya (kanan); kalau ada yang lebih spesifik
  dan cocok, pilih yang itu. Kalau tidak ada yang cocok: "other".
  Untuk "expense":
${daftarPrompt(kategori, "expense")}
  Untuk "income":
${daftarPrompt(kategori, "income")}
  Untuk "transfer" selalu "other".
- merchant: nama toko/tempat/lokasi bila ada, jika tidak null. Untuk
  "income": sumber uangnya bila disebut ("Ibu", "Kantor"). Nama bank/dompet
  BUKAN merchant — itu payment_method.
- transaction_date: format "YYYY-MM-DD". Jika tidak disebut, gunakan hari ini: ${todayISO}.
- time: jam transaksi format 24 jam "HH:MM" bila TERTERA di struk/bukti ("Waktu Selesai
  23 Okt 2026, 13:57" -> "13:57"; "14:05:33" -> "14:05") atau DISEBUT ("jam 10" -> "10:00",
  "jam 2 siang" -> "14:00", "pukul 19.30" -> "19:30"). Jangan menebak. Selain itu null.
- time_hint: HANYA bila time null. Bagian hari yang disebut: "pagi", "siang", "sore",
  "malam" ("tadi pagi beli roti" -> "pagi"). "lampau" bila teks menyatakan sudah terjadi
  tanpa bagian hari ("tadi beli roti", "tadi bayar parkir"). Tanpa petunjuk waktu sama
  sekali ("kopi 25rb gopay", "kemarin makan") -> null.
- description: cerita/konteks transaksi yang DITULIS ORANG, boleh null.
  Utamakan catatan dari pengguna atau pengirim: berita transfer, "Keperluan
  Transfer", "Catatan", catatan pesanan ("Kado nikahan Rina", "Bayar arisan
  Oktober", "Patungan makan tim"). Teks bawaan aplikasi yang tidak bercerita
  ("Transfer Dana", "Pembayaran", "Top Up", "Transfer", "Pembelian") BUKAN
  description -> null. Untuk struk belanja tanpa catatan: ringkasan singkat
  barangnya boleh ("Beras 5 kg, minyak goreng"), atau null.
- payment_method: metode bayar bila disebut, normalkan istilah gaul/singkatan:
  "sopipay"/"spay"/"shopee pay"=ShopeePay; "gopay"=GoPay; "ovo"=OVO; "dana"=DANA;
  "qris"=QRIS; "cash"/"tunai"/"cod"=Tunai; "transfer"/"tf"/"m-banking"=Transfer;
  "kartu"/"debit"/"kredit"/"visa"=Kartu. Jika tidak disebut null.
  Kalau nama bank/dompet disebut, pakai NAMA itu, bukan "Transfer"/"Kartu":
  "tf mandiri" -> Mandiri; "masuk seabank" -> SeaBank; "debit bca" -> BCA.
  Untuk "income", ini rekening/dompet tempat uang MASUK ("masuk bca", "ke bri" -> BRI).
  Untuk "transfer", ini rekening/dompet ASAL uangnya ("tarik tunai dari bca" -> BCA).
- payment_target: HANYA untuk "transfer", rekening/dompet TUJUAN dengan
  normalisasi yang sama ("topup gopay dari bca" -> GoPay; tarik tunai -> Tunai).
  Selain transfer null.
- fee: HANYA untuk "transfer": biaya admin yang disebut ("admin 1000", "biaya 2,5rb"
  -> 2500). Selain itu null.
- cashback: HANYA untuk "expense": cashback yang BENAR-BENAR didapat dari belanja
  itu ("cashback 5rb", "dapet koin 2rb"). BUKAN promo "Cashback up to ...". Selain itu null.
  Cashback tanpa belanja ("dapet cashback 5rb") adalah "income" kategori refund.
- pinjaman: HANYA untuk meminjamkan/meminjam uang dengan ORANG atau kartu kredit
  (kata seperti minjemin, pinjem, utang, balikin, nyicil utang). Isi type "transfer",
  payment_method = rekening/dompet milik user yang dipakai, dan:
    "beri"          = aku meminjamkan ke dia ("minjemin budi 200rb dari bca")
    "terima_bayar"  = dia membayar/mengembalikan pinjamannya ke aku ("budi balikin 100rb ke bca")
    "pinjam"        = aku meminjam dari dia ("pinjem uang ibu 1jt masuk bri")
    "bayar"         = aku membayar utangku ke dia / tagihan kartu kredit ("bayar utang ke ibu 500rb pake bri")
  pihak = nama ORANG-nya atau nama kartu kreditnya — BUKAN nama bank/dompet tempat uangnya
  masuk/keluar (itu payment_method). Perhatikan siapa yang bergerak: kalau orang lain yang
  membayar/mengembalikan ke aku ("budi balikin", "dibayar budi", "ditransfer budi utangnya")
  itu "terima_bayar". Bayar tagihan kartu kredit ("bayar tagihan cc bca", "lunasin kartu
  kredit") = "bayar" dengan pihak kartu kreditnya.${pihak.length ? ` Kalau orangnya sudah ada di daftar ini, pakai nama persisnya: ${pihak.join(", ")}.` : ""}
  Transfer/bayar ke orang yang BUKAN pinjaman (bayar jasa, kirim hadiah) tetap "expense" dengan pinjaman null.
- cicilan: HANYA untuk "expense" yang membayar cicilan paylater/kartu kredit ("bayar cicilan
  spaylater 150rb"). Isi dengan nama barang atau penyedia yang disebut.${
    cicilan.length
      ? ` Rencana cicilan milik user (nama — penyedia): ${cicilan.map((c) => `${c.nama}${c.penyedia ? ` — ${c.penyedia}` : ""}`).join("; ")}. Pakai nama barang atau penyedia persis dari daftar ini.`
      : ""
  } Selain itu null.
- paylater: HANYA untuk "expense" yang DIBAYAR pakai paylater (SPayLater/Shopee PayLater, GoPayLater,
  Kredivo, Akulaku, Atome, Indodana, Traveloka PayLater). Paylater BUKAN e-wallet: "SPayLater" bukan
  ShopeePay, "GoPayLater" bukan GoPay — payment_method null. penyedia = nama paylater-nya; tenor =
  berapa kali cicilan bila tertera/disebut ("3x", "cicilan 3 bulan", "SPayLater - 3 Bulan" = 3;
  OCR bisa memecah "Bulan" ke baris berikutnya), "bayar bulan depan"/"30 hari"/"- 1 Bulan" = 1;
  per_cicilan & jatuh_tempo bila tertera. Yang tidak ada null. Selain itu paylater null.
  Membayar tagihan/cicilan paylater = field cicilan, bukan paylater.
- document_type: "payment_proof" bila ini tangkapan layar bukti bayar dari
  aplikasi (ShopeePay/GoPay/OVO/DANA/QRIS/m-banking), "receipt" bila ini struk
  kertas dari mesin kasir. Dipakai untuk mencegah transaksi tercatat dua kali
  saat rekening koran diimpor.

Contoh teks ketikan (field lain mengikuti aturan di atas):
- "dikasih duit ibu 500k ke bri" -> type "income", amount 500000, merchant "Ibu", payment_method "BRI", payment_target null
- "gajian 8jt masuk bca" -> type "income", amount 8000000, merchant null, payment_method "BCA"
- "topup gopay 100rb dari bca" -> type "transfer", payment_method "BCA", payment_target "GoPay"
- "transfer ke budi 50rb pake bca" -> type "expense", merchant "Budi", payment_method "BCA"
- bukti "Dikirim Dari ALVIN ***, Kirim Ke BUDI KUSNANDAR BCA: 6090069720, Sumber Dana Saldo ShopeePay, Rp10.000"
  -> type "expense", amount 10000, merchant "Budi Kusnandar", payment_method "ShopeePay", payment_target null
- "kopi 25rb gopay" -> type "expense", payment_method "GoPay"
- "beli pulsa 50rb shopeepay cashback 5rb" -> type "expense", payment_method "ShopeePay", cashback 5000
- "topup gopay 100rb dari bca admin 1000" -> type "transfer", payment_method "BCA", payment_target "GoPay", fee 1000
- "minjemin budi 200rb dari bca" -> type "transfer", payment_method "BCA", pinjaman { "arah": "beri", "pihak": "Budi" }
- "budi balikin 100rb ke bca" -> type "transfer", payment_method "BCA", pinjaman { "arah": "terima_bayar", "pihak": "Budi" }
- "bayar tagihan kartu kredit bca 2jt dari bca" -> type "transfer", payment_method "BCA", pinjaman { "arah": "bayar", "pihak": "Kartu kredit BCA" }
- "bayar cicilan spaylater 150rb pake bca" -> type "expense", payment_method "BCA", cicilan "Shopee PayLater"
- "beli hp 3jt kredivo 6x" -> type "expense", payment_method null, paylater { "penyedia": "Kredivo", "tenor": 6, "per_cicilan": null, "jatuh_tempo": null }

Jangan menambahkan teks/penjelasan/markdown di luar JSON.`;
}

// Konteks tambahan khusus teks OCR: model harus tahu inputnya kotor.
const OCR_CONTEXT = `Teks berikut berasal dari OCR struk belanja, jadi mungkin mengandung
salah baca karakter (0/O, 1/l, 8/B), baris terpotong, atau kolom yang tercampur.
Gunakan penalaran untuk memulihkan angka yang masuk akal. Jika nominal total
benar-benar tidak dapat ditentukan, kembalikan amount 0.`;

// ---------------------------------------------------------------------------
// Normalisasi & validasi
// ---------------------------------------------------------------------------

/** Bukti transfer dari model: kedua pihak ada dan minimal satu bernama; selain itu null. */
function buktiAtauNull(b: unknown): BuktiTransfer | null {
  const o = b as { pengirim?: Record<string, unknown>; penerima?: Record<string, unknown> } | null | undefined;
  const teks = (x: unknown) => (typeof x === "string" && x.trim() ? x.trim().slice(0, 80) : null);
  const pihak = (p?: Record<string, unknown>) => ({ nama: teks(p?.nama), bank: teks(p?.bank) });
  if (!o?.pengirim || !o?.penerima) return null;
  const hasil = { pengirim: pihak(o.pengirim), penerima: pihak(o.penerima) };
  return hasil.pengirim.nama || hasil.penerima.nama ? hasil : null;
}

const KELOMPOK_SAH = ["kebutuhan", "keinginan", "tabungan", "berbagi"];
const kelompokAtauNull = (k: unknown) => (typeof k === "string" && KELOMPOK_SAH.includes(k) ? k : null);

/**
 * Rincian belanja campuran (SPEC-metode-budget): minimal dua bagian bernominal
 * yang jumlahnya persis sama dengan amount; selain itu dibuang (tetap satu
 * transaksi utuh — lebih baik tidak dipecah daripada salah pecah).
 */
function rincianAtauNull(r: unknown, amount: number, kategori: Kategori[]): ExtractedReceipt["rincian"] {
  if (!Array.isArray(r) || r.length < 2 || r.length > 10) return null;
  const keluar = kategoriJenis(kategori, "expense");
  const bagian = r.map((b) => {
    const o = (b ?? {}) as Record<string, unknown>;
    const slug = typeof o.category === "string" ? o.category.trim() : "";
    return {
      amount: Number(o.amount) || 0,
      category: keluar.some((k) => k.slug === slug) ? slug : LAINNYA,
      kelompok: kelompokAtauNull(o.kelompok),
      description: typeof o.description === "string" && o.description.trim() ? o.description.trim().slice(0, 200) : null,
    };
  });
  if (bagian.some((b) => !(b.amount > 0))) return null;
  return bagian.reduce((n, b) => n + b.amount, 0) === amount ? bagian : null;
}

/**
 * Usulan pecah struk campuran (SPEC-tawar-pecah): subtotal per kategori dari
 * AI (sebelum diskon/pajak) diskalakan ke amount yang benar-benar dibayar,
 * sisa pembulatan ke bagian terbesar — jumlahnya selalu pas. Dibuang bila
 * kurang dari 2 atau lebih dari 10 bagian, semua sekategori, ada subtotal ≤ 0,
 * atau Σ subtotal menyimpang > 25% dari amount (tanda salah baca).
 */
export function usulanPecah(u: unknown, amount: number, kategori: Kategori[]): ExtractedReceipt["usulan_pecah"] {
  if (!Array.isArray(u) || u.length < 2 || u.length > 10 || !(amount > 0)) return null;
  const keluar = kategoriJenis(kategori, "expense");
  const mentah = u.map((b) => {
    const o = (b ?? {}) as Record<string, unknown>;
    const slug = typeof o.category === "string" ? o.category.trim() : "";
    return {
      subtotal: Number(o.subtotal) || 0,
      category: keluar.some((k) => k.slug === slug) ? slug : LAINNYA,
      kelompok: kelompokAtauNull(o.kelompok),
      description: typeof o.barang === "string" && o.barang.trim() ? o.barang.trim().slice(0, 200) : null,
    };
  });
  const total = mentah.reduce((n, b) => n + b.subtotal, 0);
  if (mentah.some((b) => !(b.subtotal > 0)) || new Set(mentah.map((b) => b.category)).size < 2) return null;
  if (Math.abs(total - amount) > amount * 0.25) return null;
  const bagian = mentah.map(({ subtotal, ...b }) => ({ ...b, amount: Math.floor((amount * subtotal) / total) }));
  const terbesar = bagian.reduce((i, b, j) => (b.amount > bagian[i].amount ? j : i), 0);
  bagian[terbesar].amount += amount - bagian.reduce((n, b) => n + b.amount, 0);
  return bagian.every((b) => b.amount > 0) ? bagian.map(({ amount, category, kelompok, description }) => ({ amount, category, kelompok, description })) : null;
}

/**
 * Rapikan hasil mentah model menjadi ExtractedReceipt yang konsisten.
 * `dariStruk`: hanya jalur struk (Gemini Vision, OCR → Groq) yang boleh
 * membawa usulan pecah; teks ketikan memakai rincian.
 */
export function normalize(parsed: Partial<ExtractedReceipt>, kategori: Kategori[] = KATEGORI_BAWAAN, dariStruk = false): ExtractedReceipt {
  const p = parsed.pinjaman as { arah?: unknown; pihak?: unknown } | null | undefined;
  const pinjaman =
    p && typeof p.pihak === "string" && p.pihak.trim() && ["beri", "terima_bayar", "pinjam", "bayar"].includes(p.arah as string)
      ? { arah: p.arah as NonNullable<ExtractedReceipt["pinjaman"]>["arah"], pihak: p.pihak.trim().slice(0, 40) }
      : null;
  // Pinjaman selalu pindah kantong, apa pun type yang ditebak model.
  const type: TransactionType = pinjaman
    ? "transfer"
    : parsed.type === "income" || parsed.type === "transfer"
      ? parsed.type
      : "expense";

  // Kategori di luar daftar milik user (atau terhapus) jatuh ke "Lainnya".
  const slug = typeof parsed.category === "string" ? parsed.category.trim() : "";
  const category = kategoriJenis(kategori, type).some((k) => k.slug === slug) ? slug : LAINNYA;

  return {
    amount: Number(parsed.amount) || 0,
    type,
    category,
    merchant: parsed.merchant?.toString().trim() || null,
    description: parsed.description?.toString().trim() || null,
    payment_method: parsed.payment_method?.toString().trim() || null,
    payment_target: type === "transfer" ? parsed.payment_target?.toString().trim() || null : null,
    fee: type === "transfer" ? nominalAtauNull(parsed.fee) : null,
    cashback: type === "expense" ? nominalAtauNull(parsed.cashback) : null,
    pinjaman,
    cicilan: type === "expense" && typeof parsed.cicilan === "string" && parsed.cicilan.trim() ? parsed.cicilan.trim().slice(0, 60) : null,
    // Membayar cicilan paylater (field cicilan) bukan belanja paylater baru.
    paylater: type === "expense" && !(typeof parsed.cicilan === "string" && parsed.cicilan.trim()) ? paylaterAtauNull(parsed.paylater) : null,
    document_type: parsed.document_type === "payment_proof" ? "payment_proof" : "receipt",
    bukti_transfer: pinjaman ? null : buktiAtauNull(parsed.bukti_transfer),
    kelompok: type === "expense" ? kelompokAtauNull(parsed.kelompok) : null,
    rincian: type === "expense" && !pinjaman ? rincianAtauNull(parsed.rincian, Number(parsed.amount) || 0, kategori) : null,
    usulan_pecah: dariStruk && type === "expense" && !pinjaman ? usulanPecah(parsed.usulan_pecah, Number(parsed.amount) || 0, kategori) : null,
    transaction_date:
      typeof parsed.transaction_date === "string" && parsed.transaction_date
        ? parsed.transaction_date
        : toISODate(new Date()),
    ...jamAtauNull(parsed.time, parsed.time_hint),
  };
}

/** Paylater yang sah: penyedia wajib; tenor 1–120, nominal & tanggal hanya bila masuk akal. */
function paylaterAtauNull(p: unknown): InfoPaylater | null {
  const x = p as Partial<Record<keyof InfoPaylater, unknown>> | null | undefined;
  if (!x || typeof x.penyedia !== "string" || !x.penyedia.trim()) return null;
  const tenor = Number(x.tenor);
  return {
    // Satu ejaan per penyedia (sama dengan saran di form cicilan): model kadang
    // menulis "SPayLater", "Shopee PayLater", bahkan "ShopeePay".
    penyedia: /shopee|spay/i.test(x.penyedia) ? "Shopee PayLater" : /gopay|gojek/i.test(x.penyedia) ? "GoPayLater" : x.penyedia.trim().slice(0, 40),
    tenor: Number.isInteger(tenor) && tenor >= 1 && tenor <= 120 ? tenor : null,
    per_cicilan: nominalAtauNull(x.per_cicilan),
    jatuh_tempo: typeof x.jatuh_tempo === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x.jatuh_tempo) ? x.jatuh_tempo : null,
  };
}

/** "HH:MM" yang sah, atau petunjuk bagian hari bila jamnya tidak ada. */
function jamAtauNull(time: unknown, hint: unknown): Pick<ExtractedReceipt, "time" | "time_hint"> {
  const m = typeof time === "string" ? time.trim().match(/^(\d{1,2})[:.](\d{2})/) : null;
  if (m && Number(m[1]) <= 23 && Number(m[2]) <= 59) return { time: `${m[1].padStart(2, "0")}:${m[2]}`, time_hint: null };
  const h = typeof hint === "string" ? hint.trim().toLowerCase() : "";
  return { time: null, time_hint: ["pagi", "siang", "sore", "malam", "lampau"].includes(h) ? (h as PetunjukJam) : null };
}

/**
 * Gerbang validasi terakhir sebelum data masuk database.
 * Hasil yang lolos parsing JSON belum tentu masuk akal: model bisa mengembalikan
 * amount 0 atau tanggal ngawur ketika inputnya tidak terbaca.
 */
export function isValidExtraction(r: ExtractedReceipt, kategori: Kategori[] = KATEGORI_BAWAAN): boolean {
  if (!Number.isFinite(r.amount) || r.amount <= 0) return false;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.transaction_date)) return false;
  const date = new Date(`${r.transaction_date}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return false;

  // Toleransi 1 hari ke depan untuk selisih zona waktu.
  const besok = new Date(Date.now() + 86_400_000);
  const batasBawah = new Date("2000-01-01T00:00:00Z");
  if (date > besok || date < batasBawah) return false;

  return r.type === "transfer" || kategoriJenis(kategori, r.type).some((k) => k.slug === r.category);
}

/**
 * Tenor paylater dari teks bukti bayar ("Metode Pembayaran SPayLater - 3 Bulan")
 * kalau model melewatkannya — OCR sering memecah "Bulan" ke baris lain.
 */
export function tenorDariTeks(teks: string): number | null {
  const m = teks.match(/later\s*-\s*(\d{1,2})\b/i);
  const n = m ? Number(m[1]) : NaN;
  return n >= 1 && n <= 36 ? n : null;
}

/** Baris iklan/promo di struk & bukti bayar ("Cashback Saldo s.d Rp100.000", "Download Aplikasi"). */
const BARIS_PROMO = /\bs\.?\s?d\b|s\/d|\bhingga\b|\bup to\b|\bmaks|\bpromo|\bvoucher|\bdownload|\bunduh/i;

/**
 * Nominal hasil AI yang di teks OCR hanya muncul di baris promo — tanda
 * nominal aslinya tidak terbaca dan model mengambil angka iklan (bukti
 * ShopeePay Rp 5.000 terbaca Rp 100.000 dari "Cashback Saldo s.d Rp100.000").
 * Nominal yang tidak tertulis di teks sama sekali tidak dinilai di sini.
 */
export function nominalDariPromo(teks: string, amount: number): boolean {
  const bentuk = [String(amount), amount.toLocaleString("id-ID"), amount.toLocaleString("en-US")];
  const baris = teks.split("\n").filter((b) => {
    const rapat = b.replace(/\s+/g, "");
    return bentuk.some((x) => new RegExp(`(^|[^\\d.,])${x.replace(/[.,]/g, "\\$&")}(?![\\d]|[.,]\\d)`).test(rapat));
  });
  return baris.length > 0 && baris.every((b) => BARIS_PROMO.test(b));
}

// ---------------------------------------------------------------------------
// Jalur utama: Groq (teks)
// ---------------------------------------------------------------------------

export interface GroqExtraction {
  extracted: ExtractedReceipt;
  model: string;
}

/**
 * Ekstraksi satu transaksi lewat rantai model Groq: dari teks OCR struk, atau
 * dari teks yang `diketik` pengguna di Catat (tanpa peringatan OCR — kalau
 * dibilang struk, model melewatkan rincian ketikan dan menjumlah ulang nominal).
 */
export async function extractWithGroq(
  text: string,
  konteks: KonteksAI = KONTEKS_BAWAAN,
  diketik = false,
): Promise<GroqExtraction> {
  const { value, model } = await runGroqChain<Partial<ExtractedReceipt>>(
    buildSystemPrompt(toISODate(new Date()), konteks),
    diketik ? `Teks berikut diketik langsung oleh pengguna:\n---\n${text}` : `${OCR_CONTEXT}\n\n---\n${text}`,
  );
  return { extracted: normalize(value, konteks.kategori, !diketik), model };
}

// ---------------------------------------------------------------------------
// Jaring pengaman: Gemini Vision (gambar asli, melewati OCR sepenuhnya)
// ---------------------------------------------------------------------------

const geminiSchema: GenerationConfig["responseSchema"] = {
  type: SchemaType.OBJECT,
  properties: {
    amount: { type: SchemaType.NUMBER },
    type: { type: SchemaType.STRING, format: "enum", enum: ["income", "expense", "transfer"] },
    merchant: { type: SchemaType.STRING, nullable: true },
    category: { type: SchemaType.STRING },
    transaction_date: { type: SchemaType.STRING },
    time: { type: SchemaType.STRING, nullable: true },
    time_hint: { type: SchemaType.STRING, format: "enum", enum: ["pagi", "siang", "sore", "malam", "lampau"], nullable: true },
    description: { type: SchemaType.STRING, nullable: true },
    payment_method: { type: SchemaType.STRING, nullable: true },
    payment_target: { type: SchemaType.STRING, nullable: true },
    fee: { type: SchemaType.NUMBER, nullable: true },
    cashback: { type: SchemaType.NUMBER, nullable: true },
    pinjaman: {
      type: SchemaType.OBJECT,
      nullable: true,
      properties: {
        arah: { type: SchemaType.STRING, format: "enum", enum: ["beri", "terima_bayar", "pinjam", "bayar"] },
        pihak: { type: SchemaType.STRING },
      },
    },
    cicilan: { type: SchemaType.STRING, nullable: true },
    paylater: {
      type: SchemaType.OBJECT,
      nullable: true,
      properties: {
        penyedia: { type: SchemaType.STRING },
        tenor: { type: SchemaType.INTEGER, nullable: true },
        per_cicilan: { type: SchemaType.NUMBER, nullable: true },
        jatuh_tempo: { type: SchemaType.STRING, nullable: true },
      },
    },
    document_type: { type: SchemaType.STRING, format: "enum", enum: ["receipt", "payment_proof"] },
    bukti_transfer: {
      type: SchemaType.OBJECT,
      nullable: true,
      properties: {
        pengirim: { type: SchemaType.OBJECT, properties: { nama: { type: SchemaType.STRING, nullable: true }, bank: { type: SchemaType.STRING, nullable: true } }, required: ["nama", "bank"] },
        penerima: { type: SchemaType.OBJECT, properties: { nama: { type: SchemaType.STRING, nullable: true }, bank: { type: SchemaType.STRING, nullable: true } }, required: ["nama", "bank"] },
      },
      required: ["pengirim", "penerima"],
    },
    kelompok: { type: SchemaType.STRING, format: "enum", enum: ["kebutuhan", "keinginan", "tabungan", "berbagi"], nullable: true },
    usulan_pecah: {
      type: SchemaType.ARRAY,
      nullable: true,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          category: { type: SchemaType.STRING },
          kelompok: { type: SchemaType.STRING, format: "enum", enum: ["kebutuhan", "keinginan", "tabungan", "berbagi"], nullable: true },
          subtotal: { type: SchemaType.NUMBER },
          barang: { type: SchemaType.STRING },
        },
        required: ["category", "subtotal", "barang"],
      },
    },
  },
  // bukti_transfer wajib ada (boleh null): kalau opsional, model sering
  // melewatkannya dan bukti kiriman orang lain jadi tercatat pengeluaran.
  required: ["amount", "type", "category", "transaction_date", "bukti_transfer"],
};

/**
 * Pilihan terakhir: baca gambar aslinya langsung dengan model vision.
 * Paling mahal token dan paling terbatas kuotanya, jadi hanya dipakai bila OCR
 * menghasilkan sampah atau seluruh rantai Groq gagal.
 */
export async function extractWithGeminiVision(
  base64Image: string,
  mimeType: string,
  konteks: KonteksAI = KONTEKS_BAWAAN,
  /** Keterangan yang diketik user bersama fotonya. */
  catatan?: string,
): Promise<ExtractedReceipt> {
  const model = getGeminiClient().getGenerativeModel({
    model: GEMINI_MODEL,
    systemInstruction: buildSystemPrompt(toISODate(new Date()), konteks),
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: geminiSchema,
      temperature: 0,
    },
  });

  // Ini pilihan terakhir — tidak ada jalur lain di belakangnya. Gemini kerap
  // membalas 503 "high demand" yang sifatnya sesaat, jadi menyerah pada
  // percobaan pertama berarti membuang struk yang sebenarnya masih bisa dibaca.
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 1500 * attempt)); // 1.5s, lalu 3s
    }
    try {
      const result = await model.generateContent([
        { inlineData: { data: base64Image, mimeType } },
        {
          text: catatan?.trim()
            ? `Ekstrak data dari struk ini.\nCatatan dari pengguna (lebih dipercaya untuk kantong & keterangan): ${catatan.trim()}`
            : "Ekstrak data dari struk ini.",
        },
      ]);
      return normalize(parseJsonLoose(result.response.text()), konteks.kategori, true);
    } catch (err) {
      lastError = err;
      if (!isRetryableGeminiError(err)) throw err;
    }
  }

  throw lastError;
}

/** 429/500/503 bersifat sesaat; sisanya (mis. API key salah) diulang pun gagal. */
function isRetryableGeminiError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /\b(429|500|502|503|504)\b/.test(message) || /high demand|overloaded|timeout/i.test(message);
}
