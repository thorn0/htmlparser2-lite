const { test } = require("node:test");
const assert = require("node:assert/strict");
const htmlparser = require("../dist/htmlparser2-lite");

test("findAll", () => {
  const dom = htmlparser.parse("<a><b><c></c></b></a>");
  const result = htmlparser.findAll("b", dom);
  assert.equal(result.length, 1);
  assert.equal(result[0].name, "b");
});

test("findAll with predicate", () => {
  const dom = htmlparser.parse("<a><b><c></c></b></a>");
  const result = htmlparser.findAll((node) => node.name === "b", dom);
  assert.equal(result.length, 1);
  assert.equal(result[0].name, "b");
});

test("findAll with predicate and multiple matches", () => {
  const dom = htmlparser.parse("<a><b><c></c></b><b><c></c></b></a>");
  const result = htmlparser.findAll((node) => node.name === "b", dom);
  assert.equal(result.length, 2);
  assert.equal(result[0].name, "b");
  assert.equal(result[1].name, "b");
});

test("findOne", () => {
  const dom = htmlparser.parse("<a><b><c></c></b></a>");
  const result = htmlparser.findOne("b", dom);
  assert.equal(result.name, "b");
});

test("findOne with predicate", () => {
  const dom = htmlparser.parse("<a><b><c></c></b></a>");
  const result = htmlparser.findOne((node) => node.name === "b", dom);
  assert.equal(result.name, "b");
});

test("findOne with predicate and multiple matches", () => {
  const dom = htmlparser.parse(
    "<a><b id=1><c></c></b><d><b id=2></b></d><b id=3><c></c></b></a>",
  );
  const result = htmlparser.findOne((node) => node.name === "b", dom);
  assert.equal(result.name, "b");
  assert.equal(result.attribs.id, "1");
});
