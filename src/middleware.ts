import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/constants";
import { verifySession } from "@/lib/auth/jwt";
import { ROUTE_GUARDS } from "@/lib/auth/rbac";

const PUBLIC_PATHS = ["/", "/login", "/auth/invitation", "/denegado"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublic = PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );

  const session = await verifySession(
    request.cookies.get(SESSION_COOKIE)?.value,
  );

  // Usuario autenticado que vuelve al login -> a su dashboard.
  if (session && (pathname === "/login" || pathname === "/")) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (isPublic) return NextResponse.next();

  if (!session) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // El guard más específico gana (ROUTE_GUARDS está ordenado de más a menos).
  const guard = ROUTE_GUARDS.find((entry) =>
    pathname === entry.prefix || pathname.startsWith(`${entry.prefix}/`),
  );

  if (guard && !guard.roles.includes(session.role)) {
    return NextResponse.redirect(new URL("/denegado", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Todo salvo assets estáticos, imágenes optimizadas y favicon.
     */
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
