# YATHĀ - AI CONTEXT & HANDOVER DOCUMENT

> **SYSTEM INSTRUCTION FOR AI:** If you are reading this document, you are taking over development of the "Yathā" codebase. Read this architecture specification carefully. You must strictly adhere to the 3-Layer Ontology, the Edge Matrix, and the specified Tech Stack. Do not suggest reverting to a 2-layer model. Do not introduce Redux, standard REST APIs, or local `useState` for global data.

## 1. Tech Stack & Environment

* Next.js App Router (`force-dynamic` extensively used).
* PostgreSQL + Drizzle ORM.
* Tailwind CSS.
* **Auth.js (NextAuth) v5:** Google SSO. Requires a strict split between `auth.config.ts` (Edge-safe for Next.js `middleware.ts`) and `auth.ts` (Node-safe with DB adapters).
* **Server Actions ONLY:** All database mutations happen via `actions.ts`. No API routes (`/api/...`) except for NextAuth.
* **Direct-to-S3 Uploads:** Files are NEVER uploaded to the Next.js server. The server issues presigned Cloudflare R2 URLs, and the client browser `PUT`s the file directly to storage.

## 2. The 3-Layer Ontology (CRITICAL)

The database `nodes` table has a strict `layer` column:

1. `IDENTITY`: Abstract concepts (People, Artworks, Ideas). Uses the `kind` column to map to a user-defined dictionary taxonomy.
2. `PHYSICAL`: Tangible custody tokens (Boxes, Books). The `kind` column MUST BE `NULL` or mapped to fixed Instance constants.
3. `MEDIA`: Digital files and URLs. The `kind` column MUST BE `NULL`. Render UI based on `properties.mimeType` and `properties.hash`.

*Anti-Pattern:* Never use strings like `PHYSICAL_OBJECT` or `IMAGE` in the `kind` column for Layer 1 Identities.

## 3. The Graph Physics & Predicate Constraints

Edges strictly govern relationships.
* **`CARRIES` (Structural):** `[PHYSICAL | MEDIA] -> CARRIES -> [IDENTITY]` or `[MEDIA] -> CARRIES -> [PHYSICAL]`.
* **`CONTAINS` (Aggregation):** `[PHYSICAL] -> CONTAINS -> [PHYSICAL]` or `[IDENTITY] -> CONTAINS -> [ANY]`.
* **Semantics (User Defined):** Governed by the `predicates` table.
  * **Core Rule:** `PHYSICAL <-> PHYSICAL` and `MEDIA <-> MEDIA` are globally forbidden for semantic links to prevent graph hairballs.
  * **Dynamic Constraints:** The UI strictly reads the `predicates` table (`sourceLayers`, `targetLayers`) to filter search results.

## 4. Authentication & User Context

* **Secure Actions:** All server actions that mutate the graph MUST call `await requireUserId()` to extract the UUID from the NextAuth session. *Never* use the legacy `"system_user"` fallback string.
* **Admin Bootstrap:** The system provisions the first Superuser via the `ADMIN_EMAIL` environment variable inside the Auth.js `signIn` callback.
* **License/Middleware:** `middleware.ts` forces authentication on all non-API routes and enforces environment-level license expiry dates.

## 5. Event Sourcing, Soft Deletes, & Safety

* **Snapshot Ledger:** Every destructive update (`updateNodeProperties`, `updateNodeLabel`, `deactivateNode`) must call `captureNodeSnapshot(nodeId, userId)` FIRST. This inserts the previous state into `node_history`, allowing users to rewind time. 
* **Soft Deletes (Tombstones):** Never execute a `DELETE` statement. Deleting a node simply toggles `isActive: false`. 
  * The main `page.tsx` intercepts this flag and renders a grayed-out "Tombstone" UI.
  * `searchGraphNodes` strictly hides `isActive: false`.
  * Global deduplication checkers MUST detect trash matches and offer a "Restore Record" prompt.
* **Zombie Links:** `EdgeRow` components evaluate if their connected target is dead (`isActive === false`) and render a strikethrough to maintain historical truth without breaking the UI.

## 6. UI/UX Navigation Conventions

* **Scroll Preservation:** Always use Next.js `<Link scroll={false} href="...">` for sidebar and edge navigation to prevent the main panel from losing its vertical scroll position.
* **Layout Physics (Peek Drawer):** Avoid complex React state for layout shifts. The main workspace dynamically resizes using a reactive Tailwind margin (`className={peekNode ? "xl:mr-[28rem]" : ""}`) to smoothly slide the central column out of the way when the Peek Drawer opens.