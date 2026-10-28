// Builds the main process (ESM) and the sandboxed preload (CommonJS, as sandboxing requires).
import { build } from "vite";
import { copyFileSync, existsSync, readFileSync } from "node:fs";
import { builtinModules } from "node:module";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const external = ["electron", ...builtinModules, ...builtinModules.map((m) => `node:${m}`)];
const one = (entry, format, file, empty) =>
  build({
    root,
    configFile: false,
    logLevel: "warn",
    define: { __PDOC_VERSION__: JSON.stringify(version) },
    // The package carries no node_modules: everything the main process needs is bundled.
    ssr: { noExternal: true },
    resolve: { conditions: ["node", "import", "default"] },
    build: {
      outDir: "out/main",
      emptyOutDir: empty,
      target: "node22",
      minify: false,
      sourcemap: true,
      ssr: true,
      rollupOptions: { external, input: join(root, entry), output: { format, entryFileNames: file, inlineDynamicImports: true } },
    },
  });
await one("src/main/main.ts", "es", "main.mjs", true);
await one("src/main/preload.ts", "cjs", "preload.cjs", false);
if (existsSync(join(root, "src", "cli", "main.ts"))) await one("src/cli/main.ts", "es", "cli.mjs", false);
if (existsSync(join(root, "build", "icon.png"))) copyFileSync(join(root, "build", "icon.png"), join(root, "out", "main", "icon.png"));
console.log("Main and preload built.");
