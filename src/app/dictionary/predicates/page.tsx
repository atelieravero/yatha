import { db } from "@/db";
import { edges, predicates } from "@/db/schema";
import PredicateDictionaryClient from "@/components/PredicateDictionaryClient";

// Force fresh data on every load
export const dynamic = 'force-dynamic';

export default async function PredicatesDictionaryPage() {
  // 1. Fetch the entire semantic dictionary
  const allPredicates = await db.select().from(predicates).orderBy(predicates.forwardLabel);
  
  // 2. Fetch all edges to calculate structural impact/usage
  const allEdges = await db.select({ predicateId: edges.predicateId }).from(edges);

  // Aggregate edge counts per predicate
  const edgeCounts = allEdges.reduce((acc, edge) => {
    acc[edge.predicateId] = (acc[edge.predicateId] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="max-w-4xl mx-auto p-8 md:p-12 pb-32">
      <div className="mb-8 border-b border-gray-200 pb-6">
        <a href="/" className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline mb-4 inline-block transition-colors">
          ← Back to Workspace
        </a>
        <h1 className="text-3xl md:text-4xl font-serif font-medium text-gray-900 mb-6">
          Taxonomy Dictionary
        </h1>
        
        <div className="flex gap-6 border-b border-gray-200">
          <a href="/dictionary" className="pb-2 border-b-2 border-transparent font-medium text-gray-500 hover:text-gray-800 transition-colors">
            Classifications (Kinds)
          </a>
          <a href="/dictionary/predicates" className="pb-2 border-b-2 border-blue-600 font-bold text-blue-600">
            Connections (Predicates)
          </a>
        </div>
      </div>

      <div className="mt-6">
        <p className="text-gray-500 text-sm max-w-2xl mb-6">
          Manage the semantic ontology (Edges). System core predicates control the physics of the graph and cannot be edited. Deactivating a semantic pair requires migrating existing connections to an active alternative.
        </p>

        <PredicateDictionaryClient initialPredicates={allPredicates} edgeCounts={edgeCounts} />
      </div>
    </div>
  );
}