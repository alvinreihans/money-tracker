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
 * Nama model default. `gemini-flash-latest` otomatis menunjuk ke model Flash
 * terbaru yang tersedia untuk akun (saat ini gemini-3.5-flash) — aman untuk
 * akun baru karena tidak kena pembatasan model lama yang di-retire.
 * Untuk production yang butuh perilaku 100% konsisten, pin ke versi spesifik
 * (mis. "gemini-3.5-flash") setelah dites.
 */
export const GEMINI_MODEL = "gemini-flash-latest";
