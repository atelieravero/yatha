import type { Metadata } from "next";
import Sidebar from "@/components/Sidebar";
import "./globals.css";
import { getRecentNodes, getAllKinds } from "@/app/actions";
import { auth } from "@/auth";

export const metadata: Metadata = {
  title: "yathā",
  description: "Truth over convenience",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // 1. Fetch the active user session!
  const session = await auth();

  // 2. Conditionally fetch data ONLY if logged in to prevent unnecessary DB queries on the login page
  let nodes: any[] = [];
  let activeKinds: any[] = [];

  if (session) {
    const rawNodes = await getRecentNodes();
    nodes = rawNodes.map(node => ({
      id: node.id,
      label: node.label,
      layer: node.layer as "IDENTITY" | "PHYSICAL" | "MEDIA",
      kind: node.kind,
      aliases: node.aliases || [],
      properties: (node.properties as Record<string, any>) || {}
    }));

    const allKinds = await getAllKinds();
    activeKinds = allKinds.filter(k => k.isActive);
  }

  return (
    <html lang="en">
      <body className="antialiased bg-gray-50 text-gray-900 font-sans flex h-screen overflow-hidden">
        {/* Conditionally render the Sidebar ONLY if the user is authenticated */}
        {session && (
          <Sidebar 
            initialNodes={nodes} 
            activeKinds={activeKinds} 
            user={session.user} 
            licenseeName={process.env.LICENSEE_NAME}
          />
        )}
        
        {/* The Main Panel fills the remaining space */}
        <main className="flex-1 overflow-y-auto relative">
          {children}
        </main>
      </body>
    </html>
  );
}