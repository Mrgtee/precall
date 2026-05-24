import test from "node:test";
import assert from "node:assert/strict";
import { isWorkerAdminAction } from "./admin-auth";

test("admin worker actions include sports trigger", () => {
  assert.equal(isWorkerAdminAction("sports"), true);
  assert.equal(isWorkerAdminAction("admin-add"), false);
});
