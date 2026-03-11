import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [Google],
  callbacks: {
    // 1. The Sign-In Gatekeeper
    async signIn({ user }) {
      if (!user.email) return false;
      
      // Check if user exists in our database
      const [existingUser] = await db.select().from(users).where(eq(users.email, user.email));
      
      if (existingUser) {
        if (!existingUser.isActive) return false; // Reject deactivated users
        return true; 
      }

      // THE BOOTSTRAP: If they aren't in the DB, check if they are the designated Admin
      const adminEmail = process.env.ADMIN_EMAIL;
      if (adminEmail && user.email === adminEmail) {
        // Auto-create the Superuser account on their first login!
        await db.insert(users).values({
          email: user.email,
          name: user.name || "Admin",
          avatar: user.image,
          role: 'SUPERUSER',
          isActive: true,
        });
        return true;
      }

      // Reject everyone else
      return false;
    },
    
    // 2. The Session Decorator
    async session({ session }) {
      // Attach the database User ID and Role to the active session 
      // so our server actions can safely use them instead of "system_user"
      if (session.user?.email) {
         const [dbUser] = await db.select().from(users).where(eq(users.email, session.user.email));
         if (dbUser) {
            (session.user as any).id = dbUser.id;
            (session.user as any).role = dbUser.role;
         }
      }
      return session;
    }
  }
});