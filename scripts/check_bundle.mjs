// Fails if the built client bundle holds anything that must stay on the
// server: keys, score data, vectors or a word list. Run after `npm run build`.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = ".next/static";
const BANNED = ["SUPABASE_SECRET_KEY", "sorted_scores", "top_answers", "score_guess", "in_pool"];
const MAX_BYTES = 1_000_000;
const PATTERNS = {
  "a secret key": /sb_secret_[A-Za-z0-9_-]{8,}|"role":"service_role"/,
  "a word list": /(?:[a-z]{3,15}[\s,"'|]{1,3}){400}/,
  "a vector or score array": /(?:-?\d\.\d{3,}[,\s]){200}/,
  "a large base64 blob": /[A-Za-z0-9+/=]{20000}/,
};

function* files(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* files(path);
    else yield path;
  }
}

const problems = [];
let count = 0;
for (const path of files(ROOT)) {
  if (!/\.(js|css|json|html|txt)$/.test(path)) continue;
  count++;
  const text = readFileSync(path, "utf8");
  if (text.length > MAX_BYTES) problems.push(`${path}: ${text.length} bytes`);
  for (const word of BANNED) if (text.includes(word)) problems.push(`${path}: contains "${word}"`);
  for (const [what, re] of Object.entries(PATTERNS)) if (re.test(text)) problems.push(`${path}: looks like ${what}`);
}

if (!count) {
  console.error(`No files in ${ROOT}; run npm run build first.`);
  process.exit(1);
}
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`Client bundle OK: ${count} files checked, no keys, scores, vectors or word lists.`);
