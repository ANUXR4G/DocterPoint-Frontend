import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { normalizeProfileImageUrl } from "../../core/profileImage.js";

const OK =
  "https://res.cloudinary.com/dwhlynqj3/image/upload/v1712345678/abc123.jpg";

describe("profile photo / clinic logo URL", () => {
  test("accepts our Cloudinary uploads", () => {
    assert.equal(normalizeProfileImageUrl(OK), OK);
    assert.equal(normalizeProfileImageUrl(`  ${OK}  `), OK);
  });
  test("blank or null clears the image", () => {
    assert.equal(normalizeProfileImageUrl(""), null);
    assert.equal(normalizeProfileImageUrl("   "), null);
    assert.equal(normalizeProfileImageUrl(null), null);
  });
  test("keeps an unchanged legacy value", () => {
    const legacy = "https://images.pexels.com/photos/1.jpeg";
    assert.equal(normalizeProfileImageUrl(legacy, legacy), legacy);
  });
  test("allows server-owned patient upload paths", () => {
    assert.equal(
      normalizeProfileImageUrl("/uploads/patients/p1/photo.jpg"),
      "/uploads/patients/p1/photo.jpg",
    );
    assert.throws(() => normalizeProfileImageUrl("/uploads/patients/../.env"));
  });
  test("rejects other hosts, clouds, http and non-strings", () => {
    assert.throws(() => normalizeProfileImageUrl("https://evil.example/x.jpg"));
    assert.throws(() =>
      normalizeProfileImageUrl("https://res.cloudinary.com/other/image/upload/x.jpg"),
    );
    assert.throws(() =>
      normalizeProfileImageUrl("http://res.cloudinary.com/dwhlynqj3/image/upload/x.jpg"),
    );
    assert.throws(() => normalizeProfileImageUrl("javascript:alert(1)"));
    assert.throws(() => normalizeProfileImageUrl(42));
  });
});
