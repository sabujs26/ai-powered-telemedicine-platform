import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { collectSpecialties } from "../prisma/seed-specializations.js";

const map = JSON.parse(readFileSync(new URL("../../ai-service/data/disease_map.json", import.meta.url), "utf8"));

test("seed collects each specialty once, including the default, from the shared map", () => {
  const names = collectSpecialties(map);
  assert.equal(new Set(names).size, names.length);
  assert.ok(names.includes(map.default_specialty));
  for (const entry of Object.values(map.labels)) assert.ok(names.includes(entry.specialty));
  assert.equal(names.length, 10);
});
