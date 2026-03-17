import { db } from "@/db";
import { nodes, kinds } from "@/db/schema";
import DictionaryClient from "@/components/DictionaryClient";

// Force fresh data on every load
export const dynamic = 'force-dynamic';

export default async function DictionaryPage() {
  const allKinds = await db.select().from(kinds).orderBy(kinds.label);
  const allNodes = await db.select({ kind: nodes.kind }).from(nodes);

  // Aggregate node counts per kind (ignoring nulls from physical/media items)
  const nodeCounts = allNodes.reduce((acc, node) => {
    if (node.kind) {
      acc[node.kind] = (acc[node.kind] || 0) + 1;
    }
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="max-w-4xl mx-auto p-8 md:p-12 pb-32">
      <div className="mb-8">
        <a href="/" className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:underline mb-4 inline-block transition-colors">
          ← Back to Workspace
        </a>
        <h1 className="text-3xl md:text-4xl font-serif font-medium text-gray-900 dark:text-zinc-100 mb-6 transition-colors">
          Taxonomy Dictionary
        </h1>
        
        <div className="flex gap-6 border-b border-gray-200 dark:border-zinc-800 transition-colors">
          <a href="/dictionary" className="pb-2 border-b-2 border-blue-600 dark:border-blue-500 font-bold text-blue-600 dark:text-blue-400 transition-colors">
            Classifications (Kinds)
          </a>
          <a href="/dictionary/predicates" className="pb-2 border-b-2 border-transparent font-medium text-gray-500 dark:text-zinc-400 hover:text-gray-800 dark:hover:text-zinc-200 transition-colors">
            Connections (Predicates)
          </a>
        </div>
      </div>

      <div className="mt-6">
        <p className="text-gray-500 dark:text-zinc-400 text-sm max-w-2xl mb-6 transition-colors">
          Manage the strict Layer 1 classifications (Identities). To preserve the integrity of the graph, deactivating a Kind requires migrating its existing nodes to an active alternative.
        </p>

        <DictionaryClient initialKinds={allKinds} nodeCounts={nodeCounts} />
      </div>
    </div>
  );
}