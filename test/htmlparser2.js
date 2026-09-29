// Random markup gives the same DOM as with htmlparser2 12, except for the
// intended differences (see fuzz/htmlparser2-comparison.js)
const { test } = require("node:test");
const assert = require("node:assert/strict");
const lib = require("../dist/htmlparser2-lite");
const { random, shrink } = require("../fuzz/random.js");
const { TOKENS, OPTIONS, SUFFIX, unexpectedDifference } =
  require("../fuzz/htmlparser2-comparison.js")(lib);

const INPUTS = 2000;

const optionSets = [
  ...new Set(OPTIONS.map((options) => JSON.stringify(options))),
];
for (const [index, key] of optionSets.entries()) {
  const options = JSON.parse(key);
  test(key, () => {
    const next = random(index + 1);
    const pick = (list) => list[Math.floor(next() * list.length)];
    for (let i = 0; i < INPUTS; i++) {
      const tokens = Array.from({ length: 1 + Math.floor(next() * 14) }, () =>
        pick(TOKENS),
      );
      tokens.push(SUFFIX);
      if (!unexpectedDifference(tokens.join(""), options)) continue;
      const fails = (shorter) =>
        unexpectedDifference(shorter.join(""), options);
      const input = shrink(tokens, fails, 1).join("");
      assert.fail(
        `${JSON.stringify(input)}\n${unexpectedDifference(input, options)}`,
      );
    }
  });
}
