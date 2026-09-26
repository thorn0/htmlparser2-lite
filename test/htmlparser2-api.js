// Port of the applicable parts of htmlparser2 v3.10.1's test/api.js
const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const { Parser } = require("../dist/htmlparser2-lite");

describe("htmlparser2 API", () => {
  test("should work without callbacks", () => {
    const p = new Parser(null, {
      xmlMode: true,
      lowerCaseAttributeNames: true,
    });
    p.end("<a foo><bar></a><!-- --><![CDATA[]]]><?foo?><!bar><boo/>boohay");
    p.end("<a foo>");
    p.end();
  });

  test("should update the position", () => {
    const positions = [];
    const p = new Parser({
      ontext: () => positions.push(["text", p.startIndex, p.endIndex]),
      onopentag: () => positions.push(["opentag", p.startIndex, p.endIndex]),
    });
    p.end("foo<bar>");
    assert.deepEqual(positions, [
      ["text", 0, 2],
      ["opentag", 3, 7],
    ]);
  });
});
