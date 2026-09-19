import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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

  // traineddata di-vendor di repo (lihat src/lib/ocr.ts). File ini tidak pernah
  // di-import lewat `import`, jadi tracing Next tidak bisa menemukannya sendiri
  // dan harus disebut eksplisit — kalau tidak, OCR gagal di produksi.
  outputFileTracingIncludes: {
    // tesseract.js memuat worker-nya lewat path yang dirakit saat runtime
    // (`path.join(__dirname, ...)`), dan WASM core-nya juga tidak pernah
    // di-`import`. Tracing statis Next tidak bisa mengikuti keduanya, jadi
    // berkasnya harus disebut eksplisit — kalau tidak, OCR jalan di lokal
    // tapi fungsinya gagal dimuat di produksi.
    "/api/upload-receipt": [
      "./tessdata/**",
      "./node_modules/tesseract.js/src/worker-script/**",
      "./node_modules/tesseract.js-core/**",
    ],
    "/api/telegram/webhook": [
      "./tessdata/**",
      "./node_modules/tesseract.js/src/worker-script/**",
      "./node_modules/tesseract.js-core/**",
    ],
  },
};

export default nextConfig;
