# YATHĀ - AI CONTEXT & HANDOVER DOCUMENT

> **SYSTEM INSTRUCTION FOR AI:** If you are reading this document, you are taking over development of the "Yathā" codebase. Read this architecture specification carefully. You must strictly adhere to the 3-Layer Ontology, the Edge Matrix, and the specified Tech Stack. Do not suggest reverting to a 2-layer model. Do not introduce Redux, standard REST APIs, or local `useState` for global data.

## 1. Tech Stack & Environment

* Next.js App Router (`force-dynamic` extensively used).

* PostgreSQL + Drizzle ORM.

* Tailwind CSS v4.

* **Auth.js (NextAuth) v5:** Google SSO. Requires a strict split between `auth.config.ts` (Edge-safe for Next.js `middleware.ts`) and `auth.ts` (Node-safe with DB adapters).

* **Server Actions ONLY:** All database mutations happen via `actions.ts`. No API routes (`/api/...`) except for NextAuth.

* **Direct-to-S3 Uploads:** Files are NEVER uploaded to the Next.js server. The server issues presigned Cloudflare R2 URLs, and the client browser `PUT`s the file directly to storage.

## 2. The 3-Layer Ontology (CRITICAL)

The database `nodes` table has a strict `layer` column:

1. `IDENTITY`: Abstract concepts (People, Artworks, Ideas). Uses the `kind` column to map to a user-defined dictionary taxonomy.

2. `PHYSICAL`: Tangible custody tokens (Boxes, Books). The `kind` column MUST BE `NULL` or mapped to fixed Instance constants (like `PHYSICAL_OBJECT`).

3. `MEDIA`: Digital files and URLs. The `kind` column MUST BE `NULL`. Render UI based on `properties.mimeType` and `properties.hash`.

*Anti-Pattern:* Never use strings like `PHYSICAL_OBJECT` or `IMAGE` in the `kind` column for Layer 1 Identities.

## 3. The Graph Physics & Predicate Constraints

Edges strictly govern relationships.

* **`CARRIES` (Structural):** `[PHYSICAL | MEDIA] -> CARRIES -> [IDENTITY]` or `[MEDIA] -> CARRIES -> [PHYSICAL]`.

* **`CONTAINS` (Aggregation):** `[PHYSICAL] -> CONTAINS -> [PHYSICAL]` or `[IDENTITY] -> CONTAINS -> [ANY]`.

* **Semantics (User Defined):** Governed by the `predicates` table.

  * **Core Rule:** `PHYSICAL <-> PHYSICAL` and `MEDIA <-> MEDIA` are globally forbidden for semantic links to prevent graph hairballs.

  * **Dynamic Constraints:** The UI strictly reads the `predicates` table (`sourceLayers`, `targetLayers`) to filter search results.

  * **Universal Locators:** We do *not* use a `REFERENCES` system predicate. All spatial/positional data (e.g., "Top left corner") is stored in the `locator` JSONB property of *any* standard Semantic Edge.

## 4. The 4-Gateway Creation Model

We have completely unified global minting (Sidebar) and contextual linking (`UniversalBuilder`). Both use the exact same **4-Gateway System**:

1. **Concept (IDENTITY):** Opens a text form + Kind dropdown.

2. **Physical (PHYSICAL):** Opens a text form.

3. **Upload (FILE):** Opens a drag-and-drop zone. Hashes locally. Hard dedupe logic.

4. **URL (URL):** Opens a URL input. Hard dedupe logic. Converts YouTube URLs to standard hashes automatically.

## 5. UI Layout & Component State (Gotchas)

* **Peek Drawer Parity:** The `PeekDrawer.tsx` is not a dumping ground. It MUST strictly replicate the interleaved layout blocks of the main `page.tsx` (Properties, CollapsibleEdgeBlocks, Viewers) exactly as they appear in the primary view.

* **React State Leakage:** When building client components that render node data (like `PropertiesEditor`), you MUST include a `useEffect` hook that explicitly wipes the local form state when the `nodeId` prop changes. Otherwise, React will reuse the component instance and leak dirty form data into the new node's page.

* **Scroll Preservation:** Always use Next.js `<Link scroll={false} href="...">` for sidebar and edge navigation to prevent the main panel from losing its vertical scroll position.

## 6. Event Sourcing, Soft Deletes, & Safety

* **Snapshot Ledger:** Every destructive update (`updateNodeProperties`, `updateNodeLabel`, `deactivateNode`) must call `captureNodeSnapshot(nodeId, userId)` FIRST. This inserts the previous state into `node_history`.

* **Soft Deletes (Tombstones):** Never execute a `DELETE` statement. Deleting a node simply toggles `isActive: false`.

  * The main `page.tsx` intercepts this flag and renders a grayed-out "Tombstone" UI.

  * Global deduplication checkers MUST detect trash matches and offer a "Restore Record" prompt.