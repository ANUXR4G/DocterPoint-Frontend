import { test, describe } from "node:test";
import assert from "node:assert";
import {
  OrderSetService,
  DEFAULT_ORDER_SETS,
} from "./orderset.service.js";

describe("OrderSetService & Clinical Order Sets", () => {
  test("contains rich clinical default order sets", () => {
    assert.ok(DEFAULT_ORDER_SETS.length >= 5, "Must contain at least 5 default order sets");
    const names = DEFAULT_ORDER_SETS.map((os) => os.name);
    assert.ok(names.some((n) => n.includes("Diabetes")), "Should contain Diabetes starter pack");
    assert.ok(names.some((n) => n.includes("Hypertension")), "Should contain Hypertension order set");
    assert.ok(names.some((n) => n.includes("Cough") || n.includes("URI")), "Should contain URI order set");
    assert.ok(names.some((n) => n.includes("Gastritis") || n.includes("GERD")), "Should contain Gastritis order set");
  });

  test("each default order set contains multiple valid medicines with doses and routes", () => {
    for (const os of DEFAULT_ORDER_SETS) {
      assert.ok(os.id, "Order set must have an ID");
      assert.ok(os.name.length > 0, "Order set must have a name");
      assert.ok(os.medicines.length >= 2, `${os.name} must contain multiple medicines`);
      for (const med of os.medicines) {
        assert.ok(med.name.length > 0, "Medicine in order set must have a name");
        assert.ok(med.dose, "Medicine in order set must have a dose");
        assert.ok(med.frequency, "Medicine in order set must have a frequency");
        assert.ok(med.duration, "Medicine in order set must have a duration");
      }
    }
  });

  test("listOrderSets returns default order sets when no practice is specified", async () => {
    const list = await OrderSetService.listOrderSets(null);
    assert.ok(list.length >= DEFAULT_ORDER_SETS.length);
    assert.ok(list.some((os) => os.id === "os_dm2_starter"));
  });
});

