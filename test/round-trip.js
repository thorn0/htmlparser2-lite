// Random markup parsed, serialized and parsed again gives the same DOM
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parse, serialize } = require("../dist/htmlparser2-lite");

const TOKENS = [
  "<", ">", "/", "</", "/>", "<!--", "-->", "--!>", "!", "?", "=", '"', "'", " ", "a", "1", "&",
  "&amp;", "&lt;", "&gt;", "&quot;", "&#60;", "]]>", "<![CDATA[", "<![CDATA[<b>]]>", "<!", "<!->",
  "<!-->", "<!--->",
  "<?x>", "<!DOCTYPE html>", "</ ", "</>", "<x>", "<X>", "<x/>", "<a>", "</a>", "<p>", "<div>",
  "</div>", "<br>", "<image/>", "<u></u>", "<script>", "</script>", "<SCRIPT>", "<style>",
  "</style>", "<STYLE>", "<title>", "</title>", "<textarea>", "<xmp>", "<noscript>", "<svg>",
  "</svg>", "<math>", "<foreignObject>", "</foreignObject>", "<desc>", "</desc>", "<mi>", "</mi>",
  "<g/>", "<a b='", '<a b="', "<a b=", "<a b", " c=d", " c='<'", ' c="&quot;"', " =z", " x:y=1",
];

// Decodes what the serializer escapes, and numeric references
const decode = (text) =>
  text.replace(/&(amp|lt|gt|quot|#\d+);/g, (reference, name) =>
    name[0] == "#"
      ? String.fromCodePoint(name.slice(1))
      : { amp: "&", lt: "<", gt: ">", quot: '"' }[name],
  );

// The serializer escapes ">" in comments where it would end them early
const escapeComment = (xmlMode) => (data) =>
  data.replace(xmlMode ? /(--!?)>/g : /(^-?|--!?)>/g, "$1&gt;");

// `comment` gives the data of a comment as it's parsed again
const simplify = (nodes, undecoded, comment = (data) => data) =>
  nodes
    // Empty text (like from <svg><![CDATA[]]>) isn't serialized
    .filter(({ type, data }) => type != "text" || data)
    .map(({ type, name, data, attribs, children }) => ({
      // XML gives <script> and <style> the type "tag"
      type: type == "script" || type == "style" ? "tag" : type,
      // The name of a directive depends on the mode
      name: type == "directive" ? undefined : name,
      // Undecoded text keeps what's escaped
      data:
        type == "comment"
          ? comment(data)
          : (undecoded && data?.replaceAll("&lt;", "<")) || data,
      attribs:
        attribs &&
        Object.fromEntries(
          Object.entries(attribs).map(([key, value]) => [
            key,
            undecoded ? value.replaceAll("&quot;", '"') : value,
          ]),
        ),
      children: children && simplify(children, undecoded, comment),
    }));

// Each: [parse options, serialize options, options to parse the output with]
const decoded = { decodeEntities: decode };
const xml = { xmlMode: true };
const PROPERTIES = {
  html: [{}, {}, {}],
  "html, decoded": [decoded, { decodeEntities: true }, decoded],
  "html, recognizeSelfClosing": [
    { recognizeSelfClosing: true },
    {},
    { recognizeSelfClosing: true },
  ],
  "html, lowerCaseTags: false": [
    { lowerCaseTags: false },
    {},
    { lowerCaseTags: false },
  ],
  "html, recognizeCDATA": [{ recognizeCDATA: true }, {}, { recognizeCDATA: true }],
  // HTML written with XML syntax and read back as HTML
  "html as xml": [{}, xml, { recognizeSelfClosing: true }],
  // A decoded HTML DOM written for an XML reader
  "html to xml": [
    decoded,
    { ...xml, decodeEntities: true },
    { ...xml, decodeEntities: true },
  ],
  xml: [xml, xml, xml],
  "xml, decoded": [
    { ...xml, decodeEntities: true },
    { ...xml, decodeEntities: true },
    { ...xml, decodeEntities: true },
  ],
};

// Mulberry32
const random = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

for (const [property, [parseOptions, serializeOptions, again]] of Object.entries(
  PROPERTIES,
)) {
  test(property, () => {
    const next = random(1);
    const undecoded = !parseOptions.decodeEntities;
    for (let i = 0; i < 300; i++) {
      const length = 1 + Math.floor(next() * 20);
      let input = "";
      for (let j = 0; j < length; j++) {
        input += TOKENS[Math.floor(next() * TOKENS.length)];
      }
      // In XML, "<" or "</" at the end of the input is text, which is
      // written raw before the end tag of <script> etc.
      if (parseOptions.xmlMode && /<\/?\s*$/.test(input)) continue;
      const dom = parse(input, parseOptions);
      const output = serialize(dom, serializeOptions);
      assert.deepEqual(
        simplify(parse(output, again), undecoded),
        simplify(dom, undecoded, escapeComment(serializeOptions.xmlMode)),
        `${JSON.stringify(input)} → ${JSON.stringify(output)}`,
      );
    }
  });
}
