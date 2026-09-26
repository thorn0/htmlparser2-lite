const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const htmlparser = require("../dist/htmlparser2-lite");

describe("htmlparser.appendChild", () => {
  test("basic test", () => {
    const dom = htmlparser.parse("<a><b></b></a>");
    const a = dom[0];
    htmlparser.appendChild(a, htmlparser.create("i"));
    assert.equal(dom.length, 1);
    assert.equal(dom[0], a);
    assert.equal(a.next, null);
    assert.equal(a.children.length, 2);
    assert.equal(a.children[1].name, "i");
  });

  test("3 args", () => {
    const dom = htmlparser.parse("<a></a><b></b>");
    const a = dom[0];
    assert.notEqual(a.next, null);
    assert.equal(a.next, dom[1]);
    htmlparser.appendChild(a, dom[1], dom);
    assert.equal(dom.length, 1);
    assert.equal(dom[0], a);
    assert.equal(a.next, null);
    assert.equal(a.children.length, 1);
  });
});
