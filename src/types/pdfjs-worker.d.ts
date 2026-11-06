// pdfjs-dist tidak menyertakan deklarasi untuk modul worker-nya (dimuat
// langsung di proses server, lihat src/lib/rekening/pdf.ts).
declare module "pdfjs-dist/legacy/build/pdf.worker.mjs";
