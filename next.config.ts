import type { NextConfig } from "next";

/**
 * Berkas yang harus ikut ter-deploy bersama kedua route OCR.
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
  "./node_modules/regenerator-runtime/**",
  "./node_modules/is-url/**",
  "./node_modules/wasm-feature-detect/**",
  // Hanya dipakai bila global.fetch tidak ada. Node di Vercel punya, jadi
  // praktis tak terpakai — tapi biayanya kecil dan menutup satu jalan gagal.
  "./node_modules/node-fetch/**",
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

const standalone =
  process.env.npm_lifecycle_event === "build:standalone" ||
  process.env.BUILD_STANDALONE === "1";

const nextConfig: NextConfig = {
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

  // tesseract.js & sharp memuat binary/WASM lewat path runtime. Kalau ikut
  // di-bundle, resolusi path-nya rusak saat dijalankan di serverless.
  serverExternalPackages: ["tesseract.js", "sharp"],

  outputFileTracingIncludes: {
    "/api/upload-receipt": BERKAS_OCR,
    "/api/telegram/webhook": BERKAS_OCR,
  },
};

export default nextConfig;
