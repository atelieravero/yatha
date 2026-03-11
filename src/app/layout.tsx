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

  // 2. Fetch the nodes from the database directly in the server layout
  const rawNodes = await getRecentNodes();

  // Safely cast the raw nodes into the strict type expected by the Sidebar
  const nodes = rawNodes.map(node => ({
    id: node.id,
    label: node.label,
    layer: node.layer as "IDENTITY" | "PHYSICAL" | "MEDIA",
    kind: node.kind,
    aliases: node.aliases || [],
    properties: (node.properties as Record<string, any>) || {}
  }));

  // Fetch the active dictionary kinds for the sidebar's Track 1 Creation Dropdown
  const allKinds = await getAllKinds();
  const activeKinds = allKinds.filter(k => k.isActive);

  return (
    <html lang="en">
      <body className="antialiased bg-gray-50 text-gray-900 font-sans flex h-screen overflow-hidden">
        {/* Pass the fetched nodes, kinds, and user context down to the client-side Sidebar */}
        <Sidebar 
          initialNodes={nodes} 
          activeKinds={activeKinds} 
          user={session?.user} 
          licenseeName={process.env.LICENSEE_NAME}
        />
        
        {/* The Main Panel (page.tsx) fills the remaining space */}
        <main className="flex-1 overflow-y-auto relative">
          {children}
        </main>
      </body>
    </html>
  );
}