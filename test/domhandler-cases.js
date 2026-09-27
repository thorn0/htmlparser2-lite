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

// "</" followed by whitespace starts a comment, like in htmlparser2 12
const endTagWithSpacesIsComment = (expected) => {
  expected[0].children.push({ type: "comment", data: "\t\nfont\t \n" });
};

// These fixtures leave out the text after the last element
const addTrailingText = (expected) => {
  expected.push({ type: "text", data: " " });
};

const overrides = {
  "08-extra_spaces_in_tag.json": endTagWithSpacesIsComment,
  "15-non-verbose.json": endTagWithSpacesIsComment,
  "24-with-start-indices.json": addTrailingText,
  "25-with-end-indices.json": (expected) => {
    addTrailingText(expected);
    // domhandler 2.x doesn't know the end index of the first node if it's a
    // directive, it's `null` there
    expected[0].endIndex = 14;
  },
};

// Checks only the properties present in `expected`, and the lengths of arrays
const compare = (expected, actual, at = "dom") => {
  assert.equal(typeof actual, typeof expected, `types didn't match at ${at}`);
  if (typeof expected !== "object" || expected === null) {
    assert.equal(actual, expected, `values didn't match at ${at}`);
  } else {
    if (Array.isArray(expected)) {
      assert.equal(actual.length, expected.length, `lengths didn't match at ${at}`);
    }
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
