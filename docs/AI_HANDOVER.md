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
3. `MEDIA`: Digital files and URLs. The `kind` column MUST BE `NULL`. Render UI based on `properties.mimeType`.

*Anti-Pattern:* Never use strings like `PHYSICAL_OBJECT` or `IMAGE` in the `kind` column.

## 3. The Graph Physics (Edge Matrices)

Edges strictly govern relationships.

* **`CARRIES` (Structural):** * `[PHYSICAL | MEDIA] -> CARRIES -> [IDENTITY]` (Bridges an artifact to its conceptual meaning).
  * `[MEDIA] -> CARRIES -> [PHYSICAL]` (A digital file carries the representation of a specific physical item).

* **`CONTAINS` (Aggregation):** * `[PHYSICAL] -> CONTAINS -> [PHYSICAL]`
  * `[IDENTITY] -> CONTAINS -> [ANY]`

* **Semantics (User Defined):** * **Legal:** `IDENTITY <-> IDENTITY`, `IDENTITY <-> PHYSICAL`, `IDENTITY <-> MEDIA`, `PHYSICAL <-> MEDIA`.
  * **Forbidden:** `PHYSICAL <-> PHYSICAL` and `MEDIA <-> MEDIA` (Do not link peers of the same tangible/digital layer via semantics; use `CONTAINS` or link them conceptually instead to prevent graph hairballs).

*Note:* `LINEAGE` (`DERIVED_FROM`) and `REFERENCES` are DEPRECATED. Do not use them.

## 4. The Universal Builder Pattern

Do not create bespoke modals for creating edges. ALL edge creation must flow through `<UniversalBuilder />` in `src/components/UniversalBuilder.tsx`.
It accepts a strict `config` object:

```typescript
interface BuilderConfig {
  mode: 'STRUCTURAL' | 'CONTAINMENT' | 'SEMANTIC';
  direction: 'FORWARD' | 'REVERSE';
  allowedGateways: ('IDENTITY' | 'PHYSICAL' | 'FILE' | 'URL')[]; // The 4 Creation Doors
  // ... ui props
}
```

* **Soft Dedupe:** If a user types a name matching an existing `IDENTITY` or `PHYSICAL` node, the Builder intercepts and asks them to verify.
* **Hard Dedupe:** Media files are hashed locally (SHA-256) before upload. If the hash matches an existing `MEDIA` node, the system *forces* a link to the existing node.

## 5. Event Sourcing & Safety

Every destructive update to a node (`updateNodeProperties`, `updateNodeLabel`) must call `captureNodeSnapshot(nodeId)` FIRST. This inserts the previous state into `node_history`, allowing users to rewind time. Never execute an `UPDATE` on `nodes` without capturing the snapshot.