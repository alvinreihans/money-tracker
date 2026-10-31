// ESLint (flat config). `next lint` dihapus di Next 16, jadi `npm run lint`
// memanggil ESLint langsung dengan aturan resmi Next.js.
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "archive/**", ".receipt-test/**", "e2e/hasil/**", "public/sw.js", ".claude/**", "Review Markdown Instructions/**"]),
]);
