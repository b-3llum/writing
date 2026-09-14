/* build-feed.mjs — generate feed.xml (Atom) from the notes in posts/.
   No dependencies. Run after adding or editing a note:  node tools/build-feed.mjs
   Reads every top-level posts/*.md, sorts newest first by frontmatter `date`,
   and writes an Atom 1.0 feed whose entries link to the SPA hash URLs. */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SITE = "https://yap.bellums.org/writting/";
const TITLE = "writting";
const SUBTITLE = "Essays, experiments, and unfinished thoughts about the things I'm learning.";
const AUTHOR = "Moussa Toure";

function parseFrontmatter(source) {
  const match = source.match(/^---\s*([\s\S]*?)\s*---\s*([\s\S]*)$/);
  if (!match) return { attributes: {}, body: source };
  const attributes = {};
  for (const line of match[1].split("\n")) {
    const i = line.indexOf(":");
    if (i === -1) continue;
    attributes[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^['"]|['"]$/g, "");
  }
  return { attributes, body: match[2] };
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));

const notes = readdirSync("posts")
  .filter((name) => name.endsWith(".md"))
  .map((name) => {
    const slug = name.replace(/\.md$/, "");
    const { attributes } = parseFrontmatter(readFileSync(join("posts", name), "utf8"));
    const parsed = Date.parse(attributes.date || "");
    return {
      slug,
      title: attributes.title || slug,
      description: attributes.description || "",
      tags: (attributes.tags || "").split(",").map((t) => t.trim()).filter(Boolean),
      date: Number.isNaN(parsed) ? 0 : parsed,
    };
  })
  .sort((a, b) => b.date - a.date);

const iso = (ms) => new Date(ms || Date.now()).toISOString();
const updated = iso(notes.length ? notes[0].date : Date.now());

const entries = notes.map((note) => {
  const url = `${SITE}#${note.slug}`;
  const categories = note.tags.map((t) => `    <category term="${esc(t)}"/>`).join("\n");
  return `  <entry>
    <title>${esc(note.title)}</title>
    <link href="${esc(url)}"/>
    <id>${esc(url)}</id>
    <updated>${iso(note.date)}</updated>
${categories ? categories + "\n" : ""}    <summary>${esc(note.description)}</summary>
  </entry>`;
}).join("\n");

const feed = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${esc(TITLE)}</title>
  <subtitle>${esc(SUBTITLE)}</subtitle>
  <link href="${esc(SITE)}"/>
  <link rel="self" type="application/atom+xml" href="${esc(SITE)}feed.xml"/>
  <id>${esc(SITE)}</id>
  <updated>${updated}</updated>
  <author><name>${esc(AUTHOR)}</name></author>
${entries}
</feed>
`;

writeFileSync("feed.xml", feed);
console.log(`feed.xml written: ${notes.length} entries`);
