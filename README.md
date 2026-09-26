# htmlparser2-lite

[![npm](https://img.shields.io/npm/v/htmlparser2-lite.svg)](https://www.npmjs.com/package/htmlparser2-lite)
[![npm bundle size (minified)](https://img.shields.io/bundlephobia/min/htmlparser2-lite.svg)](https://unpkg.com/htmlparser2-lite)
[![npm bundle size (minified + gzip)](https://img.shields.io/bundlephobia/minzip/htmlparser2-lite.svg)](https://bundlephobia.com/result?p=htmlparser2-lite)

> [Fast & forgiving HTML/XML parser](https://github.com/fb55/htmlparser2) for the browser, < 7 KB minified (~3 KB gzipped), no dependencies

A compact reimplementation of [`htmlparser2`](https://github.com/fb55/htmlparser2) 3.x and friends, compatible with them. It passes
the [`htmlparser2`](https://github.com/fb55/htmlparser2/tree/v3.10.1/test/Events) and
[`domhandler`](https://github.com/fb55/domhandler/tree/v2.4.2/test/cases) test suites (except for the unsupported features listed below).

## Usage

```js
import { parse, serialize, findAll } from "htmlparser2-lite";

const dom = parse('<p>Hello <a href="/x">world</a>');
for (const link of findAll("a", dom)) link.attribs.target = "_blank";
serialize(dom); // '<p>Hello <a href="/x" target="_blank">world</a></p>'
```

Also works with `require("htmlparser2-lite")`, AMD, and as a `<script>` that defines the `htmlparser` global:

```html
<script src="https://unpkg.com/htmlparser2-lite"></script>
<script>
  const dom = htmlparser.parse("<p>Hello</p>");
</script>
```

## Includes:

- `Parser`: [`htmlparser2`](https://github.com/fb55/htmlparser2) 3.x's parser with the same events, options and parsing rules,
  plus the additional implied end tags of [`@thorn0/htmlparser2`](https://www.npmjs.com/package/@thorn0/htmlparser2)
  (e.g. `<p>` is closed by `<div>`, `<dt>` by `<dd>`)
- `parse`: builds a DOM compatible with [`domhandler`](https://github.com/fb55/domhandler) 2.x
- `serialize`: [`dom-serializer`](https://github.com/cheeriojs/dom-serializer) with a fix for [#26](https://github.com/cheeriojs/dom-serializer/issues/26)
- The most useful parts of [`domutils`](https://github.com/fb55/domutils)
- A `create` utility function for simple DOM node creation
- [TypeScript type definitions](https://github.com/thorn0/htmlparser2-lite/blob/master/dist/htmlparser2-lite.d.ts)

## Excludes:

- The [`decodeEntities`](https://github.com/fb55/htmlparser2/wiki/Parser-options#option-decodeentities) option
- Streaming: the whole input is passed to `Parser#end`. There are no `write`, `parseComplete`, `reset`, `pause`, `resume` methods and no
  events useful only for streaming: `onopentagname`, `onattribute` (use `onopentag`), `oncommentend`, `onreset`, `onparserinit`,
  `onerror`
- [`FeedHandler`](https://github.com/fb55/htmlparser2/blob/master/lib/FeedHandler.js), `DomHandler`, `Tokenizer`
- The `withDomLvl1` option
- Some functions from `domutils`
- [Automatic fix-up](https://github.com/cheeriojs/dom-serializer/commit/78093e974872c5250922b07542095785ea4637e9) of mixed-case tag and attribute names.
  Set the `lowerCaseTags` and `lowerCaseAttributeNames` options of the parser to `false` to retain the casing.

## Differences from `htmlparser2` 3.x:

- At the end of the input, an unterminated comment or CDATA section is kept, and any other unterminated markup is dropped. htmlparser2
  handles these cases inconsistently, e.g. it drops `<!--`, but turns `<!doctype` into the text `doctype`.
- `startIndex` and `endIndex` are the exact range of each node's markup, and an element closed implicitly by a start tag ends right before
  that tag. In htmlparser2, the ranges are off in some cases, e.g. for directives.
- A script ends at the first `</script` followed by whitespace or `>`, a style at the first such `</style`. htmlparser2 misses it in some
  cases, e.g. in `</s</script>`.
- `<!->` is a declaration ending at its `>`. In htmlparser2, it continues to the next `>`.
- Text between two tags comes in one `ontext` event. htmlparser2 can split it, e.g. at a `<` that doesn't start a tag.

## Performance

On real-world pages, it parses about 1.3× (building a DOM) to 1.4× (events only) as fast as its predecessor, `htmlparser2-20kb`, and
serializes about 1.2× as fast.

Time grows linearly with the size of the input for any markup, so even malicious HTML can't make parsing hang, and elements can be nested
arbitrarily deep. The same goes for `remove` and `create` when they get many nodes at once, so pass all the nodes to remove in one call
rather than removing them one by one.

## Browser support

The code is ES2022, it targets [Baseline](https://web.dev/baseline) Widely available browsers and their downstream browsers
(browserslist query `baseline widely available with downstream`).

## Migrating from `htmlparser2-20kb`

- Replace `DomHandler` with `parse`, `getAttribValue(el, name)` with `el.attribs[name]`, `hasAttrib(el, name)` with
  `Object.hasOwn(el.attribs, name)`, `getSiblings(node)` with `node.parent.children`
- `filter` is renamed to `filterNodes`, so that linters (e.g. `eslint-plugin-unicorn`) don't mistake it for `Array#filter`. Its
  `recursive` parameter is removed, so `limit` is the third parameter now: replace `filter(test, nodes, true, limit)` with
  `filterNodes(test, nodes, limit)`, and `filter(test, nodes, false)` with `nodes.filter(test)`.
- Replace `parser.write(a); parser.write(b); parser.end()` with `parser.end(a + b)`, and `parser.parseComplete(html)` with
  `parser.end(html)`. Handle attributes in `onopentag` instead of `onattribute`.
- See the differences listed above

## Size comparison

The current `htmlparser2` on Bundlephobia: https://bundlephobia.com/result?p=htmlparser2

## Development

- `yarn build`: builds `dist/htmlparser2-lite.js` (UMD) and `dist/htmlparser2-lite.mjs` (ES module) from `src/htmlparser2-lite.js`,
  runs the tests and checks the types
- `yarn test`: runs the tests against the built files
