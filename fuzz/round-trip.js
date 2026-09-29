// Round-trip fuzzer: random markup parsed, serialized and parsed again must
// give the same DOM. Reports the smallest failing inputs, as "INJECTION" if
// the second DOM has elements or attributes that the first one doesn't.
// Usage: node fuzz/round-trip.js [inputs] [seed]
// Environment: BUNDLE (the build to test), MAX_TOKENS (per input, default
// 14), PER_KIND (examples shown per kind, default 8)
const path = require("node:path");
const { decodeHTML, decodeHTMLAttribute } = require("entities");
const { inputs, shrink } = require("./random.js");

const lib = require(
  path.resolve(
    process.env.BUNDLE || `${__dirname}/../dist/htmlparser2-lite.js`,
  ),
);

const TOKENS = [
  "<",
  ">",
  "/",
  "</",
  "/>",
  "<!--",
  "-->",
  "--",
  "-",
  "--!>",
  "!",
  "?",
  "=",
  '"',
  "'",
  " ",
  "\n",
  "a",
  "b",
  "x",
  "1",
  "é",
  "&",
  "&amp;",
  "&lt;",
  "&gt;",
  "&quot;",
  "&#60;",
  "&#x3c;",
  "&lt",
  "&apos;",
  "]]>",
  "]]",
  "<![CDATA[",
  "<![CDATA[x]]>",
  "<![CDATA[<b>]]>",
  "<![CDATA[</style>]]>",
  "<![CDATA[</script><i>]]>",
  "<!",
  "<!>",
  "<!-->",
  "<!--->",
  "<!-x>",
  "<!->",
  "<?",
  "<?x>",
  "<?x?>",
  "?>",
  "<!DOCTYPE html>",
  "</ ",
  "</1",
  "<1",
  "</>",
  "</x>",
  "<x>",
  "<x/>",
  "<X>",
  "<a>",
  "</a>",
  "<p>",
  "</p>",
  "<b>",
  "</b>",
  "<br>",
  "</br>",
  "<br/>",
  "<div>",
  "</div>",
  "<form>",
  "</form>",
  "<img/>",
  "<image>",
  "<image/>",
  "<u></u>",
  "<script>",
  "</script>",
  "<script/>",
  "</script ",
  "</scriptx>",
  "<SCRIPT>",
  "</SCRIPT>",
  "<style>",
  "</style>",
  "<style/>",
  "<STYLE>",
  "<title>",
  "</title>",
  "<textarea>",
  "</textarea>",
  "<xmp>",
  "</xmp>",
  "<iframe>",
  "</iframe>",
  "<noembed>",
  "</noembed>",
  "<noframes>",
  "<noscript>",
  "</noscript>",
  "<svg>",
  "</svg>",
  "<svg/>",
  "<SVG>",
  "<math>",
  "</math>",
  "<foreignObject>",
  "</foreignObject>",
  "<foreignobject>",
  "</foreignobject>",
  "<desc>",
  "</desc>",
  "<svg:title>",
  "<title/>",
  "<mi>",
  "</mi>",
  "<mo>",
  "<mtext>",
  "</mtext>",
  "<annotation-xml>",
  "</annotation-xml>",
  "<clippath>",
  "</clippath>",
  "<g/>",
  "<path/>",
  "<table>",
  "<td>",
  "<tr>",
  "<li>",
  "<a b='",
  '<a b="',
  "<a b=",
  "<a b",
  " c=d",
  " c='<'",
  ' c="&quot;"',
  " c='\"'",
  ' c="\'"',
  " c=&amp;",
  " c='&lt;/style>'",
  " x:y=1",
  " =z",
  ">",
];

const PARSE_OPTIONS = [
  {},
  {},
  { recognizeSelfClosing: true },
  { recognizeCDATA: true },
  { lowerCaseTags: false },
  { lowerCaseAttributeNames: false },
  { recognizeSelfClosing: true, recognizeCDATA: true },
];

const decode = (text, inAttribute) =>
  inAttribute ? decodeHTMLAttribute(text) : decodeHTML(text);

// The serializer escapes ">" in comments where it would end them early
const escapeComment = (xmlMode) => (data) =>
  data.replace(xmlMode ? /(--!?)>/g : /(^-?|--!?)>/g, "$1&gt;");

// Compares what matters. `undecoded`: text and attribute values keep what
// the serializer escaped by default (`<` and `"`). `comment`: gives the data
// of a comment as it's parsed again.
const simplify = (nodes, undecoded, comment = (data) => data) =>
  nodes
    // Empty text (like from <svg><![CDATA[]]>) isn't serialized
    .filter((node) => node.type != "text" || node.data)
    .map(({ type, name, data, attribs, children }) => {
      // XML gives <script> and <style> the type "tag"
      const simple = {
        type: type == "script" || type == "style" ? "tag" : type,
      };
      // The name of a directive depends on the mode
      if (name !== undefined && type != "directive") simple.name = name;
      if (type == "comment") simple.data = comment(data);
      else if (data !== undefined)
        simple.data =
          undecoded && type == "text" ? data.replaceAll("&lt;", "<") : data;
      if (attribs) {
        simple.attribs = {};
        for (const key in attribs) {
          simple.attribs[key] = undecoded
            ? attribs[key].replaceAll("&quot;", '"')
            : attribs[key];
        }
      }
      if (children) simple.children = simplify(children, undecoded, comment);
      return simple;
    });

// Counts of the elements and attributes in a simplified DOM
const markup = (nodes, counts = new Map()) => {
  const add = (key) => counts.set(key, (counts.get(key) || 0) + 1);
  for (const { name, attribs, children } of nodes) {
    if (name !== undefined) {
      add(`<${name}>`);
      for (const key in attribs)
        add(`<${name} ${key}=${JSON.stringify(attribs[key])}>`);
    }
    if (children) markup(children, counts);
  }
  return counts;
};

// Each gives the first DOM, the second one, and the serialized markup, or
// nothing if it doesn't apply
const PROPERTIES = {
  // HTML output of a decoded DOM
  "html-decoded"(input, options) {
    const o = { ...options, decodeEntities: decode };
    const dom = lib.parse(input, o);
    const out = lib.serialize(dom, { decodeEntities: true });
    return [
      simplify(dom, false, escapeComment(false)),
      simplify(lib.parse(out, o)),
      out,
    ];
  },
  // HTML output of an undecoded DOM
  html(input, options) {
    const dom = lib.parse(input, options);
    const out = lib.serialize(dom);
    return [
      simplify(dom, true, escapeComment(false)),
      simplify(lib.parse(out, options), true),
      out,
    ];
  },
  // HTML written with XML syntax and read back as HTML
  "html-as-xml"(input, options) {
    const dom = lib.parse(input, options);
    const out = lib.serialize(dom, { xmlMode: true });
    const o = { ...options, recognizeSelfClosing: true };
    return [
      simplify(dom, true, escapeComment(true)),
      simplify(lib.parse(out, o), true),
      out,
    ];
  },
  // XML output of a decoded HTML DOM, read as XML
  "html-to-xml-decoded"(input, options) {
    const dom = lib.parse(input, { ...options, decodeEntities: decode });
    const out = lib.serialize(dom, { xmlMode: true, decodeEntities: true });
    const o = { xmlMode: true, decodeEntities: true };
    return [
      simplify(dom, false, escapeComment(true)),
      simplify(lib.parse(out, o)),
      out,
    ];
  },
  xml(input) {
    const o = { xmlMode: true };
    const dom = lib.parse(input, o);
    const out = lib.serialize(dom, o);
    return [
      simplify(dom, true, escapeComment(true)),
      simplify(lib.parse(out, o), true),
      out,
    ];
  },
  "xml-decoded"(input) {
    const o = { xmlMode: true, decodeEntities: true };
    const dom = lib.parse(input, o);
    const out = lib.serialize(dom, o);
    return [
      simplify(dom, false, escapeComment(true)),
      simplify(lib.parse(out, o)),
      out,
    ];
  },
  // The content of <svg> or <math>, detached and written with xmlMode:
  // "foreign", read back inside the same element
  foreign(input, options) {
    const root = input.length % 2 ? "svg" : "math";
    const wrap = (html) => `<${root}>${html}</${root}>`;
    const o = { ...options, decodeEntities: decode };
    const [element] = lib.parse(wrap(input), o);
    if (element.name != root) return;
    const { children } = element;
    for (const child of children) child.parent = null;
    const out = lib.serialize(children, {
      xmlMode: "foreign",
      decodeEntities: true,
    });
    const [again] = lib.parse(wrap(out), o);
    return [
      simplify(children, false, escapeComment(false)),
      simplify(again.children),
      out,
    ];
  },
};

// Known: in XML, "<" or "</" at the end of the input is text, which is
// written raw before the end tag of <script> etc. ("<script><" gives
// "<script><</script>")
const KNOWN = /<\/?\s*$/;

const check = (property, input, options) => {
  if (property.startsWith("xml") && KNOWN.test(input)) return;
  const result = PROPERTIES[property](input, options);
  if (!result) return;
  const [first, second, out] = result;
  const a = JSON.stringify(first);
  const b = JSON.stringify(second);
  if (a == b) return;
  const before = markup(first);
  const added = [...markup(second)].filter(
    ([key, count]) => count > (before.get(key) || 0),
  );
  return {
    injection: added.length > 0,
    added: added.map(([key]) => key),
    out,
    a,
    b,
  };
};

const generated = inputs(TOKENS, Number(process.env.MAX_TOKENS) || 14);
const found = new Map();
const counts = {};
for (const tokens of generated) {
  const options = generated.pick(PARSE_OPTIONS);
  for (const property in PROPERTIES) {
    const failure = check(property, tokens.join(""), options);
    if (!failure) continue;
    const kind = `${property} ${failure.injection ? "INJECTION" : "diff"}`;
    counts[kind] = (counts[kind] || 0) + 1;
    // Keep an injection an injection while shrinking
    const input = shrink(tokens, (shorter) => {
      const f = check(property, shorter.join(""), options);
      return f && (!failure.injection || f.injection);
    }).join("");
    const key = `${kind} ${JSON.stringify(options)} ${input}`;
    if (!found.has(key))
      found.set(key, {
        kind,
        options,
        input,
        ...check(property, input, options),
      });
  }
}

// The shortest examples of each kind first
const examples = [...found.values()].sort(
  (x, y) => x.kind.localeCompare(y.kind) || x.input.length - y.input.length,
);
const shown = {};
for (const e of examples) {
  shown[e.kind] = (shown[e.kind] || 0) + 1;
  if (shown[e.kind] > (Number(process.env.PER_KIND) || 8)) continue;
  console.log(
    `${e.kind} ${JSON.stringify(e.options)} ${JSON.stringify(e.input)}`,
  );
  console.log(`  out ${JSON.stringify(e.out)}`);
  if (e.added.length) console.log(`  added ${e.added.join(" ")}`);
  console.log(`  1st ${e.a}\n  2nd ${e.b}`);
}
console.log(
  `seed ${generated.seed}, ${generated.count} inputs:`,
  counts,
  `${found.size} distinct shrunk cases`,
);
process.exitCode = found.size ? 1 : 0;
