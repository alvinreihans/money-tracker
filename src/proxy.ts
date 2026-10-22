import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { alamatInternal } from "@/lib/format";

/**
 * Bisa dibuka tanpa masuk. API menjawab 401 sendiri (bukan dialihkan ke
 * halaman masuk), /auth/callback dan /reset-password dipakai tautan email.
 */
const PUBLIK = ["/login", "/reset-password", "/manifest.webmanifest"];
const PUBLIK_AWALAN = ["/auth/", "/api/"];

/**
 * Proxy (dulu "middleware" di Next.js <=15) me-refresh session Supabase
 * pada tiap request agar cookie auth selalu valid untuk Server Components
 * & Route Handlers. Wajib ada saat memakai @supabase/ssr.
 */
export async function proxy(request: NextRequest) {
  const response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Memicu refresh token bila perlu.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname, search, searchParams } = request.nextUrl;
  // Cookie session yang baru di-refresh ikut dibawa ke respons pengalihan.
  const alihkan = (tujuan: string) => {
    const r = NextResponse.redirect(new URL(tujuan, request.url));
    for (const c of response.cookies.getAll()) r.cookies.set(c);
    return r;
  };

  // Sudah masuk: halaman masuk tidak ada gunanya, langsung ke tujuan.
  if (user && pathname === "/login") {
    const lanjut = alamatInternal(searchParams.get("lanjut"), "/");
    return alihkan(lanjut.startsWith("/login") ? "/" : lanjut);
  }

  // Belum masuk: masuk dulu, lalu kembali ke halaman yang tadi dibuka.
  const publik = PUBLIK.includes(pathname) || PUBLIK_AWALAN.some((a) => pathname.startsWith(a));
  if (!user && !publik) {
    return alihkan(pathname === "/" ? "/login" : `/login?lanjut=${encodeURIComponent(pathname + search)}`);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
