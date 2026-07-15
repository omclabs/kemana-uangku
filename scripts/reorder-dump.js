// Reorders CREATE TABLE statements in a wrangler `d1 export` dump so tables
// referenced by a FOREIGN KEY always appear before the table that references
// them. D1 requires the referenced table to already exist at CREATE TABLE
// time, but `sqlite_master` (and therefore the exported dump) orders tables
// by internal creation history, not by dependency -- a later migration that
// recreates a table to add a REFERENCES column can leave it positioned
// before the table it now points to. Usage: node reorder-dump.js <input.sql> <output.sql>

const fs = require("fs");

const [, , inputPath, outputPath] = process.argv;
if (!inputPath || !outputPath) {
  console.error("Usage: node reorder-dump.js <input.sql> <output.sql>");
  process.exit(1);
}

const sql = fs.readFileSync(inputPath, "utf8");

// Split into top-level statements, respecting single-quoted string literals
// (with '' as the escaped-quote form) and parenthesis depth, so semicolons
// inside string values or CREATE TABLE bodies do not split the statement.
function splitStatements(text) {
  const statements = [];
  let current = "";
  let depth = 0;
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    current += ch;
    if (inString) {
      if (ch === "'") {
        if (text[i + 1] === "'") {
          current += text[++i];
        } else {
          inString = false;
        }
      }
      continue;
    }
    if (ch === "'") {
      inString = true;
    } else if (ch === "(") {
      depth++;
    } else if (ch === ")") {
      depth--;
    } else if (ch === ";" && depth === 0) {
      statements.push(current.trim());
      current = "";
    }
  }
  if (current.trim()) statements.push(current.trim());
  return statements;
}

const statements = splitStatements(sql);

const createTableRe = /^CREATE TABLE\s+(?:IF NOT EXISTS\s+)?"?(\w+)"?/i;
const referencesRe = /REFERENCES\s+"?(\w+)"?/gi;

const creates = new Map(); // table name -> { sql, refs: Set }
const others = [];

for (const stmt of statements) {
  const match = stmt.match(createTableRe);
  if (match) {
    const table = match[1];
    const refs = new Set();
    let refMatch;
    while ((refMatch = referencesRe.exec(stmt))) {
      if (refMatch[1] !== table) refs.add(refMatch[1]);
    }
    creates.set(table, { sql: stmt, refs });
  } else {
    others.push(stmt);
  }
}

// Topological sort: a table is safe to emit once every table it references
// (that we're also creating) has already been emitted.
const remaining = new Set(creates.keys());
const orderedCreates = [];
while (remaining.size > 0) {
  const ready = [...remaining].filter((t) => {
    const { refs } = creates.get(t);
    return [...refs].every((r) => !remaining.has(r));
  });
  const batch = ready.length > 0 ? ready : [...remaining]; // cycle fallback
  for (const t of batch) {
    orderedCreates.push(creates.get(t).sql);
    remaining.delete(t);
  }
}

const output = [...orderedCreates, ...others].map((s) => s + ";\n").join("");
fs.writeFileSync(outputPath, output);
