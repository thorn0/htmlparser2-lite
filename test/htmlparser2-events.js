// Port of htmlparser2 v3.10.1's test/01-events.js and test/test-helper.js
const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { Parser } = require("../dist/htmlparser2-lite");

// For `decodeEntities: true` in HTML mode
require("./fake-dom.cjs");

const dir = path.join(__dirname, "fixtures/htmlparser2/Events");

// Format: event name: number of arguments
const EVENTS = {
  cdatastart: 0,
  cdataend: 0,
  text: 1,
  processinginstruction: 2,
  comment: 1,
  closetag: 1,
  opentag: 2,
  end: 0,
};

// Events of htmlparser2 that are useful only for streaming, not emitted here
const REMOVED_EVENTS = new Set(["opentagname", "attribute", "commentend"]);

// Collects events, merging consecutive text events, like htmlparser2's
// CollectingHandler with the test helper's reducer
const collectEvents = (html, options) => {
  const events = [];
  const handler = {};
  for (const [name, argCount] of Object.entries(EVENTS)) {
    handler["on" + name] = (...args) => {
      if (name === "end") return;
      const last = events.at(-1);
      if (name === "text" && last?.event === "text") last.data[0] += args[0];
      else events.push({ event: name, data: args.slice(0, argCount) });
    };
  }
  new Parser(handler, options).end(html);
  return events;
};

describe("htmlparser2 events", () => {
  for (const file of fs.readdirSync(dir)) {
    const { name, options, html, expected } = require(path.join(dir, file));

    test(`${file}: ${name}`, () => {
      assert.deepEqual(
        // Attributes objects must be compared as plain objects
        JSON.parse(JSON.stringify(collectEvents(html, options.parser))),
        expected.filter(({ event }) => !REMOVED_EVENTS.has(event)),
      );
    });
  }
});
