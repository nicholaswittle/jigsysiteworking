import { cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const output = resolve(root, "public");
const files = [
  "index.html",
  "order-demo.html",
  "staff-demo.html",
  "demo.css",
  "demo-data.js",
  "api-client.js",
  "order-demo.js",
  "staff-demo.js",
  "sw.js",
  "staff.webmanifest",
];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

for (const file of files) {
  await cp(resolve(root, file), resolve(output, file));
}

await cp(resolve(root, "images"), resolve(output, "images"), {
  recursive: true,
});
