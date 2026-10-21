import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  searchMedicineMaster,
  CENTRAL_MEDICINE_MASTER,
} from "./medicineMaster.js";

describe("Backend Centralized Medicine Master", () => {
  test("contains catalog of medicines", () => {
    assert.ok(CENTRAL_MEDICINE_MASTER.length >= 30);
  });

  test("search 'Met' finds Metformin", () => {
    const res = searchMedicineMaster("Met");
    assert.ok(res.length > 0);
    assert.ok(res.some((m) => m.name.toLowerCase().includes("metformin")));
  });

  test("search 'Dolo' finds Paracetamol 650mg", () => {
    const res = searchMedicineMaster("Dolo");
    assert.ok(res.length > 0);
    assert.ok(res.some((m) => m.name.includes("Dolo")));
  });
});

