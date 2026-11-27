import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs/promises"

// Regression: 94c12c03 left the divider tile group (<g id="…-b">) outside <defs>, so it was painted
// at origin AND again via <use>, compounding the opacity of translucent shapes (and drawing a stray
// copy in row 0 of every divider with k > 0).
test("divider tile group is only defined in <defs>, painted once through <use>", async () => {
  const src = await fs.readFile(new URL("../../layouts/partials/files/draws-svg.html", import.meta.url), "utf8")
  const defs = src.slice(src.indexOf("<defs>"), src.indexOf("</defs>"))
  assert.match(defs, /<g id="\{\{ \.id \}\}-b">/)
  const outside = src.slice(src.indexOf("</defs>"))
  assert.doesNotMatch(outside, /<g id="\{\{ \.id \}\}-b">/)
  assert.equal((outside.match(/<use href="#\{\{ \.id \}\}-b"/g) || []).length, 2)
})
