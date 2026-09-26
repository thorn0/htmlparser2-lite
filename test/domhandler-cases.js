// Port of domhandler v2.4.2's test/tests.js
const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { parse } = require("../dist/htmlparser2-lite");

const dir = path.join(__dirname, "fixtures/domhandler/cases");

const skipped = {
  "23-dom-lvl1.json": "withDomLvl1 isn't supported",
};

const overrides = {
  // domhandler 2.x doesn't know the end index of the first node if it's a
  // directive, it's `null` there
  "25-with-end-indices.json": (expected) => {
    expected[0].endIndex = 14;
  },
};

// Checks only the properties present in `expected`
const compare = (expected, actual, at = "dom") => {
  assert.equal(typeof actual, typeof expected, `types didn't match at ${at}`);
  if (typeof expected !== "object" || expected === null) {
    assert.equal(actual, expected, `values didn't match at ${at}`);
  } else {
    for (const prop in expected) {
      assert.ok(prop in actual, `missing ${at}.${prop}`);
      compare(expected[prop], actual[prop], `${at}.${prop}`);
    }
  }
};

describe("domhandler cases", () => {
  for (const file of fs.readdirSync(dir)) {
    const { name, options, html, expected } = require(path.join(dir, file));
    overrides[file]?.(expected);

    test(`${file}: ${name}`, { skip: skipped[file] }, () => {
      compare(expected, parse(html, options));
    });
  }
});
