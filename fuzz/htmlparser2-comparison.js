// Compares the DOMs of this library and of htmlparser2 12 (with the
// implied-close fixes made after 12.0.0), except for the intended differences
// listed in README.md. Used by fuzz/htmlparser2.js and test/htmlparser2.js.
const { registerHooks } = require("node:module");

// The implied-close tables of htmlparser2's development version, which this
// library follows (unreleased as of 12.0.0)
const TABLE_FIXES = [
  [
    'new Set(["thead", "tbody"])',
    'new Set(["thead", "tbody", "tfoot", "tr", "td", "th"])',
  ],
  ['["th", new Set(["th"])]', '["th", new Set(["th", "td"])]'],
  [
    '["tbody", tableSectionTags]',
    '["thead", tableSectionTags],\n    ["tbody", tableSectionTags]',
  ],
];
registerHooks({
  load(url, context, nextLoad) {
    const result = nextLoad(url, context);
    if (/\/htmlparser2\/dist\/Parser\.js$/.test(url)) {
      let source = String(result.source);
      for (const [from, to] of TABLE_FIXES) {
        if (!source.includes(from))
          throw new Error(`htmlparser2 changed: no ${from}`);
        source = source.replace(from, to);
      }
      result.source = source;
    }
    return result;
  },
});
const htmlparser2 = require("htmlparser2");
module.exports = (lib) => {
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
    "\t",
    "a",
    "b",
    "p",
    "P",
    "x",
    "1",
    "é",
    "div",
    "br",
    "script",
    "style",
    "title",
    "svg",
    "math",
    "id",
    "<![CDATA[",
    "]]>",
    "<![CDATA[x]]>",
    "<!",
    "<!>",
    "<!-->",
    "<!--->",
    "<!-x>",
    "<?",
    "<?x>",
    "?>",
    "<!DOCTYPE html>",
    "<!doctypehtml>",
    "<!doc>",
    "</ ",
    "</1",
    "<1",
    "<&",
    "</>",
    "</x>",
    "<x>",
    "<a",
    "<a>",
    "</a>",
    "<p>",
    "</p>",
    "<b>",
    "</b>",
    "<br>",
    "</br>",
    "</br/>",
    "<div>",
    "</div>",
    "</div/>",
    "<li>",
    "<h1>",
    "<h2>",
    "</h1>",
    "<form>",
    "</form>",
    "<input ",
    "<img/>",
    "<image>",
    "<script>",
    "</script>",
    "</script/>",
    "<script/>",
    "<SCRIPT>",
    "<style>",
    "</style>",
    "<style/>",
    "<title>",
    "</title>",
    "<textarea>",
    "</textarea>",
    "<xmp>",
    "</xmp>",
    "<iframe>",
    "</iframe>",
    "<noembed>",
    "<noframes>",
    "<plaintext>",
    "<svg>",
    "</svg>",
    "<svg/>",
    "<clippath>",
    "</clippath>",
    "<foreignobject>",
    "</foreignobject>",
    "<foreignObject>",
    "<math>",
    "</math>",
    "<mi>",
    "</mi>",
    "<desc>",
    "<g/>",
    "<path/>",
    "<x/>",
    "<table>",
    "<thead>",
    "<tbody>",
    "<tfoot>",
    "<tr>",
    "<td>",
    "<th>",
    "</table>",
    "&amp;",
    "a=b",
    "c=d ",
    "<a b='",
    '<a b="',
  ];

  const OPTIONS = [
    {},
    {},
    { xmlMode: true },
    { recognizeSelfClosing: true },
    { lowerCaseTags: false },
    { lowerCaseAttributeNames: false },
    { recognizeCDATA: true },
  ];

  // Terminates comments, CDATA, processing instructions, attribute values and
  // tags, so that the input doesn't end in the middle of one (where this
  // library drops what htmlparser2 partly turns into text)
  const SUFFIX = "-->]]>?>'\">";

  // `lite`: unlike htmlparser2, this library keeps the final "?" in the data
  // of an XML processing instruction
  const simplify = (nodes, lite) =>
    nodes.map(({ type, name, data, attribs, children }) => ({
      type,
      name,
      data:
        lite && type == "directive" && name[0] == "?"
          ? data.slice(0, -1)
          : data,
      attribs: attribs && { ...attribs },
      children: children && simplify(children, lite),
    }));

  // A description of how the DOMs differ, or of the error thrown, if any
  const difference = (input, options) => {
    let expected;
    let actual;
    try {
      expected = JSON.stringify(
        simplify(
          htmlparser2.parseDocument(input, {
            decodeEntities: false,
            ...options,
          }).children,
        ),
      );
      actual = JSON.stringify(simplify(lib.parse(input, options), true));
    } catch (error) {
      return `  threw ${error.stack}`;
    }
    return (
      expected != actual && `  htmlparser2 ${expected}\n  lite        ${actual}`
    );
  };

  const throws = (input, options) =>
    difference(input, options).startsWith?.("  threw");

  // Removes the markup of the intended differences (see "Differences from
  // htmlparser2 12" in README.md) from the input, which both parsers then get,
  // so that any difference left is unexpected
  const RAW_TEXT =
    /^(script|style|title|textarea|xmp|iframe|noembed|noframes)$/i;
  const withoutIntended = (input, options) => {
    // In XML, "</" followed by "/" is text
    if (options.xmlMode) return input.replace(/<\/\s*(?=\/)/g, "");
    if (options.lowerCaseTags !== false) return input;
    // The end tag that ends the text of <style> etc. closes it whatever the
    // case of the names: give such an end tag the case of the element's name,
    // where this library closes the element, and only it, with the end tag
    const closed = new Map();
    const parser = new lib.Parser(
      {
        onclosetag(name) {
          const names = closed.get(parser.startIndex) ?? [];
          closed.set(parser.startIndex, [...names, name]);
        },
      },
      options,
    );
    parser.end(input);
    let output = input;
    for (const [start, names] of [...closed].reverse()) {
      const [name] = names;
      const index = start + 2;
      const endName = input.slice(index, index + name.length);
      if (
        names.length == 1 &&
        RAW_TEXT.test(name) &&
        input.startsWith("</", start) &&
        endName != name &&
        endName.toLowerCase() == name.toLowerCase()
      ) {
        output =
          output.slice(0, index) + name + output.slice(index + name.length);
      }
    }
    return output;
  };

  const unexpectedDifference = (input, options) =>
    throws(input, options)
      ? difference(input, options)
      : difference(withoutIntended(input, options), options);

  return {
    TOKENS,
    OPTIONS,
    SUFFIX,
    difference,
    throws,
    withoutIntended,
    unexpectedDifference,
  };
};
