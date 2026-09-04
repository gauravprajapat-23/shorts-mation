import { existsSync } from "node:fs";
import { resolve } from "node:path";

const required = [
  ["vite", "node_modules/vite/client.d.ts"],
  ["typescript", "node_modules/typescript/bin/tsc"],
  ["@types/react", "node_modules/@types/react/index.d.ts"],
];

const missing = required.filter(([, file]) => !existsSync(resolve(process.cwd(), file)));
if (missing.length) {
  console.error("Typecheck dependencies are not installed: " + missing.map(([name]) => name).join(", "));
  console.error("Run: npm ci");
  console.error("Do not use npm ci --omit=dev / npm install --production for a build or typecheck environment.");
  process.exit(1);
}
