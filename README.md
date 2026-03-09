# yathā 📚

A strictly typed, event-sourced graph database built for cultural preservation and private archiving. Yathā enforces a rigid 3-Layer ontology (Identity, Physical, Media) to prevent the conflation of semantic concepts with physical/digital custody tokens.

## Tech Stack
* **Framework:** Next.js 15 (App Router, React Server Components)
* **Database:** PostgreSQL (via Docker)
* **ORM:** Drizzle ORM
* **Storage:** Cloudflare R2 (S3-compatible) for direct-from-browser uploads
* **Styling:** Tailwind CSS V4

## Core Architecture
Yathā abandons flat-table CRUD in favor of a directional graph. 
* `nodes`: Represents entities. Strictly constrained to `layer: 'IDENTITY' | 'PHYSICAL' | 'MEDIA'`.
* `edges`: Represents relationships. Driven by an extensible dictionary of Predicates.
* `node_history`: An append-only ledger. Destructive updates to `nodes` trigger an automatic snapshot insertion here, guaranteeing reversible decisions and data sovereignty.

## Local Development Setup

### 1. Prerequisites
* Docker & Docker Compose
* Node.js 20+

### 2. Environment Variables
Copy `.env.example` to `.env` and fill in your Cloudflare R2 credentials.
```bash
S3_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com
S3_ACCESS_KEY_ID=your_access_key
S3_SECRET_ACCESS_KEY=your_secret_key
S3_BUCKET_NAME=your_bucket
DATABASE_URL=postgresql://yatha_user:yatha_secret@localhost:5432/yatha_db
```

### 3. Start the Database
Spin up the local PostgreSQL container:
```bash
docker compose up -d
```

### 4. Push the Schema
Use Drizzle to push the schema to your fresh database:
```bash
npm install
npx drizzle-kit push
```

### 5. Run the Application
```bash
npm run dev
```
Visit `http://localhost:3000`.

## Project Structure
* `/src/db/schema.ts`: The absolute source of truth for the data model.
* `/src/app/actions.ts`: Centralized Server Actions. All graph mutations (minting, asserting, retracting) happen here.
* `/src/components/UniversalBuilder.tsx`: The primary UI engine. A highly parameterized React component that handles Search, Minting, Deduplication, and Edge Assertion dynamically based on graph physics.