const { test } = require("node:test");
const assert = require("node:assert/strict");
const htmlparser = require("../dist/htmlparser2-lite");

test("isTag", () => {
  const dom = htmlparser.parse(
    "<p>text<!--c--><script></script><style></style></p>",
  );
  const p = dom[0];
  assert.equal(htmlparser.isTag(p), true);

  const [text, comment, script, style] = p.children;
  assert.equal(htmlparser.isTag(text), false);
  assert.equal(htmlparser.isTag(comment), false);
  assert.equal(htmlparser.isTag(script), true);
  assert.equal(htmlparser.isTag(style), true);
});
