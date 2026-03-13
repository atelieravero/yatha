import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";
import { NextResponse } from "next/server";

// Initialize the middleware using ONLY the safe Edge configuration
const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const isAuthRoute = req.nextUrl.pathname.startsWith('/api/auth');
  const isLoginPage = req.nextUrl.pathname === '/login';

  // 1. Force Authentication: Bounce unauthorized users to the login screen
  if (!isLoggedIn && !isAuthRoute && !isLoginPage) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  // 2. License Expiry Enforcement
  const expiryDate = process.env.LICENSE_EXPIRY;
  if (expiryDate && isLoggedIn) {
     const today = new Date();
     const expiry = new Date(expiryDate);
     
     if (today > expiry) {
        return new NextResponse("License Expired. Please contact support.", { status: 403 });
     }
  }

  return NextResponse.next();
});

// Matcher ensures middleware doesn't waste time running on static assets or Next.js internals
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};