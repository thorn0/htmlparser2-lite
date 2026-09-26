const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const htmlparser = require("../dist/htmlparser2-lite");

describe("htmlparser.prependChild", () => {
  test("3 args", () => {
    const dom = htmlparser.parse("<a></a><b></b>");
    const b = dom[1];
    assert.notEqual(b.prev, null);
    assert.equal(b.prev, dom[0]);
    htmlparser.prependChild(b, dom[0], dom);
    assert.equal(dom.length, 1);
    assert.equal(dom[0], b);
    assert.equal(b.prev, null);
    assert.equal(b.children.length, 1);
  });
});
