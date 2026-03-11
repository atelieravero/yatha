import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

// This file contains NO database imports! 
// It is 100% "Edge Runtime" safe so the Next.js Middleware can read it without crashing.
export const authConfig = {
  providers: [Google],
} satisfies NextAuthConfig;