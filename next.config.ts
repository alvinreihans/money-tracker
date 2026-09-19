import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
