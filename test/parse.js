const { test } = require("node:test");
const assert = require("node:assert/strict");
const htmlparser = require("../dist/htmlparser2-lite");

test("basic use case", () => {
  const dom = htmlparser.parse("<div>z<!--x--></div>");
  assert.equal(dom.length, 1);
  assert.equal(dom[0].type, "tag");
  assert.equal(dom[0].name, "div");
  assert.deepEqual(dom[0].attribs, {});
  assert.equal(dom[0].children.length, 2);
  assert.equal(dom[0].children[0].type, "text");
  assert.equal(dom[0].children[0].data, "z");
  assert.equal(dom[0].children[1].data, "x");
});
