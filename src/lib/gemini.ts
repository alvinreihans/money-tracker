import { GoogleGenerativeAI } from "@google/generative-ai";

/**
 * Inisialisasi Google Gen AI (Gemini).
 * Lazy singleton: instance dibuat sekali per cold-start lambda, lalu di-reuse.
 * API key WAJIB server-only (jangan pakai prefix NEXT_PUBLIC_).
 */
let cachedClient: GoogleGenerativeAI | null = null;

export function getGeminiClient(): GoogleGenerativeAI {
  if (cachedClient) return cachedClient;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Env GEMINI_API_KEY belum di-set.");
  }

  cachedClient = new GoogleGenerativeAI(apiKey);
  return cachedClient;
}

/**
 * Model pembaca gambar (SPEC-catat-andal): Flash-Lite, ditulis persis. Alias
 * `-latest` pernah diam-diam pindah ke gemini-3.8-flash yang kuota gratisnya
 * 20/hari dan pernah butuh 64 detik. Bisa diganti lewat env GEMINI_MODEL di
 * Vercel tanpa deploy ulang.
 */
export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
