import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get("college_erp_access_token")?.value;
  const role = (request.cookies.get("college_erp_user_role")?.value || "").toUpperCase();

  const isProtected =
    pathname.startsWith("/admin") ||
    pathname.startsWith("/teacher") ||
    pathname.startsWith("/student") ||
    pathname.startsWith("/papers") ||
    pathname.startsWith("/settings");

  if (isProtected) {
    if (!token) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }

    if (pathname.startsWith("/admin") && role !== "ADMIN") {
      const target = role === "TEACHER" ? "/teacher" : "/student";
      return NextResponse.redirect(new URL(target, request.url));
    }

    if (pathname.startsWith("/teacher") && role !== "TEACHER" && role !== "ADMIN") {
      return NextResponse.redirect(new URL("/student", request.url));
    }

    if (pathname.startsWith("/student") && role !== "STUDENT" && role !== "ADMIN") {
      return NextResponse.redirect(new URL("/teacher", request.url));
    }
  }

  if (pathname === "/login" && token) {
    const target = role === "ADMIN" ? "/admin" : role === "TEACHER" ? "/teacher" : "/student";
    return NextResponse.redirect(new URL(target, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/teacher/:path*",
    "/student/:path*",
    "/papers/:path*",
    "/settings/:path*",
    "/login",
  ],
};
