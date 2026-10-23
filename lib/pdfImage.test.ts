import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { pdfFriendlyImageUrl } from "./pdfImage"

describe("pdfFriendlyImageUrl", () => {
  test("forces Cloudinary PNG delivery for logos and stamps", () => {
    const src =
      "https://res.cloudinary.com/dwhlynqj3/image/upload/v1/clinic-logo.webp"
    assert.equal(
      pdfFriendlyImageUrl(src),
      "https://res.cloudinary.com/dwhlynqj3/image/upload/f_png/v1/clinic-logo.webp",
    )
  })

  test("does not double-apply format when already set", () => {
    const src =
      "https://res.cloudinary.com/dwhlynqj3/image/upload/f_jpg/v1/stamp.jpg"
    assert.equal(pdfFriendlyImageUrl(src), src)
  })

  test("passes through empty values", () => {
    assert.equal(pdfFriendlyImageUrl(""), "")
    assert.equal(pdfFriendlyImageUrl(null), "")
  })
})
