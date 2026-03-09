# Welcome to yathā

**yathā** (Sanskrit: *as it is, truth, reality*) is not a spreadsheet. It is not a standard form-based database. It is a strict, graph-based archival tool designed for people who care about the absolute truth of their data.

If you are used to organizing data in Excel, Notion, or standard cataloging software, Yathā will feel different. This document explains *why* it is different, and how to think about your data before you begin.

## The Problem with Spreadsheets

In a standard database, if you have a digitized photograph of Abraham Lincoln, you might create a row and fill out columns like:

* **Title:** Abraham Lincoln

* **Date:** 1863

* **File:** lincoln.jpg

* **Location:** Server Rack B

**Spreadsheets lie to you.** That single row conflates three entirely different layers of reality into one mushy object:

1. *Abraham Lincoln* is a dead historical figure. He does not live on Server Rack B.

2. *The physical photograph* was taken in 1863. It might live in a museum.

3. *The JPG file* was created yesterday by a scanner, and *it* lives on Server Rack B.

When you collapse these truths into one row, your data rots. If you find a second, higher-resolution scan of the exact same photo, what do you do? Make a duplicate row? Which row is the "real" Lincoln?

## The Yathā Philosophy: The 3 Layers

Yathā forces you to separate the *Concept* from the *Custody token*. Everything in Yathā exists on one of three strict layers:

1. 🟣 **Identities (Concepts):** Abstract ideas, people, artworks, historical events, books, songs. (e.g., *The concept of Abraham Lincoln*).

2. 📦 **Physical Items:** Tangible things made of atoms. Books, boxes, vinyl records, framed paintings. (e.g., *A physical tintype photograph*).

3. 🖼️ **Digital Media:** Files made of bits. JPGs, PDFs, MP4s, Web URLs. (e.g., *A 4K scan of the tintype*).

### Weaving the Web

Instead of thinking about "data entry," try to approach Yathā like you are building a web of connections. When you bring something into the system, you don't need to describe everything about its meaning all at once. 

You simply place the entity on the board and draw lines to what it relates to. 

For example, you might mint an Identity for *Abraham Lincoln*. Later, when you upload a digital scan of a photograph, you just connect that image to Lincoln with a line that says `depicts`. If you eventually acquire a physical copy of that photo, you can map that too. The abstract concept of the person remains pristine and singular at the center of your graph, while your actual physical and digital artifacts naturally orbit around it.

### 🧭 Guiding Principles

As you start exploring your archive, keep these few mental shifts in mind:

1. **Let things be exactly what they are.** When you upload a digital scan of a book, it often helps to name the file for what it actually is (e.g., "Archive.org PDF Scan") rather than naming the file after the book's title. You can simply connect it to the abstract identity of the book later. This keeps your tangible custody artifacts distinct from the beautiful ideas they carry.

2. **Embrace the unknown.** It is completely okay to upload dozens of photos or documents and leave them floating without any connections. In an archive, an unidentified artifact is just an honest reflection of reality. You can safely map them into your web later when you discover their context.

3. **Experiment freely.** Archiving can sometimes feel permanent and daunting, but Yathā is built with an immutable Event Ledger. Every adjustment, edit, or retraction you make is safely saved as a historical snapshot. You are free to organically reshape your graph at any time—you can always rewind history if you change your mind.