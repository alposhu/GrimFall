// Dev helper: list imported identifiers that are never referenced.
const fs = require('fs');
const path = require('path');

function walk(dir, out = []) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p, out);
    else if (f.endsWith('.js')) out.push(p);
  }
  return out;
}

let total = 0;
for (const file of walk('src')) {
  const src = fs.readFileSync(file, 'utf8');
  const names = [];
  for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from/g)) {
    for (let n of m[1].split(',')) {
      n = n.trim();
      if (!n) continue;
      const parts = n.split(/\s+as\s+/);
      names.push(parts[parts.length - 1].trim());
    }
  }
  const body = src.replace(/import[\s\S]*?from\s*'[^']*';/g, '');
  const unused = names.filter((n) => !new RegExp(String.raw`\b${n}\b`).test(body));
  if (unused.length) {
    total += unused.length;
    console.log(file.split(path.sep).join('/') + ': ' + unused.join(', '));
  }
}
console.log(total ? `\n${total} unused import(s)` : 'no unused imports');
