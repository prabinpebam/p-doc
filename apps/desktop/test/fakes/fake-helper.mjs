#!/usr/bin/env node
// A Git credential helper for tests: `!node fake-helper.mjs <store.json>`, then Git adds get/store/erase.
// It stands in for the operating system's vault (Git Credential Manager), so tests never touch the real one.
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const [store, op] = process.argv.slice(2);
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (d) => (input += d));
process.stdin.on("end", () => {
  const q = Object.fromEntries(
    input
      .split(/\r?\n/)
      .filter((l) => l.includes("="))
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
  );
  const all = existsSync(store) ? JSON.parse(readFileSync(store, "utf8")) : {};
  const key = `${q.protocol}://${q.host}`;
  if (op === "get" && all[key]) process.stdout.write(`username=${all[key].username}\npassword=${all[key].password}\n`);
  else if (op === "store" && q.password) writeFileSync(store, JSON.stringify({ ...all, [key]: { username: q.username, password: q.password } }));
  else if (op === "erase") {
    delete all[key];
    writeFileSync(store, JSON.stringify(all));
  }
});
