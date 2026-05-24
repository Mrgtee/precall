import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const SPORTS_PRODUCT_FILES = [
  "apps/web/app/sports/page.tsx",
  "apps/web/app/page.tsx",
  "apps/web/components/admin-console.tsx",
  "apps/worker/src/run-cycle.ts",
];

test("sports product copy and worker output avoid legacy filtered terminology", () => {
  for (const file of SPORTS_PRODUCT_FILES) {
    const text = readFileSync(file, "utf8");
    const banned = new RegExp([["watch", "list"].join(""), ["watch", "listed"].join(""), ["not", "an", "official", "pick"].join(" ")].join("|"), "i");
    assert.doesNotMatch(text, banned, file);
  }
});
