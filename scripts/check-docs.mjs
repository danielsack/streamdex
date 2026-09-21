import { readFileSync, existsSync, statSync } from "node:fs";
import { resolve, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const files = JSON.parse(readFileSync(resolve(root, "release-files.json"), "utf8")).files;
const failures = [];
let checked = 0;
for (const file of files.filter((file) => /\.(md|html)$/.test(file))) {
  const content = readFileSync(resolve(root, file), "utf8");
  const links = [
    ...content.matchAll(/!?\[[^\]]*\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g),
    ...content.matchAll(/(?:href|src|srcset)="([^"]+)"/g),
  ];
  for (const [, raw] of links) {
    if (/^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i.test(raw)) continue;
    const path = decodeURIComponent(raw.split(/[?#]/)[0]);
    let target = resolve(root, dirname(file), path);
    if (existsSync(target) && statSync(target).isDirectory()) target = resolve(target, "index.html");
    checked++;
    if (!target.startsWith(root + sep) || !existsSync(target) || !statSync(target).isFile())
      failures.push(`${file}: missing or unsafe local link ${raw}`);
  }
}
if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else console.log(`Checked ${checked} local documentation and asset links.`);
