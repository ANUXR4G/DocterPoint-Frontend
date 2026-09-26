/**
 * Heuristic ID field extraction from DigiLocker / selectable PDF text.
 */
import assert from "node:assert/strict";
import {
  heuristicAadhaarFromText,
  heuristicDobFromText,
  heuristicGenderFromText,
  heuristicNameFromText,
  heuristicPanFromText,
} from "./idScan.js";

const sample = `
Government of India
AADHAAR
Name: Roopa Satheesh
Date of Birth: 15/08/1990
Gender: Female
1234 5678 9012
`;

assert.equal(heuristicDobFromText(sample), "1990-08-15");
assert.equal(heuristicAadhaarFromText(sample), "123456789012");
assert.equal(heuristicGenderFromText(sample), "female");
assert.equal(heuristicNameFromText(sample), "Roopa Satheesh");
assert.equal(heuristicPanFromText("PAN ABCDE1234F Permanent Account"), "ABCDE1234F");

console.log("idScan.heuristics.ok");
