// One-off migration for the "cool retail" theme. Not part of the app.
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve("src");

const REPLACEMENTS = [
  ["text-ink/75", "text-ink"],
  ["text-ink/70", "text-muted"],
  ["text-ink/65", "text-muted"],
  ["text-ink/60", "text-muted"],
  ["text-ink/55", "text-muted"],
  ["text-ink/50", "text-muted"],
  ["text-ink/45", "text-muted"],
  ["text-ink/40", "text-muted"],
  ["border-ink/40", "border-muted"],
  ["bg-ink/[0.02]", "bg-surface"],
  ["accent-ink", "accent-accent"],
  ["text-accent/80", "text-sale"],
  ["text-accent", "text-sale"],
  ["border-accent", "border-sale"],
];

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (/\.(tsx?|css)$/.test(entry.name)) {
      yield full;
    }
  }
}

let changed = 0;
for await (const file of walk(ROOT)) {
  const source = await readFile(file, "utf8");
  let next = source;
  for (const [from, to] of REPLACEMENTS) {
    next = next.split(from).join(to);
  }
  if (next !== source) {
    await writeFile(file, next);
    changed += 1;
  }
}
console.log(`updated ${changed} files`);
