// Differential fuzzer: random markup must give the same DOM as with
// htmlparser2 12 (see htmlparser2-comparison.js). Reports the smallest inputs
// that give different DOMs.
// Usage: node fuzz/htmlparser2.js [inputs] [seed]
// Environment: BUNDLE (the build to test), MAX_FAILURES (default 15)
const path = require("node:path");
const { inputs, shrink } = require("./random.js");

const lib = require(
  path.resolve(
    process.env.BUNDLE || `${__dirname}/../dist/htmlparser2-lite.js`,
  ),
);
const {
  TOKENS,
  OPTIONS,
  SUFFIX,
  difference,
  throws,
  withoutIntended,
  unexpectedDifference,
} = require("./htmlparser2-comparison.js")(lib);

const generated = inputs(TOKENS);
const maxFailures = Number(process.env.MAX_FAILURES) || 15;
const seen = new Set();
let intended = 0;
for (const tokens of generated) {
  if (seen.size >= maxFailures) break;
  tokens.push(SUFFIX);
  const options = generated.pick(OPTIONS);
  const input = tokens.join("");
  if (!unexpectedDifference(input, options)) {
    if (difference(input, options)) intended++;
    continue;
  }
  // Errors stay errors while shrinking
  const threw = throws(input, options);
  const small = shrink(
    tokens,
    (shorter) =>
      (threw ? throws : unexpectedDifference)(shorter.join(""), options),
    1,
  ).join("");
  const key = small + JSON.stringify(options);
  if (seen.has(key)) continue;
  seen.add(key);
  const compared = threw ? small : withoutIntended(small, options);
  console.log(
    `${JSON.stringify(small)} ${JSON.stringify(options)}` +
      `${compared == small ? "" : `\n  compared as ${JSON.stringify(compared)}`}\n` +
      `${unexpectedDifference(small, options)}\n`,
  );
}
console.log(
  `seed ${generated.seed}: ${seen.size} distinct unexpected differences, ${intended} inputs with only intended ones`,
);
process.exitCode = seen.size ? 1 : 0;
