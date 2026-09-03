#!/usr/bin/env node
/**
 * v1 compatibility shim for the CommonJS build.
 *
 * v1 exported the function itself (`module.exports = isSpam`). Bundlers emit
 * named exports plus `exports.default`, so this appends a footer AFTER the
 * generated export assignments that makes `require("spamnull")` callable again
 * while keeping every named export attached.
 */
import { appendFile, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const cjsPath = resolve(dirname(fileURLToPath(import.meta.url)), "..", "dist", "index.cjs");

const marker = "/* spamnull:cjs-interop */";
const current = await readFile(cjsPath, "utf8");
if (current.includes(marker)) process.exit(0);

await appendFile(
  cjsPath,
  `\n${marker}\n` +
    `const __spamnull = module.exports.default;\n` +
    `if (typeof __spamnull === "function") {\n` +
    `  Object.assign(__spamnull, module.exports);\n` +
    `  __spamnull.default = __spamnull;\n` +
    `  module.exports = __spamnull;\n` +
    `}\n`,
);

console.log("cjs interop footer applied");
