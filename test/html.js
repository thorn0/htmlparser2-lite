const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const htmlparser = require("../dist/htmlparser2-lite");

const { parse, serialize, Parser } = htmlparser;

const roundTrip = (html, options, serializerOptions) =>
  serialize(parse(html, options), serializerOptions);

// Compact representation of the DOM: [type, name or data, children]
const tree = (nodes) =>
  nodes.map((node) =>
    node.children
      ? [node.type, node.name, tree(node.children)]
      : [node.type, node.name ?? node.data],
  );

const events = (html, options) => {
  const log = [];
  const handler = {};
  for (const name of [
    "onopentag",
    "onclosetag",
    "ontext",
    "oncomment",
    "oncdatastart",
    "oncdataend",
    "onprocessinginstruction",
    "onend",
  ]) {
    handler[name] = (...args) =>
      log.push([name.slice(2), ...args.filter((arg) => arg !== undefined)]);
  }
  new Parser(handler, options).end(html);
  return log;
};

describe("implied end tags", () => {
  for (const [html, expected] of [
    ["<p>a<div>b</div>", "<p>a</p><div>b</div>"],
    ["<p>a<p>b", "<p>a</p><p>b</p>"],
    ["<p>a<h2>b</h2>", "<p>a</p><h2>b</h2>"],
    ["<p>a<ul><li>b</ul>", "<p>a</p><ul><li>b</li></ul>"],
    ["<ul><li>a<li>b</ul>", "<ul><li>a</li><li>b</li></ul>"],
    ["<dl><dt>a<dd>b<dt>c</dl>", "<dl><dt>a</dt><dd>b</dd><dt>c</dt></dl>"],
    [
      "<table><tr><td>a<td>b<tr><th>c</table>",
      "<table><tr><td>a</td><td>b</td></tr><tr><th>c</th></tr></table>",
    ],
    [
      "<table><thead><tr><td>a</td></tr><tbody><tr><td>b</table>",
      "<table><thead><tr><td>a</td></tr></thead><tbody><tr><td>b</td></tr></tbody></table>",
    ],
    // Closing the current element can make its parent the current one to
    // close
    [
      "<table><thead><tr><td>a<tbody><tr><td>b</table>",
      "<table><thead><tr><td>a</td></tr></thead><tbody><tr><td>b</td></tr></tbody></table>",
    ],
    // Only the current element can be closed implicitly
    ["<p><b>a<div>b", "<p><b>a<div>b</div></b></p>"],
    ["<p>a<h1>b<h2>c", "<p>a</p><h1>b</h1><h2>c</h2>"],
    ["<td>a<th>b", "<td>a</td><th>b</th>"],
    // A <form> in another one is ignored
    [
      "<form a><div><form b><input></form>c",
      "<form a><div><input></div></form>c",
    ],
    [
      "<select><option>a<option>b<optgroup><option>c</select>",
      "<select><option>a</option><option>b</option><optgroup><option>c</option></optgroup></select>",
    ],
    [
      "<ruby>a<rt>b<rp>c<rt>d</ruby>",
      "<ruby>a<rt>b</rt><rp>c</rp><rt>d</rt></ruby>",
    ],
  ]) {
    test(html, () => assert.equal(roundTrip(html), expected));
  }

  test("not in XML mode", () => {
    assert.equal(
      roundTrip("<p>a<div>b</div></p>", { xmlMode: true }),
      "<p>a<div>b</div></p>",
    );
  });

  test("tag names are case-sensitive when not lowercased", () => {
    assert.equal(
      roundTrip("<P>a<DIV>b", { lowerCaseTags: false }),
      "<P>a<DIV>b</DIV></P>",
    );
  });
});

describe("end tags", () => {
  test("close intermediate elements", () => {
    assert.equal(
      roundTrip("<div><b><i>a</div>b"),
      "<div><b><i>a</i></b></div>b",
    );
  });

  test("unmatched ones are ignored", () => {
    assert.equal(roundTrip("a</b>c"), "ac");
    assert.deepEqual(tree(parse("a</b>c")), [["text", "ac"]]);
  });

  test("</p> and </br> create elements", () => {
    assert.equal(roundTrip("a</p>b</br>"), "a<p></p>b<br>");
    assert.equal(roundTrip("a</p>b</br>", { xmlMode: true }), "ab");
  });

  test("anything after the name is ignored", () => {
    assert.equal(roundTrip("<div>a</div foo='>'>b"), "<div>a</div>'>b");
    assert.equal(roundTrip("<div>a</div/>b"), "<div>a</div>b");
  });

  test("in HTML, a comment if not starting with a letter, except </>", () => {
    assert.deepEqual(tree(parse("<div>a</ div>b</1>c</>d")), [
      [
        "tag",
        "div",
        [
          ["text", "a"],
          ["comment", " div"],
          ["text", "b"],
          ["comment", "1"],
          ["text", "cd"],
        ],
      ],
    ]);
    assert.deepEqual(
      tree(parse("<div>a</ div>b</>c</!x>", { xmlMode: true })),
      [
        ["tag", "div", [["text", "a"]]],
        ["text", "b</>c"],
      ],
    );
  });

  test("names get the case of SVG ones in SVG", () => {
    assert.equal(
      roundTrip("<svg><clippath><lineargradient/></CLIPPATH></svg>"),
      "<svg><clipPath><linearGradient/></clipPath></svg>",
    );
    assert.equal(roundTrip("<clippath></clippath>"), "<clippath></clippath>");
  });

  test("<image> is <img> outside SVG and MathML", () => {
    assert.equal(
      roundTrip("<image><svg><image/></svg>"),
      "<img><svg><image/></svg>",
    );
  });
});

describe("void and self-closing elements", () => {
  test("void elements have no children", () => {
    assert.deepEqual(tree(parse("<br>a<img src=x>b<input>")), [
      ["tag", "br", []],
      ["text", "a"],
      ["tag", "img", []],
      ["text", "b"],
      ["tag", "input", []],
    ]);
  });

  test("the slash is ignored in HTML", () => {
    assert.equal(roundTrip("<div/>a"), "<div>a</div>");
    assert.equal(roundTrip("<br/>a"), "<br>a");
  });

  test("recognizeSelfClosing", () => {
    assert.equal(
      roundTrip("<div/>a<br/>", { recognizeSelfClosing: true }),
      "<div></div>a<br>",
    );
  });

  test("foreign content", () => {
    assert.equal(
      roundTrip("<svg><path/><g/></svg><div/>a"),
      "<svg><path/><g/></svg><div>a</div>",
    );
    assert.equal(
      roundTrip("<math><mi><b/>x</mi></math>"),
      "<math><mi><b>x</b></mi></math>",
    );
  });

  test("HTML inside <foreignObject>", () => {
    assert.deepEqual(
      tree(parse("<svg><foreignobject><div/>x</foreignObject><g/>y</svg>")),
      [
        [
          "tag",
          "svg",
          [
            ["tag", "foreignObject", [["tag", "div", [["text", "x"]]]]],
            ["tag", "g", []],
            ["text", "y"],
          ],
        ],
      ],
    );
    assert.equal(
      roundTrip('<svg><foreignObject><b c=""></b></foreignObject></svg>'),
      "<svg><foreignObject><b c></b></foreignObject></svg>",
    );
    // Names are case-sensitive when not lowercased, like in htmlparser2
    assert.equal(
      roundTrip("<svg><foreignobject><b/></foreignobject></svg>", {
        lowerCaseTags: false,
      }),
      "<svg><foreignobject><b/></foreignobject></svg>",
    );
    // <foreignObject> is only in SVG
    assert.deepEqual(tree(parse("<math><foreignobject><b/>x</math>")), [
      [
        "tag",
        "math",
        [
          [
            "tag",
            "foreignobject",
            [
              ["tag", "b", []],
              ["text", "x"],
            ],
          ],
        ],
      ],
    ]);
  });

  test("the foreign context of the self-closing element itself counts", () => {
    assert.deepEqual(tree(parse("<svg/><p>x")), [
      ["tag", "svg", []],
      ["tag", "p", [["text", "x"]]],
    ]);
    assert.deepEqual(tree(parse("<svg><title/><b/>x</svg>")), [
      ["tag", "svg", [["tag", "title", [["tag", "b", [["text", "x"]]]]]]],
    ]);
    // And it ends with it
    assert.deepEqual(tree(parse("<svg/><p/>x")), [
      ["tag", "svg", []],
      ["tag", "p", [["text", "x"]]],
    ]);
  });

  test("XML mode", () => {
    assert.equal(
      roundTrip("<a/><br>x</br><b / >", { xmlMode: true }, { xmlMode: true }),
      "<a/><br>x</br><b/>",
    );
  });

  test("an unquoted attribute value takes the slash", () => {
    assert.deepEqual(
      parse("<a href=/x/>b", { recognizeSelfClosing: true })[0].attribs,
      { href: "/x/" },
    );
    assert.equal(
      roundTrip("<a href=/x/>b", { recognizeSelfClosing: true }),
      '<a href="/x/">b</a>',
    );
  });
});

describe("text-only elements", () => {
  test("script", () => {
    const html = '<script>if (a<b) x = "</div>" + "<!--";</script>c';
    assert.deepEqual(tree(parse(html)), [
      ["script", "script", [["text", 'if (a<b) x = "</div>" + "<!--";']]],
      ["text", "c"],
    ]);
    assert.equal(roundTrip(html), html);
  });

  test("style, case-insensitive end tag", () => {
    assert.deepEqual(tree(parse("<STYLE>a>b{}</sTyLe >c")), [
      ["style", "style", [["text", "a>b{}"]]],
      ["text", "c"],
    ]);
  });

  test("the end tag name ends with whitespace, / or >", () => {
    assert.deepEqual(tree(parse("<script>a</scripts>b</script/><i>")), [
      ["script", "script", [["text", "a</scripts>b"]]],
      ["tag", "i", []],
    ]);
  });

  test("the others", () => {
    for (const name of "xmp iframe noembed noframes title textarea".split(
      " ",
    )) {
      assert.deepEqual(tree(parse(`<${name}><b>&amp;</${name}>`)), [
        ["tag", name, [["text", "<b>&amp;"]]],
      ]);
    }
    assert.deepEqual(tree(parse("<plaintext>a</plaintext>b")), [
      ["tag", "plaintext", [["text", "a</plaintext>b"]]],
    ]);
  });

  test("the text of <title> and <textarea> is decoded", () => {
    const decodeEntities = (text) => text.replaceAll("&amp;", "&");
    assert.deepEqual(
      tree(parse("<title>&amp;</title><xmp>&amp;</xmp>", { decodeEntities })),
      [
        ["tag", "title", [["text", "&"]]],
        ["tag", "xmp", [["text", "&amp;"]]],
      ],
    );
  });

  test("unclosed", () => {
    assert.deepEqual(tree(parse("<script>a<b>c")), [
      ["script", "script", [["text", "a<b>c"]]],
    ]);
  });

  test("not with recognizeSelfClosing if self-closing", () => {
    assert.deepEqual(
      tree(parse("<script/><b>x</b>", { recognizeSelfClosing: true })),
      [
        ["script", "script", []],
        ["tag", "b", [["text", "x"]]],
      ],
    );
  });

  test("not in SVG and MathML", () => {
    assert.deepEqual(tree(parse("<svg><style><b/></style></svg>")), [
      ["tag", "svg", [["style", "style", [["tag", "b", []]]]]],
    ]);
    assert.deepEqual(
      tree(parse("<svg><desc><style><b/></style></desc></svg>")),
      [
        [
          "tag",
          "svg",
          [["tag", "desc", [["style", "style", [["text", "<b/>"]]]]]],
        ],
      ],
    );
  });

  test("the end tag that ends the text closes them whatever the case", () => {
    const options = { lowerCaseTags: false };
    assert.deepEqual(tree(parse("<STYLE>a</style><b>", options)), [
      ["tag", "STYLE", [["text", "a"]]],
      ["tag", "b", []],
    ]);
    // Otherwise, the comment would be inside, where it's text when parsed again
    assert.equal(
      roundTrip("<Script></SCRIPT><!--</Script><img>-->", options),
      "<Script></Script><!--</Script><img>-->",
    );
  });

  test("not in XML mode", () => {
    assert.deepEqual(
      tree(parse("<script><b>x</b></script>", { xmlMode: true })),
      [["tag", "script", [["tag", "b", [["text", "x"]]]]]],
    );
  });
});

describe("comments, CDATA, directives", () => {
  test("comments", () => {
    assert.deepEqual(tree(parse("<!----><!-- a -- b --><!-- c --!>")), [
      ["comment", ""],
      ["comment", " a -- b "],
      ["comment", " c "],
    ]);
  });

  test("<!--> and <!---> are empty comments in HTML", () => {
    assert.deepEqual(tree(parse("<!-->a<!--->b-->")), [
      ["comment", ""],
      ["text", "a"],
      ["comment", ""],
      ["text", "b-->"],
    ]);
    assert.deepEqual(tree(parse("<!-->a-->", { xmlMode: true })), [
      ["comment", ">a"],
    ]);
  });

  test("other <! and <? are comments in HTML", () => {
    assert.deepEqual(tree(parse("<!><!-a><!doc><?xml a?>")), [
      ["comment", ""],
      ["comment", "-a"],
      ["comment", "doc"],
      ["comment", "?xml a?"],
    ]);
  });

  test("CDATA is a comment in HTML", () => {
    assert.deepEqual(tree(parse("<![CDATA[a<b]]>")), [
      ["comment", "[CDATA[a<b]]"],
    ]);
  });

  test("CDATA is text in SVG and MathML", () => {
    assert.deepEqual(tree(parse("<svg>a<![CDATA[<b>]]></svg>")), [
      ["tag", "svg", [["text", "a<b>"]]],
    ]);
  });

  test("CDATA in XML", () => {
    const [cdata] = parse("<![CDATA[a<b]]>", { xmlMode: true });
    assert.deepEqual(tree([cdata]), [["cdata", undefined, [["text", "a<b"]]]]);
    assert.equal(cdata.children[0].parent, cdata);
    assert.equal(serialize(cdata), "<![CDATA[a<b]]>");
    assert.deepEqual(tree(parse("<![CDATA[x]]>", { recognizeCDATA: true })), [
      ["cdata", undefined, [["text", "x"]]],
    ]);
  });

  test("directives", () => {
    const directives = (html, options) =>
      parse(html, options).map(({ name, data }) => [name, data]);
    assert.deepEqual(directives("<!DOCTYPE html><!doctypehtml>"), [
      ["!doctype", "!DOCTYPE html"],
      ["!doctype", "!doctypehtml"],
    ]);
    assert.equal(roundTrip("<!DOCTYPE html>"), "<!DOCTYPE html>");
    assert.deepEqual(
      directives('<?xml version="1.0"?><!DOCTYPE x><?a >?>', { xmlMode: true }),
      [
        ["?xml", '?xml version="1.0"?'],
        ["!DOCTYPE", "!DOCTYPE x"],
        ["?a", "?a >?"],
      ],
    );
    const xml = '<?xml version="1.0"?><a/>';
    assert.equal(roundTrip(xml, { xmlMode: true }, { xmlMode: true }), xml);
  });
});

describe("HTML inside SVG and MathML", () => {
  for (const [root, name] of [
    ["svg", "foreignObject"],
    ["svg", "desc"],
    ["svg", "title"],
    ["math", "mi"],
    ["math", "mo"],
    ["math", "mn"],
    ["math", "ms"],
    ["math", "mtext"],
    ["math", "annotation-xml"],
  ]) {
    test(`<${name}>`, () => {
      const html = `<${root}><${name}><style><b/></style><![CDATA[x]]><i/>y<image/><u></u>`;
      assert.deepEqual(tree(parse(html)), [
        [
          "tag",
          root,
          [
            [
              "tag",
              name,
              [
                ["style", "style", [["text", "<b/>"]]],
                ["comment", "[CDATA[x]]"],
                [
                  "tag",
                  "i",
                  [
                    ["text", "y"],
                    ["tag", "img", []],
                    ["tag", "u", []],
                  ],
                ],
              ],
            ],
          ],
        ],
      ]);
      assert.equal(
        roundTrip(html),
        `<${root}><${name}><style><b/></style><!--[CDATA[x]]--><i>y<img><u></u></i></${name}></${root}>`,
      );
    });
  }
});

describe("attributes", () => {
  test("quoting and spacing", () => {
    assert.deepEqual(parse(`<a b = "1" c='2'd=3 e f=>`)[0].attribs, {
      b: "1",
      c: "2",
      d: "3",
      e: "",
      f: "",
    });
  });

  test("the first one wins", () => {
    assert.deepEqual(parse("<a b=1 B=2 b=3>")[0].attribs, { b: "1" });
    assert.deepEqual(
      parse("<a b=1 B=2 b=3>", { lowerCaseAttributeNames: false })[0].attribs,
      { b: "1", B: "2" },
    );
  });

  test("names of Object.prototype properties", () => {
    assert.deepEqual(
      { ...parse("<a constructor=1 toString=2>")[0].attribs },
      { constructor: "1", tostring: "2" },
    );
  });

  test("only ASCII whitespace separates attributes", () => {
    assert.deepEqual(parse("<a b=c d e=f>")[0].attribs, {
      b: "c d e=f",
    });
  });

  test("names starting with = aren't serialized as values", () => {
    const [a] = parse("<a b/ =c/ =d=1>");
    assert.deepEqual(a.attribs, { b: "", "=c": "", "=d": "1" });
    assert.equal(serialize(a), '<a b /=c /=d="1"></a>');
    assert.deepEqual(parse(serialize(a))[0].attribs, a.attribs);
  });

  test("quotes are escaped when serializing", () => {
    assert.equal(roundTrip(`<a b='"' c>`), '<a b="&quot;" c></a>');
    assert.equal(
      roundTrip(`<a c>`, { xmlMode: true }, { xmlMode: true }),
      '<a c=""/>',
    );
  });
});

describe("the end of the input", () => {
  for (const [html, expected] of [
    ["a<div>b<span", "a<div>b</div>"],
    ['a<div title="b', "a"],
    ["<div>a</div", "<div>a</div>"],
    ["a</br", "a"],
    ["a<!DOCTYPE html", "a"],
    ["a<!DOC", "a<!--DOC-->"],
    ["a<?xml", "a<!--?xml-->"],
    ["a<", "a&lt;"],
    ["a</", "a&lt;/"],
    ["a</ b", "a<!-- b-->"],
    ["a<!--b", "a<!--b-->"],
    // Possibly the start of "--!>"
    ["a<!--b--!", "a<!--b-->"],
    ["a<!--b-", "a<!--b-->"],
    ["a<![CDATA[b", "a<!--[CDATA[b-->"],
  ]) {
    test(JSON.stringify(html), () => assert.equal(roundTrip(html), expected));
  }

  for (const [xml, expected] of [
    ["a<?xml", "a"],
    ["a<?xml?", "a"],
    ["a<!DOCTYPE x", "a"],
    ["a<!->", "a"],
    ["a<!--b--!", "a<!--b--!-->"],
    ["a<![CDATA[b", "a<![CDATA[b]]>"],
  ]) {
    test(`${JSON.stringify(xml)} in XML`, () =>
      assert.equal(roundTrip(xml, { xmlMode: true }), expected));
  }

  test("unterminated start tag emits no events", () => {
    assert.deepEqual(events("<a><b c"), [
      ["opentag", "a", {}],
      ["closetag", "a"],
      ["end"],
    ]);
  });
});

describe("decodeEntities", () => {
  const xml = { xmlMode: true, decodeEntities: true };
  // For HTML mode without a DOM
  const decodeAmp = (text) => text.replaceAll("&amp;", "&");

  test("XML mode: XML entities and numeric references, only terminated ones", () => {
    const [a] = parse(
      '<a b="&quot;&#x41;&apos;">&lt;&amp;&#65;&#x1F600;&AMP;&amp &#0;&#xD800;&#1114112;</a>',
      xml,
    );
    assert.deepEqual(a.attribs, { b: `"A'` });
    assert.equal(a.children[0].data, "<&A😀&AMP;&amp ���");
    // Surrogates and code points past U+10FFFF aren't characters
    const codePoints = [
      0xd7ff, 0xd800, 0xdbff, 0xdc00, 0xdfff, 0xe000, 0x10ffff, 0x110000,
    ];
    const [text] = parse(
      codePoints.map((n) => `&#x${n.toString(16)};`).join(""),
      xml,
    );
    assert.equal(
      text.data,
      String.fromCodePoint(
        0xd7ff,
        0xfffd,
        0xfffd,
        0xfffd,
        0xfffd,
        0xe000,
        0x10ffff,
        0xfffd,
      ),
    );
  });

  test("HTML mode needs a DOM or a function", () => {
    assert.throws(() => parse("a", { decodeEntities: true }), /needs a DOM/);
  });

  test("a function decodes text and attribute values", () => {
    const calls = [];
    const decode = (text, inAttribute) => {
      calls.push([text, inAttribute]);
      return text.toUpperCase();
    };
    const [p] = parse(
      '<p a="&x" b="y">&t<!--&c--><![CDATA[&d]]><script>&s</script><style>&st</style><xmp>&xm</xmp>&u</p>',
      { decodeEntities: decode, recognizeCDATA: true },
    );
    assert.deepEqual(calls, [
      ["&x", true],
      ["&t", false],
      ["&u", false],
    ]);
    assert.deepEqual(p.attribs, { a: "&X", b: "y" });
    assert.deepEqual(tree(p.children), [
      ["text", "&T"],
      ["comment", "&c"],
      ["cdata", undefined, [["text", "&d"]]],
      ["script", "script", [["text", "&s"]]],
      ["style", "style", [["text", "&st"]]],
      ["tag", "xmp", [["text", "&xm"]]],
      ["text", "&U"],
    ]);
  });

  test("serialize encodes & for decoded DOMs", () => {
    const html = '<a b="&amp;lt;&quot;">&amp;lt; &lt;</a>';
    const dom = parse(html, xml);
    assert.equal(dom[0].children[0].data, "&lt; <");
    assert.equal(serialize(dom, { decodeEntities: true }), html);
  });

  test("raw text isn't decoded or encoded, except in XML", () => {
    const html = { decodeEntities: decodeAmp };
    const serialized = { decodeEntities: true };
    for (const markup of [
      "<xmp>&amp;lt;</xmp>",
      // Also inside foreign content, like when parsing
      "<svg><style>&amp;</style></svg>",
    ]) {
      assert.equal(roundTrip(markup, html, serialized), markup);
    }
    // Element names are case-insensitive
    const markup = "<SCRIPT>&amp;</SCRIPT>";
    assert.equal(
      roundTrip(markup, { ...html, lowerCaseTags: false }, serialized),
      markup,
    );
    // "foreign" output is HTML too, and HTML is back after integration points
    const foreign =
      "<svg><foreignObject><script>&amp;</script></foreignObject></svg>";
    assert.equal(
      roundTrip(
        foreign,
        { ...html, lowerCaseTags: false },
        { ...serialized, xmlMode: "foreign" },
      ),
      foreign,
    );
    assert.equal(
      roundTrip("<script>&amp;lt;</script>", xml, xml),
      "<script>&amp;lt;</script>",
    );
  });

  test("serialize: decoded < in attributes and ]]> in text are encoded", () => {
    assert.equal(
      roundTrip('<a x="&lt;">]]&gt;</a>', xml, xml),
      '<a x="&lt;">]]&gt;</a>',
    );
  });
});

describe("options", () => {
  test("lowerCaseTags", () => {
    assert.deepEqual(tree(parse("<DIV><Br></DIV>")), [
      ["tag", "div", [["tag", "br", []]]],
    ]);
    assert.deepEqual(tree(parse("<DIV></DIV>", { xmlMode: true })), [
      ["tag", "DIV", []],
    ]);
    assert.deepEqual(
      tree(parse("<DIV></DIV>", { xmlMode: true, lowerCaseTags: true })),
      [["tag", "div", []]],
    );
  });

  test("normalizeWhitespace", () => {
    assert.deepEqual(
      tree(parse("<p> a \n\t b </p>  \n", { normalizeWhitespace: true })),
      [
        ["tag", "p", [["text", " a b "]]],
        ["text", " "],
      ],
    );
  });

  test("indices: elements open at the end of the input end there", () => {
    const options = {
      xmlMode: true,
      withStartIndices: true,
      withEndIndices: true,
    };
    const [a] = parse('<a><b x="unterminated', options);
    assert.equal(a.endIndex, 20);
    assert.equal(parse("<a>text", options)[0].endIndex, 6);
  });

  test("indices: the text of CDATA", () => {
    const options = {
      xmlMode: true,
      withStartIndices: true,
      withEndIndices: true,
    };
    const [cdata] = parse("<![CDATA[xy]]>", options);
    assert.deepEqual([cdata.startIndex, cdata.endIndex], [0, 13]);
    assert.deepEqual(
      [cdata.children[0].startIndex, cdata.children[0].endIndex],
      [9, 10],
    );
  });

  test("withStartIndices and withEndIndices", () => {
    const html = "<!doctype html>a<p>b<!--c--><div>d</div>";
    const indices = (nodes) =>
      nodes.map((node) => [
        node.name ?? node.data,
        node.startIndex,
        node.endIndex,
        ...(node.children ? [indices(node.children)] : []),
      ]);
    assert.deepEqual(
      indices(parse(html, { withStartIndices: true, withEndIndices: true })),
      [
        ["!doctype", 0, 14],
        ["a", 15, 15],
        // Implicitly closed by <div>, so it ends right before it
        [
          "p",
          16,
          27,
          [
            ["b", 19, 19],
            ["c", 20, 27],
          ],
        ],
        ["div", 28, 39, [["d", 33, 33]]],
      ],
    );
  });
});

describe("Parser", () => {
  test("events", () => {
    assert.deepEqual(events("<a href=x>b</a><br><!--c-->"), [
      ["opentag", "a", { href: "x" }],
      ["text", "b"],
      ["closetag", "a"],
      ["opentag", "br", {}],
      ["closetag", "br"],
      ["comment", "c"],
      ["end"],
    ]);
  });

  test("callbacks get exactly the arguments of the event", () => {
    const calls = [];
    const handler = {};
    for (const name of [
      "onopentag",
      "onclosetag",
      "ontext",
      "oncomment",
      "oncdatastart",
      "oncdataend",
      "onprocessinginstruction",
      "onend",
    ]) {
      handler[name] = (...args) => calls.push([name, args.length]);
    }
    new Parser(handler, { xmlMode: true }).end(
      "<a>t</a><!--c--><![CDATA[d]]><?pi?>",
    );
    assert.deepEqual(calls, [
      ["onopentag", 2],
      ["ontext", 1],
      ["onclosetag", 1],
      ["oncomment", 1],
      ["oncdatastart", 0],
      ["ontext", 1],
      ["oncdataend", 0],
      ["onprocessinginstruction", 2],
      ["onend", 0],
    ]);
  });

  test("callbacks are called on the handler", () => {
    const handler = {
      texts: [],
      ontext(text) {
        this.texts.push(text);
      },
    };
    new Parser(handler).end("a<b>c");
    assert.deepEqual(handler.texts, ["a", "c"]);
  });

  test("reentrancy", () => {
    const texts = [];
    new Parser({
      ontext(text) {
        texts.push(text, serialize(parse(`<i>${text}</i>`)));
      },
    }).end("a<b>c</b>d");
    assert.deepEqual(texts, [
      "a",
      "<i>a</i>",
      "c",
      "<i>c</i>",
      "d",
      "<i>d</i>",
    ]);
  });

  test("reentrancy in the middle of a tag and of raw text", () => {
    // Parses markup like the one being parsed, in the middle of it
    const parseMore = (text) => {
      parse(`<x a=1 b='2'><script>a</script></x>`);
      parse(`<x a="1" c>`, { xmlMode: true });
      return text;
    };
    const html =
      '<a x="&1" y="&2" z=3><script>a</b></script><b c="&3">d</b></a>';
    const dom = parse(html, { decodeEntities: parseMore });
    assert.deepEqual(dom[0].attribs, { x: "&1", y: "&2", z: "3" });
    assert.equal(serialize(dom), roundTrip(html));
    const texts = [];
    const parser = new Parser({
      ontext(text) {
        texts.push(parseMore(text));
        // Also with the same parser
        if (text == "b") parser.end("<i>x</i>");
      },
    });
    parser.end("a<b c=1>b<script>c</d></script>e</b>");
    assert.deepEqual(texts, ["a", "b", "x", "c</d>", "e"]);
  });

  test("each end call parses its input separately", () => {
    const log = [];
    const parser = new Parser({
      onopentag: (name) => log.push(name),
      onclosetag: (name) => log.push(`/${name}`),
      onend: () => log.push("end"),
    });
    parser.end("<a>");
    parser.end("<b>");
    assert.deepEqual(log, ["a", "/a", "end", "b", "/b", "end"]);
  });

  test("indices of implicit closes and of the end of the input", () => {
    const log = [];
    const parser = new Parser({
      onclosetag: (name) =>
        log.push([name, parser.startIndex, parser.endIndex]),
      onend: () => log.push(["end", parser.startIndex, parser.endIndex]),
    });
    parser.end("<p>a<div>b");
    parser.end("");
    assert.deepEqual(log, [
      // The empty range right before the tag that closes it
      ["p", 4, 3],
      // The end of the input: its length, and one less
      ["div", 10, 9],
      ["end", 10, 9],
      ["end", 0, -1],
    ]);
  });

  test("text comes in one event up to the next markup", () => {
    assert.deepEqual(events("a < b <1 c</ d>e<svg>f<![CDATA[g]]>h"), [
      ["text", "a < b <1 c"],
      ["comment", " d"],
      ["text", "e"],
      ["opentag", "svg", {}],
      ["text", "f"],
      ["text", "g"],
      ["text", "h"],
      ["closetag", "svg"],
      ["end"],
    ]);
  });
});

describe("linear time", () => {
  // Quadratic implementations take many seconds for these
  const fast = (name, f) =>
    test(name, () => {
      const start = performance.now();
      f(100000);
      assert.ok(performance.now() - start < 1000);
    });

  // Deeply nested elements (<div>, unlike e.g. <a> or <p>, isn't closed by
  // the same start tag)
  const nested = (n) => "<div>".repeat(n);

  test("the nested elements are nested", () => {
    assert.equal(roundTrip(nested(10)), nested(10) + "</div>".repeat(10));
  });

  for (const chunk of [
    "<!",
    "<?",
    "</a",
    "<a b",
    "<!--",
    "</ ",
    "<a b='",
    "< ",
  ]) {
    fast(`parse(${JSON.stringify(chunk)} * n)`, (n) => parse(chunk.repeat(n)));
  }
  fast("unmatched end tags in deeply nested elements", (n) =>
    parse(nested(n) + "</x>".repeat(n)),
  );
  fast("deeply nested elements with SVG names outside SVG", (n) =>
    parse("<clippath>".repeat(n) + "</clippath>".repeat(n)),
  );
  fast("normalizeWhitespace, text split by ignored end tags", (n) =>
    parse("a </x>".repeat(n), { normalizeWhitespace: true }),
  );
  fast("remove(many nodes, dom)", (n) => {
    const dom = parse("<a></a><b></b>".repeat(n / 2));
    htmlparser.remove(htmlparser.findAll("a", dom), dom);
  });
  fast("remove(every other child)", (n) => {
    const dom = parse("<p>" + "<a></a><b></b>".repeat(n / 2));
    htmlparser.remove(htmlparser.findAll("a", dom));
  });
  fast("create(name, all children of an element)", (n) => {
    const [p] = parse("<p>" + "<a></a>".repeat(n));
    htmlparser.create("div", p.children);
  });
  fast("create(name, nested arrays)", (n) =>
    htmlparser.create(
      "div",
      Array.from({ length: n }, () => ["x"]),
    ),
  );
  fast("create(name, huge array)", (n) =>
    htmlparser.create(
      "div",
      Array.from({ length: n * 4 }, () => "x"),
    ),
  );
  fast("serialize(deeply nested elements)", (n) => serialize(parse(nested(n))));
  fast("serialize(a long name, many text children to escape)", (n) =>
    serialize(parse(`<${"x".repeat(n)}>` + "<1<!---->".repeat(n))),
  );
  fast("serialize(many nodes deep in the DOM with different parents)", (n) => {
    const dom = parse(nested(n / 2) + "<b><i></i></b>".repeat(n / 2));
    serialize(htmlparser.findAll("i", dom));
  });
});

test("normalizeWhitespace across text split by ignored end tags", () => {
  assert.deepEqual(
    tree(parse("a </x> b</x>  \n</x>c </x>", { normalizeWhitespace: true })),
    [["text", "a b c "]],
  );
});

describe("serialize", () => {
  test("foreign elements", () => {
    assert.equal(
      roundTrip("<svg><path></path><desc><div></div></desc></svg>"),
      "<svg><path/><desc><div></div></desc></svg>",
    );
    assert.equal(
      roundTrip("<svg><foreignObject><div></div></foreignObject></svg>", {
        lowerCaseTags: false,
      }),
      "<svg><foreignObject><div></div></foreignObject></svg>",
    );
  });

  test("elements with HTML content aren't self-closing", () => {
    assert.equal(
      roundTrip(
        "<svg><desc></desc><foreignObject></foreignObject><g></g></svg><math><mi></mi></math>",
      ),
      "<svg><desc></desc><foreignObject></foreignObject><g/></svg><math><mi></mi></math>",
    );
    // Otherwise, the elements after them would be in them when parsed again
    const html =
      "<svg><title></title><style><!--</style><img>--></style></svg>";
    assert.equal(roundTrip(html), html);
    // In XML, they are
    assert.equal(
      roundTrip("<svg><desc></desc></svg>", {}, { xmlMode: true }),
      "<svg><desc/></svg>",
    );
  });

  test("comments that would end early", () => {
    // In HTML, CDATA is a comment till "]]>", so it can contain "-->"
    assert.equal(
      roundTrip("<![CDATA[--><img src=x onerror=alert(1)>]]>"),
      "<!--[CDATA[--&gt;<img src=x onerror=alert(1)>]]-->",
    );
    const serialized = serialize(
      [">", "->", "a--!>b-->"].map((data) => ({ type: "comment", data })),
    );
    assert.equal(serialized, "<!--&gt;--><!---&gt;--><!--a--!&gt;b--&gt;-->");
    assert.deepEqual(tree(parse(serialized)), [
      ["comment", "&gt;"],
      ["comment", "-&gt;"],
      ["comment", "a--!&gt;b--&gt;"],
    ]);
    // In XML, "<!-->" doesn't end a comment
    const xml = { xmlMode: true };
    assert.equal(roundTrip("<!-->--><!--->-->", xml, xml), "<!-->--><!--->-->");
  });

  test("text in raw text elements isn't escaped", () => {
    const { create } = htmlparser;
    assert.equal(
      serialize([create("xmp", "a<b"), create("div", "a<b")]),
      "<xmp>a<b</xmp><div>a&lt;b</div>",
    );
    assert.equal(roundTrip("<style>a<b</style>"), "<style>a<b</style>");
  });

  test("undecoded raw text isn't escaped in XML output either", () => {
    // Like with htmlparser2-20kb, e.g. for HTML with self-closing tags
    const markup =
      '<div><script>if (a<b) f("</p>")</script><x a="1"/>1 &lt; 2</div>';
    assert.equal(
      roundTrip(markup, { recognizeSelfClosing: true }, { xmlMode: true }),
      markup,
    );
  });

  test("text is escaped in SVG and MathML, where it isn't raw", () => {
    // CDATA is text there
    const html =
      "<svg><style><![CDATA[</style><script>alert(1)</script>]]></style></svg>";
    const options = { recognizeSelfClosing: true };
    const escaped =
      "<svg><style>&lt;/style>&lt;script>alert(1)&lt;/script></style></svg>";
    for (const xmlMode of [false, true]) {
      assert.equal(roundTrip(html, options, { xmlMode }), escaped);
    }
    assert.equal(htmlparser.findOne("script", parse(escaped, options)), null);
    // HTML inside elements like <foreignObject>
    const foreign = "<svg><desc><script>a<b</script></desc></svg>";
    assert.equal(roundTrip(foreign, options, { xmlMode: true }), foreign);
  });

  test("parts of a DOM are written like in the whole DOM", () => {
    const dom = parse(
      "<svg><g><style><![CDATA[a<b]]></style><circle r=1></circle></g>" +
        "<desc><script>a<b</script><br></desc></svg>",
    );
    const { findOne } = htmlparser;
    const [svg] = dom;
    for (const xmlMode of [false, true]) {
      assert.equal(
        serialize(svg.children[0].children, { xmlMode }),
        '<style>a&lt;b</style><circle r="1"/>',
      );
      assert.equal(
        serialize(findOne("script", dom), { xmlMode }),
        "<script>a<b</script>",
      );
    }
    assert.equal(serialize(findOne("br", dom)), "<br>");
    assert.equal(serialize(findOne("br", dom), { xmlMode: "foreign" }), "<br>");
  });

  test("single node", () => {
    const [div] = parse("<div>a</div>");
    assert.equal(serialize(div), "<div>a</div>");
  });

  test("<noscript> text is escaped, <SCRIPT> text isn't, root nodes are ignored", () => {
    const { create } = htmlparser;
    assert.equal(
      serialize([create("noscript", "a<b"), create("SCRIPT", "a<b")]),
      "<noscript>a&lt;b</noscript><SCRIPT>a<b</SCRIPT>",
    );
    assert.equal(serialize({ type: "root", children: parse("<a>") }), "");
  });
});

describe("DOM utilities", () => {
  test("filterNodes", () => {
    const dom = parse("<a>1<b>2</b></a><c>3</c>");
    const isText = (node) => node.type === "text";
    assert.deepEqual(
      htmlparser.filterNodes(isText, dom).map((node) => node.data),
      ["1", "2", "3"],
    );
    assert.deepEqual(
      htmlparser.filterNodes(isText, dom, 2).map((node) => node.data),
      ["1", "2"],
    );
    assert.deepEqual(
      htmlparser.filterNodes(isText, dom[0]).map((node) => node.data),
      ["1", "2"],
    );
  });

  test("findOne and findAll skip non-tags", () => {
    const dom = parse("<a><!--b--><b>x</b></a><b></b>", { xmlMode: true });
    assert.equal(htmlparser.findOne("c", dom), null);
    assert.equal(htmlparser.findAll("b", dom).length, 2);
    assert.equal(
      htmlparser.findOne((el) => el.name === "b", dom),
      dom[0].children[1],
    );
  });

  test("append and prepend", () => {
    const dom = parse("<p><a></a><c></c></p>");
    const [a, c] = dom[0].children;
    htmlparser.append(a, htmlparser.create("b"));
    htmlparser.prepend(a, htmlparser.create("x"));
    htmlparser.append(c, htmlparser.create("d"));
    assert.equal(serialize(dom), "<p><x></x><a></a><b></b><c></c><d></d></p>");
    const children = dom[0].children;
    children.forEach((child, i) => {
      assert.equal(child.parent, dom[0]);
      assert.equal(child.prev, children[i - 1] || null);
      assert.equal(child.next ?? null, children[i + 1] || null);
    });
  });

  test("remove many nodes from different lists", () => {
    const dom = parse("<a></a><p><b></b><c></c><d></d><e></e></p><f></f>");
    const [a, p] = dom;
    const [b, c, d, e] = p.children;
    htmlparser.remove([[c, a], d, e], dom);
    assert.equal(serialize(dom), "<p><b></b></p><f></f>");
    assert.deepEqual(p.children, [b]);
    assert.equal(b.next, null);
    assert.equal(p.prev, null);
  });

  test("create moves nodes, keeping the donors consistent", () => {
    const [p, q] = parse("<p><a></a><b></b><c></c><d></d></p><q><e></e></q>");
    const [a, b, c, d] = p.children;
    const div = htmlparser.create("div", [d, [b, q.children]]);
    assert.equal(serialize(div), "<div><d></d><b></b><e></e></div>");
    assert.deepEqual(p.children, [a, c]);
    assert.equal(a.next, c);
    assert.equal(c.prev, a);
    assert.equal(c.next, null);
    assert.deepEqual(q.children, []);
    div.children.forEach((child, i) => {
      assert.equal(child.parent, div);
      assert.equal(child.prev, div.children[i - 1] || null);
      assert.equal(child.next, div.children[i + 1] || null);
    });
  });

  test("removing a node twice doesn't break its former siblings", () => {
    const dom = parse("<p><a></a><b></b><c></c></p>");
    const [, b] = dom[0].children;
    htmlparser.remove(b);
    htmlparser.remove(b);
    assert.equal(serialize(dom), "<p><a></a><c></c></p>");
  });

  test("the array of top-level nodes changes only where it's passed", () => {
    const html = "<a></a><b></b>";
    // create and append don't get it: remove the nodes from it first
    let dom = parse(html);
    htmlparser.create("div", dom[1]);
    assert.equal(dom.length, 2);
    dom = parse(html);
    const [a, b] = dom;
    htmlparser.remove(b, dom);
    const div = htmlparser.create("div", b);
    assert.deepEqual(dom, [a]);
    assert.equal(b.parent, div);
    htmlparser.append(a, div);
    assert.deepEqual(dom, [a]);
    assert.equal(a.next, div);
    // appendChild and prependChild move a child from where it is only with it
    dom = parse(html);
    htmlparser.appendChild(dom[0], dom[1]);
    assert.equal(serialize(dom), "<a><b></b></a><b></b>");
    dom = parse(html);
    htmlparser.prependChild(dom[0], dom[1], dom);
    assert.equal(serialize(dom), "<a><b></b></a>");
  });
});
