import type { Metadata } from "next";
import Sidebar from "@/components/Sidebar";
import "./globals.css";
// ADD getAllKinds to your import!
import { getRecentNodes, getAllKinds } from "@/app/actions";

export const metadata: Metadata = {
  title: "yathā",
  description: "Truth over convenience",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Fetch the nodes from the database directly in the server layout!
  const rawNodes = await getRecentNodes();

  const nodes = rawNodes.map(node => ({
    ...node,
    layer: node.layer as "IDENTITY" | "INSTANCE"
  }));

  // Fetch the active dictionary kinds for the sidebar's Track 1 Creation Dropdown
  const allKinds = await getAllKinds();
  const activeKinds = allKinds.filter(k => k.isActive);

  return (
    <html lang="en">
      <body className="antialiased bg-gray-50 text-gray-900 font-sans flex h-screen overflow-hidden">
        {/* Pass the fetched nodes AND kinds down to the client-side Sidebar */}
        <Sidebar initialNodes={nodes} activeKinds={activeKinds} />
        
        {/* The Main Panel (page.tsx) fills the remaining space */}
        <main className="flex-1 overflow-y-auto relative">
          {children}
        </main>
      </body>
    </html>
  );
}