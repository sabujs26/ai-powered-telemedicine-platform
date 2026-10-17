import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { evaluateRedFlags, URGENT_SINGLE, URGENT_COMBOS } from "../src/lib/redFlags.js";

const vocabulary = JSON.parse(
  readFileSync(new URL("../../ai-service/tests/data/symptoms_list.upstream.json", import.meta.url), "utf8")
);

test("every red-flag key exists in the model's real vocabulary", () => {
  const keys = [...Object.keys(URGENT_SINGLE), ...URGENT_COMBOS.flatMap((c) => c.all)];
  for (const k of keys) assert.ok(vocabulary.includes(k), `red-flag key not in vocabulary: ${k}`);
});

for (const key of Object.keys(URGENT_SINGLE)) {
  test(`'${key}' alone is urgent`, () => {
    const r = evaluateRedFlags(["itching", key, "cough"]);
    assert.equal(r.urgent, true);
    assert.equal(r.reasons.length, 1);
    assert.match(r.guidance, /999/);
  });
}

test("fever + stiff neck together are urgent, either alone are not", () => {
  assert.equal(evaluateRedFlags(["high_fever", "stiff_neck"]).urgent, true);
  assert.equal(evaluateRedFlags(["high_fever"]).urgent, false);
  assert.equal(evaluateRedFlags(["stiff_neck"]).urgent, false);
});

test("benign selection is not urgent but still carries general guidance", () => {
  const r = evaluateRedFlags(["itching", "skin_rash", "cough"]);
  assert.equal(r.urgent, false);
  assert.deepEqual(r.reasons, []);
  assert.match(r.guidance, /cannot rule out an emergency/);
});

test("ignores unknown / malformed input safely", () => {
  assert.equal(evaluateRedFlags(undefined).urgent, false);
  assert.equal(evaluateRedFlags([5, null, {}, "nonsense"]).urgent, false);
  assert.equal(evaluateRedFlags(["chest_pain", 5]).urgent, true);
});
