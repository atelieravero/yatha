import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { desc } from "drizzle-orm";
import AdminClient from "@/components/AdminClient";

// Force dynamic rendering so the roster is always fresh
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AdminPage() {
  const session = await auth();
  
  // Strict Auth Guard: Bounce anyone who isn't a SUPERUSER back to the main workspace
  if ((session?.user as any)?.role !== 'SUPERUSER') {
    redirect('/');
  }

  // Fetch the entire user roster
  const allUsers = await db.select().from(users).orderBy(desc(users.createdAt));

  return (
    <div className="max-w-5xl mx-auto p-8 md:p-12 pb-32">
      <div className="mb-8 border-b border-gray-200 pb-6">
        <a href="/" className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline mb-4 inline-block transition-colors">
          ← Back to Workspace
        </a>
        <h1 className="text-3xl md:text-4xl font-serif font-medium text-gray-900 mb-2 flex items-center gap-3">
          <span>👥</span> User Management
        </h1>
        <p className="text-gray-500 text-sm">
          Invite collaborators, manage roles, and instantly revoke access.
        </p>
      </div>

      {/* Pass the data to our interactive client component */}
      <AdminClient initialUsers={allUsers} currentUserEmail={session?.user?.email || ""} />
    </div>
  );
}