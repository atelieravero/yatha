# The Yathā Taxonomy Guide

**Principles for Curating Kinds and Predicates**

As the archivist of your Yathā database, your most important job is maintaining the "Dictionary"—the vocabulary your graph uses to describe reality.

Yathā uses a strict, flat ontology. This means there are no complex, deeply nested category trees (e.g., `Art > Visual > Painting > Oil`). Instead, we rely on broad classifications (Kinds) and expressive connections (Predicates).

Here are the guiding principles for curating a clean, powerful, and sustainable knowledge graph.

## 1. The Golden Rule: Occam's Razor

**Do not invent a new category or relationship unless you absolutely have to.** Every time you add a new `Kind` or `Predicate` to the dictionary, you increase the cognitive load required to enter new data. A graph with 10 Kinds and 15 Predicates is incredibly easy to query and navigate. A graph with 100 Kinds and 200 Predicates becomes an unmanageable hairball.

Keep your dictionaries small, broad, and strictly defined.

## 2. Curating "Kinds" (Identity Classifications)

A `Kind` is the highest-level bucket for an abstract Concept or Identity. (Remember: Physical Items and Digital Media do not use Kinds; they are categorized by their physical reality or file format).

### A. Finding the Right Level of Granularity

How specific should a `Kind` be? That depends entirely on the focus and richness of your archive.

A good rule of thumb is to ask: *Do I need to filter my entire database by this specific category, or is it just a detail about the item?*

* **For a general historical archive:** You probably only need a broad Kind like `Artwork`. Whether a piece is an oil painting or a charcoal sketch can just be logged as a "Medium" in the item's Properties field.

* **For an art historian:** If your entire collection consists of paintings, having a single `Artwork` Kind is useless. You *should* create specific Kinds like `Watercolor`, `Oil Painting`, and `Fresco` so you can instantly separate your primary areas of study.

*Guidance:* Start broad. You can always create a more specific Kind later and migrate your nodes into it if you find your collections getting too crowded.

### B. Roles are not Kinds

Do not confuse *what a thing is* with *what a thing does*.

* ❌ **Bad Kinds:** `Author`, `Photographer`, `Politician`.

* ✅ **Good Kind:** `Person`.

A human being is just a `Person`. They become an "Author" only when you connect them to a book using the `authored` predicate.

### C. Recommended Starting Kinds

For most cultural archives, you only need a handful of Kinds:

* `Person` (Individuals)

* `Organization` (Companies, bands, government bodies)

* `Artwork` (Paintings, sculptures)

* `Written Work` (Books, poems, essays)

* `Location` (Cities, buildings, historical sites)

* `Event` (Wars, exhibitions, concerts)

* `Concept` (Abstract ideas, movements like "Surrealism")

## 3. Curating "Predicates" (Semantic Connections)

Predicates are the verbs that connect your nodes together. They are the sentences of your graph.

### A. Use Verbs, Not Nouns

Edges should read naturally from left to right.

* ❌ **Bad:** `[Da Vinci] -> Author -> [Mona Lisa]`

* ✅ **Good:** `[Da Vinci] -> authored -> [Mona Lisa]`

### B. Think in Both Directions (Forward & Reverse)

Every relationship looks different depending on where you are standing. When you create a Predicate, you must define both sides so the UI makes sense no matter which node you are viewing.

* **Forward:** `influenced by`

* **Reverse:** `influence on`
  *(Example: `[Beatles] -> influenced by -> [Chuck Berry]` means that on Chuck Berry's page, you will correctly see `[Chuck Berry] -> influence on -> [Beatles]`)*.

### C. Utilize Symmetry

Some relationships are identical in both directions. Check the "Is Symmetric" box to save time and enforce logic.

* **Symmetric Examples:** `married to`, `sibling of`, `collaborated with`.

### D. Avoid Redundant Predicates

Before adding a new predicate, check if an existing one already covers the meaning.

* If you have `created`, do you really need `painted`, `sculpted`, and `wrote`?

* In a graph, the context often does the heavy lifting: `[Person] -> created -> [Book]` obviously implies writing. Keep your vocabulary lean.

## 4. System Core Rules (The Physics)

As a reminder, you do not need to create Predicates for structural realities. The system handles these automatically:

* **CARRIES:** Do not create a predicate called "is a digital copy of". Simply use the media uploader; the system automatically asserts that the file `CARRIES` the concept.

* **CONTAINS:** Do not create predicates like "inside of" or "stored in". Use the structural `CONTAINS` tools to place items inside physical boxes or conceptual collections.