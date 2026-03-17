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
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `
          try {
            if (localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
              document.documentElement.classList.add('dark')
            } else {
              document.documentElement.classList.remove('dark')
            }
          } catch (_) {}
        `}} />
      </head>
      <body className="antialiased bg-gray-50 dark:bg-zinc-950 text-gray-900 dark:text-zinc-100 font-sans flex h-screen overflow-hidden transition-colors duration-300">
        {/* Conditionally render the Sidebar ONLY if the user is authenticated */}
        {session && (
          <Sidebar 
            initialNodes={nodes} 
            activeKinds={activeKinds} 
            user={session.user} 
            licenseeName={process.env.LICENSEE_NAME}
          />
        )}
        
        {/* The Main Panel fills the remaining space. Added pt-14 for mobile header clearance! */}
        <main className="flex-1 overflow-y-auto relative pt-14 md:pt-0 bg-gray-50 dark:bg-zinc-950 transition-colors duration-300">
          {children}
        </main>
      </body>
    </html>
  );
}