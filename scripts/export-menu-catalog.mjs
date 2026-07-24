import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import vm from "node:vm";

const root = resolve(import.meta.dirname, "..");
const source = await readFile(resolve(root, "demo-data.js"), "utf8");
const sandbox = {
  window: {},
  localStorage: {
    getItem() { return null; },
    setItem() {},
  },
  CustomEvent: class CustomEvent {},
};

vm.createContext(sandbox);
vm.runInContext(source, sandbox);

const demo = sandbox.window.JigsyDemo;
const output = {
  products: demo.products,
  toppings: demo.toppings,
  sauces: demo.sauces,
  dressings: demo.dressings,
};

await mkdir(resolve(root, "config"), { recursive: true });
await writeFile(
  resolve(root, "config/menu-catalog.json"),
  `${JSON.stringify(output, null, 2)}\n`,
  "utf8",
);
