// The entry points of the package, resolved through the `exports` map (the
// dist directory is linked to node_modules/htmlparser2-lite)
const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const cjs = require("htmlparser2-lite");

// For the fixtures with `decodeEntities: true`
require("./fake-dom.cjs");

// The inputs and options of the upstream fixtures
const fixtures = ["htmlparser2/Events", "domhandler/cases"].flatMap((dir) =>
  fs
    .readdirSync(path.join(__dirname, "fixtures", dir))
    .map((file) => require(path.join(__dirname, "fixtures", dir, file)))
    .map(({ html, options }) => [html, { ...options.parser, ...options }]),
);

const withoutLinks = (dom) =>
  JSON.stringify(dom, (key, value) =>
    key == "parent" || key == "prev" || key == "next" ? undefined : value,
  );

describe("package", () => {
  test("require and import give the same API and results", async () => {
    const esm = await import("htmlparser2-lite");
    assert.notEqual(esm.parse, cjs.parse);
    assert.deepEqual(Object.keys(esm), Object.keys(cjs).sort());
    for (const [html, options] of fixtures) {
      const [esmDom, cjsDom] = [esm, cjs].map((lib) =>
        lib.parse(html, options),
      );
      assert.equal(withoutLinks(esmDom), withoutLinks(cjsDom));
      assert.equal(esm.serialize(esmDom), cjs.serialize(cjsDom));
    }
  });

  test("package.json can be required", () => {
    assert.equal(
      require("htmlparser2-lite/package.json").name,
      "htmlparser2-lite",
    );
  });

  const umd = fs.readFileSync(require.resolve("htmlparser2-lite"), "utf8");

  test("UMD: global", () => {
    const context = vm.createContext({});
    vm.runInContext(umd, context);
    assert.equal(
      context.htmlparser.serialize(context.htmlparser.parse("<p>a")),
      "<p>a</p>",
    );
  });

  test("UMD: AMD", () => {
    let result;
    const define = (factory) => (result = factory());
    define.amd = {};
    vm.runInContext(umd, vm.createContext({ define }));
    assert.deepEqual(Object.keys(result), Object.keys(cjs));
  });
});
