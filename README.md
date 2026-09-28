# htmlparser2-lite

[![npm](https://img.shields.io/npm/v/htmlparser2-lite.svg)](https://www.npmjs.com/package/htmlparser2-lite)
[![npm bundle size (minified)](https://img.shields.io/bundlephobia/min/htmlparser2-lite.svg)](https://unpkg.com/htmlparser2-lite)
[![npm bundle size (minified + gzip)](https://img.shields.io/bundlephobia/minzip/htmlparser2-lite.svg)](https://bundlephobia.com/result?p=htmlparser2-lite)

> [Fast & forgiving HTML/XML parser](https://github.com/fb55/htmlparser2) for the browser, < 9 KB minified (4.1 KB gzipped), no dependencies

A compact reimplementation of [`htmlparser2`](https://github.com/fb55/htmlparser2) and friends: the API of `htmlparser2` 3.x with the
[parsing rules](#parsing-rules) of `htmlparser2` 12. It passes the [`htmlparser2`](https://github.com/fb55/htmlparser2/tree/v3.10.1/test/Events)
3.x and [`domhandler`](https://github.com/fb55/domhandler/tree/v2.4.2/test/cases) 2.x test suites, except for the unsupported features
listed below and the cases where the parsing rules have changed since.

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

## Options

`parse(markup, options)` and `new Parser(handler, options)`:

| Option                    | Default                                    | Effect                                                                                                          |
| ------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `xmlMode`                 | `false`                                    | Parse XML: no text-only, void or implicitly closed elements, `/>` closes elements, CDATA sections are recognized, `<!x>` and `<?x?>` are directives |
| `lowerCaseTags`           | `true` in HTML, `false` in XML             | Lowercase tag names                                                                                             |
| `lowerCaseAttributeNames` | `true` in HTML, `false` in XML             | Lowercase attribute names                                                                                       |
| `recognizeCDATA`          | `false` (always on in XML)                 | Parse CDATA sections as CDATA instead of comments (text in SVG and MathML)                                      |
| `recognizeSelfClosing`    | `false` (always on in XML, SVG and MathML) | Close elements written as self-closing (`<x/>`)                                                                 |
| `decodeEntities`          | `false`                                    | Decode character references, see [below](#decoding-character-references)                                        |

`parse` only:

| Option                | Default | Effect                                                                                      |
| --------------------- | ------- | ------------------------------------------------------------------------------------------- |
| `normalizeWhitespace` | `false` | Replace each run of whitespace in text with a single space                                  |
| `withStartIndices`    | `false` | Set `startIndex` of nodes: the index of their first character in the input                  |
| `withEndIndices`      | `false` | Set `endIndex` of nodes: the index of their last character (for elements, of their end tag) |

`serialize(dom, options)`:

| Option               | Default | Effect                                                                                                                       |
| -------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `xmlMode`            | `false` | `true`: output XML. `"foreign"`: output HTML as inside SVG or MathML (which `false` switches to inside `<svg>` and `<math>`) |
| `spaceInSelfClosing` | `false` | Write self-closing elements as `<x />` instead of `<x/>`                                                                     |
| `decodeEntities`     | `false` | For a DOM parsed with `decodeEntities`: encode `&` too (and for XML, `>` in text and `<` in attribute values)                |

The text of `<script>`, `<style>` and the other elements whose text is raw in HTML isn't escaped outside SVG and MathML, in XML output
too unless `decodeEntities` is set, so HTML can be written with XML syntax (e.g. parsed with `recognizeSelfClosing` and serialized with
`xmlMode: true`). Nodes that are part of a DOM are written as in the whole DOM, e.g. the content of an element inside `<svg>` as SVG.

See the [type definitions](https://github.com/thorn0/htmlparser2-lite/blob/master/dist/htmlparser2-lite.d.ts) for details.

## Decoding character references

By default, character references like `&amp;` stay as they are. With the `decodeEntities` option, they're decoded in text and
attribute values (not in comments, CDATA, and in HTML, not in the elements whose text is raw, like `<script>` and `<style>`):

- In browsers, `decodeEntities: true` uses the browser's own parser, so no table of HTML's more than 2000 named references needs to be
  bundled. They come out exactly as the browser decodes them in the same markup, quirks included (e.g. Chromium turns `&#x;` into `�`).
- In XML mode, `decodeEntities: true` decodes the XML entities and numeric references, which works everywhere.
- Where there's no DOM (Node, workers), pass a function, e.g. using the [`entities`](https://github.com/fb55/entities) package:

  ```js
  import { decodeHTML, decodeHTMLAttribute } from "entities";

  const dom = parse(html, {
    decodeEntities: (text, inAttribute) =>
      inAttribute ? decodeHTMLAttribute(text) : decodeHTML(text),
  });
  ```

To serialize a decoded DOM, pass `decodeEntities: true` to `serialize` as well, so that `&` (and for XML, `>` in text and `<` in
attribute values) gets encoded.

## Includes:

- `Parser`: [`htmlparser2`](https://github.com/fb55/htmlparser2) 3.x's parser with the same events and options
- `parse`: builds a DOM compatible with [`domhandler`](https://github.com/fb55/domhandler) 2.x (except that in XML mode, `<script>` and
  `<style>` elements have the type `tag`, like in later versions)
- `serialize`: [`dom-serializer`](https://github.com/cheeriojs/dom-serializer) with a fix for [#26](https://github.com/cheeriojs/dom-serializer/issues/26)
- The most useful parts of [`domutils`](https://github.com/fb55/domutils)
- A `create` utility function for simple DOM node creation
- [TypeScript type definitions](https://github.com/thorn0/htmlparser2-lite/blob/master/dist/htmlparser2-lite.d.ts)

## Excludes:

- Streaming: the whole input is passed to `Parser#end`. There are no `write`, `parseComplete`, `reset`, `pause`, `resume` methods and no
  events useful only for streaming: `onopentagname`, `onattribute` (use `onopentag`), `oncommentend`, `onreset`, `onparserinit`,
  `onerror`
- [`FeedHandler`](https://github.com/fb55/htmlparser2/blob/master/lib/FeedHandler.js), `DomHandler`, `Tokenizer`
- The `withDomLvl1` option
- Some functions from `domutils`
- [Automatic fix-up](https://github.com/cheeriojs/dom-serializer/commit/78093e974872c5250922b07542095785ea4637e9) of mixed-case tag and attribute names.
  Set the `lowerCaseTags` and `lowerCaseAttributeNames` options of the parser to `false` to retain the casing.

## Parsing rules

The parsing rules are those of `htmlparser2` 12, which follows the HTML spec more closely than 3.x did. Compared to 3.x, in HTML:

- `<!-->` and `<!--->` are empty comments, and comments also end with `--!>`
- `<!…>` (except for `<!doctype…>`), `<?…>`, and `</` followed by anything but a letter or `>` start comments ending at the next `>`
  (e.g. `<?xml?>` is the comment `?xml?`). `</>` is ignored.
- Tags start with a letter, so `<1>` is text
- The content of `<title>`, `<textarea>` (decoded, see [`decodeEntities`](#decoding-character-references)), `<xmp>`, `<iframe>`,
  `<noembed>`, `<noframes>` and `<plaintext>` (till the end of the input) is text, like that of `<script>` and `<style>`, but not in SVG or
  MathML. With `recognizeSelfClosing`, `<script/>` etc. are empty.
- `<![CDATA[…]]>` is text in SVG and MathML
- Unterminated `<![CDATA[` is a comment till the end of the input
- More elements are closed implicitly (e.g. `<p>` by `<div>`, `<dt>` by `<dd>`, `<td>` by `<th>`, `<thead>` by `<tbody>`)
- A `<form>` in another one is ignored
- SVG element names get their case (e.g. `clipPath`), and `<image>` outside SVG and MathML is `<img>`
- An `<svg/>` closed by `/>` doesn't make `/>` close the elements after it

## Differences from `htmlparser2` 12:

- An unterminated tag at the end of the input, and in XML, an unterminated `<!…>` or `<?…?>` there, is dropped. htmlparser2 turns a part of
  it into text in some cases, e.g. `</a b` into `b`, and in XML, `<?x` into `x`.
- The data of an XML processing instruction includes the final `?` (e.g. `?xml version="1.0"?`), so that it's serialized as it was.
- `startIndex` and `endIndex` are the exact range of each node's markup, and an element closed implicitly by a start tag ends right before
  that tag. In htmlparser2, the ranges are off in some cases.
- Text between two tags comes in one `ontext` event. htmlparser2 can split it, e.g. at a `<` that doesn't start a tag.

## Performance

On real-world pages, it builds a DOM about 1.5× as fast as its predecessor, `htmlparser2-20kb` (from about 1.1× on some large pages to
3× on feeds), parses events only about 1.7× as fast, and serializes about 1.4× as fast. Markup with many tags and little text, like
templates, parses about 1.1× to 1.2× as fast.

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
- See the [parsing rules](#parsing-rules), which have changed
- `serialize` escapes `<` in the text of `<noscript>`, and of `<script>`, `<style>` etc. in SVG and MathML (their content is markup
  when parsing), and leaves the text of `<SCRIPT>` etc. raw whatever the case of the name. It ignores nodes of type `root`, pass
  their `children` instead.

## Size comparison

The current `htmlparser2` on Bundlephobia: https://bundlephobia.com/result?p=htmlparser2

## Development

- `yarn build`: builds `dist/htmlparser2-lite.js` (UMD) and `dist/htmlparser2-lite.mjs` (ES module) from `src/htmlparser2-lite.js`,
  runs the tests and checks the types
- `yarn test`: runs the tests against the built files
