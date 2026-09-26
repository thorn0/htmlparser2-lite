const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const htmlparser = require("../dist/htmlparser2-lite");

describe("htmlparser.replace", () => {
  test("root level (3 args)", () => {
    const dom = htmlparser.parse("<a></a><b></b><c></c>");
    htmlparser.replace(dom[1], htmlparser.create("x"), dom);
    assert.equal(htmlparser.serialize(dom), "<a></a><x></x><c></c>");
  });
});
