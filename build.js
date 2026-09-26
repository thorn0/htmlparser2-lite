const fs = require("fs");
const acorn = require("acorn");
const UglifyJS = require("uglify-js");

const MAX_SIZE = 7000;

// The latest ES version fully supported by the browsers from the "browserslist"
// query in package.json ("baseline widely available with downstream"). Only
// syntax is checked, not built-ins.
const ECMA_VERSION = 2022;

const source = fs.readFileSync("src/htmlparser2-lite.js", "utf8");
acorn.parse(source, { ecmaVersion: ECMA_VERSION });

const { code, error } = UglifyJS.minify(source, {
  // Don't use `pure_getters`, it drops the global assignment in the UMD wrapper
  compress: { passes: 3 },
  mangle: true,
});
if (error) throw error;
acorn.parse(code, { ecmaVersion: ECMA_VERSION });

fs.writeFileSync("dist/htmlparser2-lite.js", code);
fs.copyFileSync("README.md", "dist/README.md");

const size = Buffer.byteLength(code);
console.log(`dist/htmlparser2-lite.js: ${size} bytes`);
if (size >= MAX_SIZE) {
  console.error(`The bundle must be smaller than ${MAX_SIZE} bytes`);
  process.exit(1);
}
