import test from "node:test";
import assert from "node:assert/strict";
import { bpsToPercent, outcomeForAction, recommendationLabel, selectedProbabilityForAction, statusLabel } from "./format";

test("BUY_NO displays selected NO probability, not canonical YES probability", () => {
  assert.equal(outcomeForAction("BUY_NO", ["Yes", "No"]), "NO");
  assert.equal(selectedProbabilityForAction("BUY_NO", 4500), 5500);
  assert.equal(bpsToPercent(selectedProbabilityForAction("BUY_NO", 4500)), "55.0%");
});

test("weak buy signals are labeled watchlist", () => {
  assert.equal(recommendationLabel("BUY_YES", ["Yes", "No"], 370, 10), "Watchlist: YES");
  assert.equal(recommendationLabel("BUY_NO", ["Yes", "No"], 6000, 200), "Buy NO");
});

test("status labels are honest for lifecycle and legacy calls", () => {
  assert.equal(statusLabel("published", false), "Live");
  assert.equal(statusLabel("expired", false), "Awaiting resolution");
  assert.equal(statusLabel("published", true), "Legacy");
});
