const { test } = require("node:test");
const assert = require("node:assert/strict");
const htmlparser = require("../dist/htmlparser2-lite");

const { parse, serialize } = htmlparser;

const roundTrip = (s, parserOptions) => serialize(parse(s, parserOptions));

test("basic use case", () => {
  assert.equal(roundTrip("<div>z</div>"), "<div>z</div>");
});

test("quotes in attributes", () => {
  assert.equal(roundTrip("<div a='\"'>z</div>"), '<div a="&quot;">z</div>');
});

test("unescaped less-than", () => {
  assert.equal(roundTrip("a < b"), "a &lt; b");
});

test("recognizeSelfClosing", () => {
  assert.equal(
    roundTrip("<x1/><x2/>", { recognizeSelfClosing: true }),
    "<x1></x1><x2></x2>",
  );
});

test("misc HTML", () => {
  assert.equal(
    roundTrip(
      "<div></div   ><p>&lt;</p><!--<x>--><input    type=checkbox checked/>",
    ),
    '<div></div><p>&lt;</p><!--<x>--><input type="checkbox" checked>',
  );
});

test("spaceInSelfClosing", () => {
  assert.equal(
    serialize(parse("<x1 /><x2 />", { recognizeSelfClosing: true }), {
      xmlMode: true,
      spaceInSelfClosing: true,
    }),
    "<x1 /><x2 />",
  );
});
