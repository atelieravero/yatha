# YATHĀ - AI CONTEXT & HANDOVER DOCUMENT

> **SYSTEM INSTRUCTION FOR AI:** If you are reading this document, you are taking over development of the "Yathā" codebase. Read this architecture specification carefully. You must strictly adhere to the 3-Layer Ontology, the Edge Matrix, and the specified Tech Stack. Do not suggest reverting to a 2-layer model. Do not introduce Redux, standard REST APIs, or local `useState` for global data.

## 1. Tech Stack & Environment

* Next.js App Router (`force-dynamic` extensively used).

* PostgreSQL + Drizzle ORM.

* Tailwind CSS.

* **Server Actions ONLY:** All database mutations happen via `actions.ts`. No API routes (`/api/...`).

* **Direct-to-S3 Uploads:** Files are NEVER uploaded to the Next.js server. The server issues presigned Cloudflare R2 URLs, and the client browser `PUT`s the file directly to storage.

## 2. The 3-Layer Ontology (CRITICAL)

The database `nodes` table has a strict `layer` column:

1. `IDENTITY`: Abstract concepts (People, Artworks, Ideas). Uses the `kind` column to map to a user-defined dictionary taxonomy.

2. `PHYSICAL`: Tangible custody tokens (Boxes, Books). The `kind` column MUST BE `NULL`.

3. `MEDIA`: Digital files and URLs. The `kind` column MUST BE `NULL`. Render UI based on `properties.mimeType` and `properties.hash`.

*Anti-Pattern:* Never use strings like `PHYSICAL_OBJECT` or `IMAGE` in the `kind` column.

## 3. The Graph Physics & Predicate Constraints

Edges strictly govern relationships.

* **`CARRIES` (Structural):** `[PHYSICAL | MEDIA] -> CARRIES -> [IDENTITY]` or `[MEDIA] -> CARRIES -> [PHYSICAL]`.

* **`CONTAINS` (Aggregation):** `[PHYSICAL] -> CONTAINS -> [PHYSICAL]` or `[IDENTITY] -> CONTAINS -> [ANY]`.

* **Semantics (User Defined):** Governed by the `predicates` table.

  * **Core Rule:** `PHYSICAL <-> PHYSICAL` and `MEDIA <-> MEDIA` are globally forbidden for semantic links to prevent graph hairballs.

  * **Dynamic Constraints:** The `predicates` table includes `sourceLayers`, `targetLayers`, `sourceDefaultKind`, and `targetDefaultKind` arrays. The UI strictly reads these to filter search results and pre-select dropdowns.

## 4. The 4-Gateway Creation Model

We have completely unified global minting (Sidebar) and contextual linking (`UniversalBuilder`). Both use the exact same **4-Gateway System**:

1. **Concept (IDENTITY):** Opens a text form + Kind dropdown.

2. **Physical (PHYSICAL):** Opens a text form.

3. **Upload (FILE):** Opens a drag-and-drop zone. Hashes locally. Hard dedupe logic.

4. **URL (MEDIA):** Opens a URL input. Hard dedupe logic. Converts YouTube URLs to standard hashes automatically.

### The Universal Builder (`src/components/UniversalBuilder.tsx`)

It accepts a strict `config` object.

* **Predicate-First Semantic Mode:** For `mode: 'SEMANTIC'`, the builder opens to Step 0 (Verb Selection). It dynamically filters the allowed targets and allowed gateways based strictly on the selected Predicate's database constraints.

* **Auto-Select Prefill:** The builder initializes with the Active Node's name and utilizes `onFocus={e => e.target.select()}` to provide a frictionless bridging experience (allowing instant typing to overwrite, or arrow keys to append).

## 5. Event Sourcing & Safety

Every destructive update to a node (`updateNodeProperties`, `updateNodeLabel`) must call `captureNodeSnapshot(nodeId)` FIRST. This inserts the previous state into `node_history`, allowing users to rewind time. Never execute an `UPDATE` on `nodes` without capturing the snapshot.