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
    "/api/upload-receipt": ["./tessdata/**"],
    "/api/telegram/webhook": ["./tessdata/**"],
  },
};

export default nextConfig;
