import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  MedicineService,
  getDefaultMedicineRecords,
  ROUTES_LIST,
  DOSAGE_FORMS_LIST,
} from "./medicine.service.js";

describe("MedicineService and Master Catalog", () => {
  test("routes and dosage forms lists are defined", () => {
    assert.ok(ROUTES_LIST.includes("Oral"));
    assert.ok(ROUTES_LIST.includes("Topical"));
    assert.ok(DOSAGE_FORMS_LIST.includes("Tablet"));
    assert.ok(DOSAGE_FORMS_LIST.includes("Capsule"));
    assert.ok(DOSAGE_FORMS_LIST.includes("Syrup"));
  });

  test("default medicine records contains 7 required fields", () => {
    const list = getDefaultMedicineRecords();
    assert.ok(list.length >= 20);

    const first = list[0];
    assert.ok(first.medicineCode);
    assert.ok(first.countryCode !== undefined);
    assert.ok(first.brandName);
    assert.ok(first.strength !== undefined);
    assert.ok(first.route);
    assert.ok(first.dosageForm);
    assert.ok(first.genericName);
    assert.ok(typeof first.favourite === "boolean");
  });

  test("listMedicines filters by query across Code, Brand, Generic, and Govt Code", async () => {
    // Search by code
    const byCode = await MedicineService.listMedicines({ q: "MED-MET-500" });
    assert.ok(byCode.length > 0);
    assert.ok(byCode.some((m) => m.medicineCode === "MED-MET-500"));

    // Search by brand
    const byBrand = await MedicineService.listMedicines({ q: "Dolo" });
    assert.ok(byBrand.length > 0);
    assert.ok(byBrand.some((m) => m.brandName.includes("Dolo")));

    // Search by generic
    const byGeneric = await MedicineService.listMedicines({ q: "Acetaminophen" });
    assert.ok(byGeneric.length > 0);
    assert.ok(byGeneric.some((m) => m.genericName.includes("Acetaminophen")));

    // Search by govt code
    const byGovt = await MedicineService.listMedicines({ q: "IN-DCGI-88210" });
    assert.ok(byGovt.length > 0);
    assert.ok(byGovt.some((m) => m.countryCode === "IN-DCGI-88210"));
  });

  test("listMedicines filters favouriteOnly", async () => {
    const favs = await MedicineService.listMedicines({ favouriteOnly: true });
    assert.ok(favs.length > 0);
    for (const m of favs) {
      assert.equal(m.favourite, true);
    }
  });
});

