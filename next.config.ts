import fs from "node:fs";
import type { NextConfig } from "next";

/**
 * Seluruh dependensi yang dideklarasikan tesseract.js.
 *
 * Dibaca dari package.json-nya, bukan diketik ulang. Worker thread bisa
 * me-require mana saja dari daftar itu, dan tracing Next tidak pernah
 * menelusurinya karena worker dimuat lewat path yang dirakit saat runtime.
 * Setiap paket yang terlewat berakhir sama: thread mati diam-diam dan OCR
 * menggantung sampai kena tenggat.
 */
const DEP_TESSERACT = Object.keys(
  (
    JSON.parse(
      fs.readFileSync("./node_modules/tesseract.js/package.json", "utf8"),
    ) as { dependencies?: Record<string, string> }
  ).dependencies ?? {},
).map((nama) => `./node_modules/${nama}/**`);

/**
 * Berkas yang harus ikut ter-deploy bersama route OCR.
 *
 * Tracing Next hanya mengikuti `import`/`require` statis. Semua yang ada di
 * sini justru dimuat lewat jalan lain, sehingga tak terlihat oleh tracing dan
 * harus disebut satu per satu. Kalau terlewat, OCR tetap jalan di lokal —
 * karena node_modules lengkap — tapi gagal di produksi.
 */
const BERKAS_OCR = [
  // traineddata di-vendor di repo (lihat src/lib/ocr.ts), dibaca lewat path.
  "./tessdata/**",

  // tesseract.js menjalankan OCR di worker thread terpisah, dan merakit path
  // worker-nya saat runtime (`path.join(__dirname, ...)`).
  //
  // Seluruh src/ disertakan, bukan cuma worker-script/. Berkas di dalamnya
  // me-require ke luar direktori sendiri (mis. utils/dump.js -> ../../constants/
  // imageType), sehingga menyebut worker-script/ saja meninggalkan lubang yang
  // baru terasa saat runtime. Isinya JavaScript semua, jadi murah.
  "./node_modules/tesseract.js/src/**",

  // Dependensi milik worker thread itu. Inilah yang paling mudah terlewat:
  // tracing memang menelusuri tesseract.js, tapi berhenti sebelum worker-script
  // karena tidak ada rantai import statis menuju ke sana — jadi dependensi
  // worker tidak pernah ikut terbawa.
  //
  // Kegagalannya senyap dan mahal. `require` yang gagal di dalam worker memicu
  // event 'error', sedangkan tesseract.js memasang penangannya lewat
  // `worker.onerror = ...` — properti milik Web Worker, bukan worker_threads.
  // Penanganya tak pernah terpasang, janji createWorker tak pernah selesai,
  // dan permintaannya menggantung sampai fungsinya dimatikan tanpa satu pun
  // pesan error. (src/lib/ocr.ts memasang tenggat sebagai jaring pengaman.)
  // Didaftar otomatis, bukan manual. Mendaftar sendiri sudah meleset dua kali
  // — `wasm-feature-detect` lolos, lalu `bmp-js` — karena worker me-require
  // dari berkas yang tidak terpikir diperiksa. Selama daftarnya ikut apa yang
  // dideklarasikan tesseract.js, kesalahan itu tidak bisa terulang.
  ...DEP_TESSERACT,

  // Ekor transitif dari node-fetch, yang tidak ikut terbawa daftar di atas.
  "./node_modules/whatwg-url/**",
  "./node_modules/tr46/**",
  "./node_modules/webidl-conversions/**",

  // WASM core: di-require dengan nama yang dipilih saat runtime, jadi tidak
  // terlihat oleh tracing. Kita memakai OEM.LSTM_ONLY, sehingga hanya varian
  // -lstm yang pernah dimuat; tiga varian legacy sisanya ~25 MB yang cuma
  // memperlambat cold start.
  "./node_modules/tesseract.js-core/package.json",
  "./node_modules/tesseract.js-core/*-lstm*",

  // sharp memuat libvips lewat dlopen saat runtime, dari paket @img yang
  // TERPISAH dari binary .node-nya. Tracing tidak bisa mengikuti dlopen, jadi
  // di produksi binary-nya ada tapi pustakanya tidak:
  //   ERR_DLOPEN_FAILED: libvips-cpp.so.8.18.6: cannot open shared object file
  // Paket linux ini tidak terpasang di mesin Windows, tapi ada saat Vercel
  // menjalankan build-nya — di situlah glob ini dievaluasi.
  "./node_modules/@img/sharp-linux-x64/**",
  "./node_modules/@img/sharp-libvips-linux-x64/**",
];

const dev = process.env.NODE_ENV === "development";
const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

/**
 * - CSP: skrip, gaya, gambar, dan worker hanya dari aplikasi ini; koneksi
 *   data hanya ke aplikasi ini & Supabase. 'unsafe-inline' untuk skrip
 *   dibutuhkan Next (data RSC disisipkan inline); skrip dari situs lain tetap
 *   ditolak. Mode dev butuh eval & websocket untuk hot reload.
 * - frame-ancestors / X-Frame-Options: halaman tidak bisa dibingkai situs lain
 *   (clickjacking).
 * - Permissions-Policy: kamera hanya untuk aplikasi ini (foto struk); mikrofon
 *   & lokasi tidak dipakai.
 */
const HEADER_KEAMANAN = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self'",
      `connect-src 'self' ${supabase}${dev ? " ws: wss:" : ""}`,
      "worker-src 'self' blob:",
      "media-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join("; "),
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
];

const standalone =
  process.env.npm_lifecycle_event === "build:standalone" ||
  process.env.BUILD_STANDALONE === "1";

const nextConfig: NextConfig = {
  // Nomor versi yang tampil di aplikasi, dari satu sumber: package.json (lihat
  // CHANGELOG.md). Ditanam saat build, jadi browser tidak perlu memuat
  // package.json yang berisi daftar dependensi.
  env: {
    NEXT_PUBLIC_VERSI: (JSON.parse(fs.readFileSync("./package.json", "utf8")) as { version: string }).version,
  },

  // Dinyalakan lewat `npm run build:standalone` untuk menguji hasil tracing
  // secara lokal. Keluarannya berisi node_modules versi ciut — hanya berkas
  // yang dianggap perlu — jadi berkas yang terlewat langsung ketahuan tanpa
  // harus deploy dulu. Membaca .nft.json saja tidak cukup: itu baru klaim Next
  // soal apa yang dibutuhkan, dan klaim itu pernah meleset.
  //
  // Nama skrip dipakai sebagai penanda, bukan variabel lingkungan, supaya
  // jalan sama saja di PowerShell maupun bash.
  output: standalone ? "standalone" : undefined,

  // Next memblokir permintaan lintas-origin ke aset dev secara bawaan. Saat
  // menguji dari HP lewat terowongan (ngrok/Cloudflare), origin-nya bukan
  // localhost sehingga chunk JS ditolak: halaman tampil tapi React tidak
  // pernah terpasang, jadi tidak ada satu pun yang bisa diklik.
  //
  // Hanya berlaku di mode dev — produksi tidak terpengaruh.
  allowedDevOrigins: [
    "*.ngrok-free.dev",
    "*.ngrok-free.app",
    "*.ngrok.io",
    "*.trycloudflare.com",
  ],

  // Halaman yang baru dibuka disimpan 30 detik di browser, jadi bolak-balik
  // Beranda ↔ Riwayat ↔ Pengaturan tampil seketika tanpa menunggu server.
  // Aman karena setiap simpan/ubah/hapus memanggil router.refresh(), yang
  // mengosongkan simpanan ini — data yang baru diubah tidak pernah basi.
  experimental: {
    staleTimes: { dynamic: 30 },
  },

  // Header keamanan untuk semua halaman (KAJIAN-KEAMANAN-DATA, 22 Okt 2026).
  async headers() {
    return [{ source: "/(.*)", headers: HEADER_KEAMANAN }];
  },

  // tesseract.js & sharp memuat binary/WASM lewat path runtime. Kalau ikut
  // di-bundle, resolusi path-nya rusak saat dijalankan di serverless.
  serverExternalPackages: ["tesseract.js", "sharp"],

  outputFileTracingIncludes: {
    "/api/upload-receipt": BERKAS_OCR,
  },
};

export default nextConfig;
