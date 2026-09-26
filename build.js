const fs = require("fs");
const acorn = require("acorn");
const UglifyJS = require("uglify-js");

const MAX_SIZE = 7000;

// The latest ES version fully supported by the browsers from the "browserslist"
// query in package.json ("baseline widely available with downstream"). Only
// syntax is checked, not built-ins.
const ECMA_VERSION = 2022;

const source = fs.readFileSync("src/htmlparser2-lite.js", "utf8");
acorn.parse(source, { ecmaVersion: ECMA_VERSION, sourceType: "module" });

// The source is an ES module with a single export statement at the end. For
// the UMD build (CommonJS, AMD, global), its body is wrapped in a factory that
// returns the exports.
const exportStatement = /^export \{([^}]*)\};\s*$/m;
const [exportCode, exportNames] = source.match(exportStatement) ?? [];
if (!exportCode || /^(import|export)\b/m.test(source.replace(exportCode, ""))) {
  throw Error("The source must have one export statement and no imports");
}
const umd = `(function (factory) {
  if (typeof exports == "object" && typeof module != "undefined") {
    module.exports = factory();
  } else if (typeof define == "function" && define.amd) {
    define(factory);
  } else {
    globalThis.htmlparser = factory();
  }
})(function () {
  "use strict";
  ${source.replace(exportCode, `return {${exportNames}};`)}
});
`;

const builds = [
  ["dist/htmlparser2-lite.js", umd, "script"],
  ["dist/htmlparser2-lite.mjs", source, "module"],
];
for (const [file, code, sourceType] of builds) {
  const result = UglifyJS.minify(code, {
    // For the UMD build, `module` stays unspecified: then it assumes strict
    // mode (fine for this code, and needed to turn `const` into `var`) without
    // enabling `toplevel`
    ...(sourceType == "module" && { module: true }),
    compress: { passes: 3 },
    mangle: true,
  });
  if (result.error) throw result.error;
  acorn.parse(result.code, { ecmaVersion: ECMA_VERSION, sourceType });
  fs.writeFileSync(file, result.code);

  const size = Buffer.byteLength(result.code);
  console.log(`${file}: ${size} bytes`);
  if (size >= MAX_SIZE) {
    console.error(`The bundle must be smaller than ${MAX_SIZE} bytes`);
    process.exit(1);
  }
}

// Types for the ES module build, which doesn't create a global
fs.writeFileSync(
  "dist/htmlparser2-lite.d.mts",
  fs
    .readFileSync("dist/htmlparser2-lite.d.ts", "utf8")
    .replace(/^export as namespace .*\n/m, ""),
);

fs.copyFileSync("README.md", "dist/README.md");
