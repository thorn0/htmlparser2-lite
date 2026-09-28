const words = (str) => new Set(str.split(" "));

const VOID_ELEMENTS = words(
  "area base basefont br col command embed frame hr img input isindex keygen link meta param source track wbr",
);
// "svg" and "math" for the elements whose content is SVG and MathML, false
// for the elements in those whose content is HTML
const FOREIGN_CONTEXTS = new Map(
  "svg math mi mo mn ms mtext annotation-xml foreignObject desc title"
    .split(" ")
    .map((name, i) => [name, i < 2 && name]),
);

// The case of SVG tag names, which are lowercased with the other ones
const SVG_TAG_NAMES = new Map(
  (
    "altGlyph altGlyphDef altGlyphItem animateColor animateMotion animateTransform clipPath foreignObject glyphRef linearGradient radialGradient textPath" +
    " Blend ColorMatrix ComponentTransfer Composite ConvolveMatrix DiffuseLighting DisplacementMap DistantLight DropShadow Flood FuncA FuncB FuncG FuncR GaussianBlur Image Merge MergeNode Morphology Offset PointLight SpecularLighting SpotLight Tile Turbulence".replaceAll(
      " ",
      " fe",
    )
  )
    .split(" ")
    .map((name) => [name.toLowerCase(), name]),
);

// The content of these elements is text in HTML (outside SVG and MathML), till
// their end tag: 1 for RCDATA, 2 for raw text, which isn't decoded when
// parsing nor escaped when serializing, 3 for raw text till the end of the
// input. Names are compared lowercased.
const TEXT_ONLY = new Map(
  "title textarea script style xmp iframe noembed noframes plaintext"
    .split(" ")
    .map((name, i) => [name, i < 2 ? 1 : i < 8 ? 2 : 3]),
);

// Opening an element implicitly closes the current element if it's one of
// the elements mapped to it
const IMPLIED_CLOSE = new Map(
  [
    "tr/tr th td",
    "th/th td",
    "td/thead th td",
    "body/head link script",
    "a/a",
    "li/li",
    "p address article aside blockquote details div dl fieldset figcaption figure footer form header hr main nav ol pre section table ul/p",
    "h1 h2 h3 h4 h5 h6/h1 h2 h3 h4 h5 h6 p",
    "select input output button datalist textarea/input option optgroup select button datalist textarea",
    "option/option",
    "optgroup/optgroup option",
    "dd dt/dd dt",
    "rt rp/rt rp",
    "thead tbody tfoot/thead tbody tfoot tr td th",
  ].flatMap((rule) => {
    const [opened, closed] = rule.split("/");
    const closedSet = words(closed);
    return opened.split(" ").map((name) => [name, closedSet]);
  }),
);

// In markup, only ASCII whitespace counts as whitespace. In the regular
// expression sources given to this, a space (always inside brackets) stands
// for it.
const htmlRegExp = (source, flags) =>
  RegExp(source.replaceAll(" ", "\t\n\f\r "), flags);

// The regular expressions below are shared by all parses: their lastIndex is
// set right before each use and read right after, before any callback, which
// can start another parse.

// The tokens in HTML and in XML, with two regular expressions for each, so
// that the most common tokens get small results. Tag names start with a
// letter in HTML, and with almost anything in XML (in start tags, not with "!"
// and "?", which start other markup).
//
// The first one finds the start and end tags, and the places where other
// tokens can be: "<" followed by "!", "?" or "/". Groups: 1 start tag name, 2
// what's before ">" if the tag ends right after its name (then the attribute
// regex isn't needed), 3 end tag name.
//
// The second one matches the other tokens there. Groups (the end groups are ""
// at the end of the input): 1 bogus comment after "</" (HTML), 2 comment, 3
// its end ("-?>" right after "<!--" in HTML), 4 CDATA, 5 its end, 6 after
// "<!", 7 its end, 8 after "<?", 9 its end (XML). The first group of each
// alternative is always there.
const TOKENS = [false, true].map((xmlMode) => {
  const htmlOnly = xmlMode ? "(?!)" : "";
  return [
    htmlRegExp(
      `<(?:(${xmlMode ? "[^ />!?]" : "[a-zA-Z]"}[^ />]*)(?:([ /]*)>)?|/${xmlMode ? "[ ]*" : ""}(${xmlMode ? "[^ />]" : "[a-zA-Z]"}[^ />]*)[^>]*>?|(?=[!?/]))`,
      "g",
    ),
    htmlRegExp(
      `<(?:${htmlOnly}/(?=[^])([^>]*)>?|!--(.*?)(--!?>|${htmlOnly}(?<=!--)-?>|$)|!\\[CDATA\\[(.*?)(]]>|$)|!(${xmlMode ? "-?>?" : ""}[^>]*)(>?)|\\?${xmlMode ? "(.*?)(\\?>|$)" : "([^>]*)()>?"})`,
      "ys",
    ),
  ];
});

// An attribute or the end of a start tag. Groups: 1 what's before ">" at the
// end, 2 name, 3-5 value (in double quotes, in single quotes, unquoted), 6
// what's before ">" if the tag ends right after the attribute.
const ATTRIBUTE = htmlRegExp(
  `([ /]*)(?:>|([^ />][^ />=]*)(?:[ ]*=[ ]*(?:"([^"]*)"|'([^']*)'|(?!["' ])([^ >]*))|(?![ ]*=))(?:([ /]*)>)?)`,
  "y",
);

// The end tags of the elements with text content (unused for <plaintext>,
// which has none)
const TEXT_END_TAGS = new Map(
  [...TEXT_ONLY.keys()].map((name) => [name, htmlRegExp(`</${name}[ />]`, "gi")]),
);

const tagType = (name) =>
  name == "script" || name == "style" ? name : "tag";

const isTag = ({ type }) => type == "tag" || type == "script" || type == "style";

const lowerCase = (str, enabled) => (enabled ? str.toLowerCase() : str);

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };

// Checking first is much faster: most strings have nothing to replace, and
// replaceAll is slow even when it finds nothing
const escape = (str, chars) => {
  for (let i = 0; i < chars.length; i++) {
    const char = chars[i];
    if (str.includes(char)) str = str.replaceAll(char, ESCAPES[char]);
  }
  return str;
};

const XML_ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

// Only references terminated with ";" are decoded in XML
const decodeXML = (text) =>
  text.replace(
    /&(?:#(\d+|[xX][\da-fA-F]+)|(amp|lt|gt|quot|apos));/g,
    (reference, number, name) => {
      if (name) return XML_ENTITIES[name];
      // Number() parses "0x..." as hexadecimal and "0..." as decimal
      const codePoint = +`0${number}`;
      // `>> 11 == 27`: surrogates (0xd800 to 0xdfff)
      return !codePoint || codePoint > 0x10ffff || codePoint >> 11 == 27
        ? "�"
        : String.fromCodePoint(codePoint);
    },
  );

// An element in an inert document (nothing is loaded or run in it). It's
// used only synchronously, so it can be shared.
let element;

// Decodes HTML character references with the browser's own parser, so that
// its table of named references doesn't need to be bundled. Each reference is
// decoded separately, in text or in an attribute (where they're decoded
// differently depending on the next character, hence the optional "="). The
// references contain only [&#\w;=] characters, so no markup can get in.
const createBrowserDecoder = () => {
  if (!globalThis.document) {
    throw Error("decodeEntities: true needs a DOM, pass a function");
  }
  element ??= document.implementation.createHTMLDocument().createElement("div");
  const decodeReference = (reference, inAttribute) => {
    element.innerHTML = inAttribute ? `<a title="${reference}">` : reference;
    return inAttribute ? element.firstChild.title : element.textContent;
  };
  // Keys start with "true" or "false", so a plain object is safe
  const cache = {};
  return (text, inAttribute) =>
    text.replace(
      /&[#\w]+;?=?/g,
      (reference) =>
        (cache[inAttribute + reference] ??= decodeReference(
          reference,
          inAttribute,
        )),
    );
};

// A call of Parser#end: its state and the operations on it. Each call has its
// own, so that callbacks can start other parses, with the same Parser too.
// Underscored properties are internal, the build shortens their names. Some
// methods use `state` for `this`, which is shorter when minified.
class Parse {
  constructor(parser, handler, options) {
    const state = this;
    const { xmlMode, decodeEntities } = options;
    state._parser = parser;
    // Callbacks are optional, the handler too
    state._handler = handler ?? {};
    state._xmlMode = xmlMode;
    state._lowerCaseTags = options.lowerCaseTags ?? !xmlMode;
    state._decode =
      typeof decodeEntities == "function"
        ? decodeEntities
        : decodeEntities && (xmlMode ? decodeXML : createBrowserDecoder());
    state._stack = [];
    // Numbers of open elements by name, so that end tags matching no open
    // element don't search the stack
    state._openCounts = { __proto__: null };
    // The foreign contexts of the ancestors of the current element's
    // content. Its own, _foreignContext ("svg", "math", false for HTML inside
    // those, undefined outside), is set with the first element.
    state._foreignContexts = [];
  }

  _decoded(text, inAttribute) {
    const decode = this._decode;
    return decode && text.includes("&") ? decode(text, inAttribute) : text;
  }

  _setPosition(start, end) {
    const parser = this._parser;
    parser.startIndex = start;
    parser.endIndex = end;
  }

  _pop() {
    const state = this;
    const name = state._stack.pop();
    state._openCounts[name]--;
    state._foreignContext = state._foreignContexts.pop();
    state._handler.onclosetag?.(name);
  }

  // Lowercases the name (if enabled) and, in HTML, restores the case of SVG
  // names (in SVG, or when closing an open element, which can only be in
  // <svg>) and renames <image> to <img> (outside SVG and MathML)
  _tagName(name) {
    const state = this;
    const lowerCaseTags = state._lowerCaseTags;
    name = lowerCase(name, lowerCaseTags);
    if (state._xmlMode || !lowerCaseTags) return name;
    const foreignContext = state._foreignContext;
    if (foreignContext != null) {
      const svgName = SVG_TAG_NAMES.get(name);
      if (foreignContext == "svg" || (svgName && state._openCounts[svgName])) {
        return svgName ?? name;
      }
    }
    return !foreignContext && name == "image" ? "img" : name;
  }

  _openTag(name, attribs) {
    const state = this;
    const isVoid = !state._xmlMode && VOID_ELEMENTS.has(name);
    if (!isVoid) {
      const openCounts = state._openCounts;
      state._stack.push(name);
      openCounts[name] = (openCounts[name] | 0) + 1;
      state._foreignContexts.push(state._foreignContext);
      state._foreignContext =
        FOREIGN_CONTEXTS.get(name) ?? state._foreignContext;
    }
    state._handler.onopentag?.(name, attribs);
    if (isVoid) state._handler.onclosetag?.(name);
  }

  _closeCurrentTag(name) {
    if (this._stack.at(-1) == name) this._pop();
  }

  _closeTag(name) {
    const state = this;
    const stack = state._stack;
    const index = state._openCounts[name] ? stack.lastIndexOf(name) : -1;
    if (index >= 0) {
      while (stack.length > index) state._pop();
    } else if (!state._xmlMode && (name == "p" || name == "br")) {
      state._openTag(name, {});
      state._closeCurrentTag(name);
    }
  }

  _comment(data) {
    this._handler.oncomment?.(data);
  }

  // The name is the first word in XML, and "doctype" in HTML (the only
  // declaration there)
  _instruction(prefix, value, data) {
    this._handler.onprocessinginstruction?.(
      prefix +
        lowerCase(
          this._xmlMode ? value.split(/[\s/]/)[0] : value.slice(0, 7),
          this._lowerCaseTags,
        ),
      prefix + data,
    );
  }

  // The text of the input from `start` to `end`, `raw` if it isn't decoded
  _text(input, start, end, raw) {
    if (end > start) {
      this._setPosition(start, end - 1);
      const text = input.slice(start, end);
      this._handler.ontext?.(raw ? text : this._decoded(text, false));
    }
  }

  _run(input, options) {
    const state = this;
    const handler = state._handler;
    const xmlMode = state._xmlMode;
    const lowerCaseTags = state._lowerCaseTags;
    const { recognizeSelfClosing, recognizeCDATA } = options;
    const lowerCaseAttributeNames = options.lowerCaseAttributeNames ?? !xmlMode;
    const stack = state._stack;
    const [TAG, OTHER_TOKEN] = TOKENS[xmlMode ? 1 : 0];

    // The start of the text not emitted yet
    let index = 0;
    let start;
    let match;

    for (;;) {
      // The next tag, or other token after "<!", "<?" or "</"
      let other;
      TAG.lastIndex = index;
      while ((match = TAG.exec(input)) && !match[1] && !match[3]) {
        OTHER_TOKEN.lastIndex = match.index;
        if ((other = OTHER_TOKEN.exec(input))) break;
        // Not a token, the "<" is text
        TAG.lastIndex = match.index + 1;
      }
      const tokenEnd = other ? OTHER_TOKEN.lastIndex : TAG.lastIndex;
      start = match?.index ?? input.length;
      state._text(input, index, start);
      if (!match) break;
      index = tokenEnd;
      state._setPosition(start, index - 1);

      const [, startTag, startTagEnd, endTag] = match;

      if (endTag) {
        // Drop an unterminated end tag, it can only be at the end of the
        // input
        if (input[index - 1] == ">") state._closeTag(state._tagName(endTag));
        continue;
      }

      if (!startTag) {
        const [
          ,
          bogusEndTag,
          comment,
          commentEnd,
          cdata,
          cdataEnd,
          declaration,
          declarationEnd,
          instruction,
          instructionEnd,
        ] = other;

        if (comment != null) {
          // A partial "--!>" at the end of the input isn't part of an HTML
          // comment
          state._comment(
            commentEnd || xmlMode ? comment : comment.replace(/-(-!?)?$/, ""),
          );
        } else if (cdata != null) {
          if (xmlMode || (cdataEnd && recognizeCDATA)) {
            if (cdataEnd || cdata) {
              handler.oncdatastart?.();
              // The text is after "<![CDATA["
              state._setPosition(start + 9, start + 8 + cdata.length);
              handler.ontext?.(cdata);
              state._setPosition(start, index - 1);
              handler.oncdataend?.();
            }
          } else if (cdataEnd && state._foreignContext) {
            handler.ontext?.(cdata);
          } else {
            state._comment(`[CDATA[${cdata}${cdataEnd && "]]"}`);
          }
        } else if (bogusEndTag != null) {
          // "</>" is ignored
          if (bogusEndTag) state._comment(bogusEndTag);
        } else if (instruction != null) {
          if (!xmlMode) {
            state._comment(`?${instruction}`);
          } else if (instructionEnd) {
            // Unlike in htmlparser2, the data ends with "?", so that it's
            // serialized back as it was
            state._instruction("?", instruction, `${instruction}?`);
          }
        } else if (!xmlMode && !/^doctype/i.test(declaration)) {
          // A declaration: in HTML, anything but DOCTYPE is a comment
          state._comment(declaration);
        } else if (declarationEnd) {
          state._instruction("!", declaration, declaration);
        }
        continue;
      }

      const name = state._tagName(startTag);
      // Text-only names aren't changed by _tagName, except for lowercasing
      const textOnlyName = lowerCase(name, !lowerCaseTags);
      const textOnly =
        !xmlMode && !state._foreignContext && TEXT_ONLY.get(textOnlyName);
      const attribs = {};

      // The whitespace and slashes before ">", once the tag ends
      let beforeEnd = startTagEnd;
      while (beforeEnd == null) {
        ATTRIBUTE.lastIndex = index;
        match = ATTRIBUTE.exec(input);
        if (!match) break;
        index = ATTRIBUTE.lastIndex;
        const [, before, rawKey, doubleQuoted, singleQuoted, unquoted, after] =
          match;
        if (rawKey) {
          const key = lowerCase(rawKey, lowerCaseAttributeNames);
          if (!Object.hasOwn(attribs, key)) {
            attribs[key] = state._decoded(
              doubleQuoted ?? singleQuoted ?? unquoted ?? "",
              true,
            );
          }
        }
        beforeEnd = rawKey ? after : before;
      }
      // Unterminated tag at the end of the input, drop it
      if (beforeEnd == null) break;

      // A <form> in another one is ignored
      if (!xmlMode && name == "form" && state._openCounts.form) continue;
      if (!xmlMode) {
        // Elements closed implicitly by this tag end right before it
        state._setPosition(start, start - 1);
        while (IMPLIED_CLOSE.get(name)?.has(stack.at(-1))) state._pop();
      }
      state._setPosition(start, index - 1);

      state._openTag(name, attribs);

      // Only whitespace and slashes can be before ">", so if there is a
      // slash, it's the last non-whitespace character. The foreign context of
      // the element itself applies (`<svg/>` is self-closing), hence this
      // check comes after _openTag.
      const selfClosing = beforeEnd.includes("/");
      if (
        selfClosing &&
        (xmlMode || recognizeSelfClosing || state._foreignContext)
      ) {
        state._closeCurrentTag(name);
      }

      if (textOnly && !(selfClosing && recognizeSelfClosing)) {
        start = input.length;
        if (textOnly < 3) {
          const endTagRegExp = TEXT_END_TAGS.get(textOnlyName);
          endTagRegExp.lastIndex = index;
          start = endTagRegExp.exec(input)?.index ?? start;
        }
        state._text(input, index, start, textOnly > 1);
        index = start;
      }
    }

    // Elements still open end at the end of the input
    state._setPosition(input.length, input.length - 1);
    while (stack.length) state._pop();
    handler.onend?.();
  }
}

function Parser(handler, options = {}) {
  this.startIndex = this.endIndex = 0;
  this.end = (input = "") =>
    new Parse(this, handler, options)._run(input, options);
}

// Nodes are created with all their properties, so that they share shapes
// (except for the indices added with withStartIndices and withEndIndices)
const elementNode = (type, name, attribs, children) => ({
  type,
  name,
  attribs,
  children,
  parent: null,
  prev: null,
  next: null,
});

const dataNode = (type, data) => ({
  type,
  data,
  parent: null,
  prev: null,
  next: null,
});

// The handler of the parse in `parse`, which builds the DOM. It's also where
// the parse writes the positions.
class DomBuilder {
  constructor(options) {
    const builder = this;
    builder.startIndex = builder.endIndex = 0;
    builder._xmlMode = options.xmlMode;
    builder._normalizeWhitespace = options.normalizeWhitespace;
    builder._withStartIndices = options.withStartIndices;
    builder._withEndIndices = options.withEndIndices;
    builder._dom = [];
    // The element whose content is being parsed, null at the top
    builder._current = null;
  }

  _add(node) {
    const builder = this;
    const parent = builder._current;
    const siblings = parent?.children ?? builder._dom;
    const prev = siblings.at(-1) ?? null;
    node.parent = parent;
    node.prev = prev;
    if (prev) prev.next = node;
    if (builder._withStartIndices) node.startIndex = builder.startIndex;
    if (builder._withEndIndices) node.endIndex = builder.endIndex;
    siblings.push(node);
    // An element or CDATA section is open now
    if (node.children) builder._current = node;
  }

  onopentag(name, attribs) {
    this._add(
      elementNode(this._xmlMode ? "tag" : tagType(name), name, attribs, []),
    );
  }

  onclosetag() {
    const element = this._current;
    if (this._withEndIndices) element.endIndex = this.endIndex;
    this._current = element.parent;
  }

  oncdatastart() {
    this._add({
      type: "cdata",
      children: [],
      parent: null,
      prev: null,
      next: null,
    });
  }

  oncdataend() {
    this.onclosetag();
  }

  ontext(data) {
    const builder = this;
    const prev = (builder._current?.children ?? builder._dom).at(-1);
    const append = prev?.type == "text";
    // Only the new text is normalized, and the existing text isn't even
    // read, so that appending many pieces takes linear time. Whether the
    // last text node ends with a space is remembered.
    if (builder._normalizeWhitespace) {
      data = data.replace(/\s+/g, " ");
      if (append && builder._endsWithSpace && data[0] == " ") data = data.slice(1);
      if (data || !append) builder._endsWithSpace = data.at(-1) == " ";
    }
    if (append) {
      prev.data += data;
      if (builder._withEndIndices) prev.endIndex = builder.endIndex;
    } else {
      builder._add(dataNode("text", data));
    }
  }

  oncomment(data) {
    this._add(dataNode("comment", data));
  }

  onprocessinginstruction(name, data) {
    this._add({
      type: "directive",
      name,
      data,
      parent: null,
      prev: null,
      next: null,
    });
  }
}

const parse = (markup = "", options = {}) => {
  const builder = new DomBuilder(options);
  new Parse(builder, builder, options)._run(markup, options);
  return builder._dom;
};

// The characters to escape in text and in attribute values, and the mode bits
// (see serialize) where the text of <script> etc. is escaped too. Decoded
// text needs "&" escaped too, for XML also ">" in text ("]]>"), "<" in
// attribute values, and all raw text.
const ESCAPING = ["<", '"', 1];
const DECODED_ESCAPING = ["&<>", '&<"', 3];

// A foreign context (see FOREIGN_CONTEXTS) sets or clears bit 0 of a mode
const inContext = (mode, context) =>
  context == null ? mode : context ? mode | 1 : mode & 2;

// Uses a stack instead of recursion to support any nesting depth
const serialize = (dom, options = {}) => {
  const { xmlMode, decodeEntities, spaceInSelfClosing } = options;
  const [textChars, attributeChars, escapedModes] = decodeEntities
    ? DECODED_ESCAPING
    : ESCAPING;
  let output = "";
  // Nodes and end tags to output, in reverse order, and their modes
  // (separate arrays to avoid allocations): bit 1 for XML, bit 0 for SVG
  // and MathML content, which are written with XML syntax too
  const stack = [];
  const modes = [];

  // The given nodes are written as in the whole DOM: the nearest ancestor
  // with a foreign context decides. The modes found for the ancestors on
  // the way are remembered for the next nodes, so that each is visited once.
  const nodes = Array.isArray(dom) ? dom : [dom];
  let ancestorModes;
  for (let i = nodes.length; i--; ) {
    const node = nodes[i];
    let ancestor = node;
    let context;
    let mode;
    while (
      (ancestor = ancestor.parent) &&
      (mode = ancestorModes?.get(ancestor)) == null &&
      (context = FOREIGN_CONTEXTS.get(ancestor.name)) == null
    );
    mode ??= inContext(xmlMode == "foreign" ? 1 : xmlMode ? 2 : 0, context);
    for (let next = node.parent; i && next != ancestor; next = next.parent) {
      (ancestorModes ??= new Map()).set(next, mode);
    }
    stack.push(node);
    modes.push(mode);
  }

  while (stack.length) {
    const node = stack.pop();
    let mode = modes.pop();
    if (typeof node == "string") {
      output += node;
      continue;
    }

    const { type, name, data, attribs, children, parent } = node;

    if (isTag(node)) {
      // The content of elements like <foreignObject> is HTML, while they are
      // still written as in SVG
      const context = FOREIGN_CONTEXTS.get(name);
      if (context) mode |= 1;

      output += `<${name}`;
      for (const key in attribs) {
        const value = attribs[key];
        output += ` ${key}`;
        if (value || mode) output += `="${escape(value, attributeChars)}"`;
      }
      if (mode && !children?.length) {
        output += spaceInSelfClosing ? " />" : "/>";
      } else {
        output += ">";
        if (mode || !VOID_ELEMENTS.has(name)) {
          stack.push(`</${name}>`);
          modes.push(0);
        }
        const childMode = inContext(mode, context);
        for (let i = children?.length ?? 0; i--; ) {
          stack.push(children[i]);
          modes.push(childMode);
        }
      }
    } else if (type == "directive") {
      output += `<${data}>`;
    } else if (type == "comment") {
      output += `<!--${data}-->`;
    } else if (type == "cdata") {
      output += `<![CDATA[${children[0].data}]]>`;
    } else if (data) {
      // Only text that needs escaping is checked for being raw, which it is
      // where it is when parsing HTML, in XML output too (HTML written with
      // XML syntax). The names of the elements with raw text are shorter than
      // 10 characters, so only that many are lowercased.
      const escaped = escape(data, textChars);
      output +=
        escaped != data &&
        !(mode & escapedModes) &&
        TEXT_ONLY.get(parent?.name?.slice(0, 10).toLowerCase()) > 1
          ? data
          : escaped;
    }
  }

  return output;
};

// Inserts the node between `prev` and `next`
const insert = (node, parent, prev, next) => {
  node.parent = parent;
  node.prev = prev;
  node.next = next;
  if (prev) prev.next = node;
  if (next) next.prev = node;
  if (parent) {
    const siblings = parent.children;
    siblings.splice(prev ? siblings.lastIndexOf(prev) + 1 : 0, 0, node);
  }
};

// Unlinks the nodes from their siblings and parents, but keeps their own
// links. Each affected sibling list is compacted once, so removing many
// nodes is linear.
const remove = (nodes, dom) => {
  const removed = new Set([nodes].flat(Infinity));
  const lists = new Set(Array.isArray(dom) ? [dom] : []);
  for (const { parent, prev, next } of removed) {
    if (prev) prev.next = next ?? null;
    if (next) next.prev = prev ?? null;
    if (parent) lists.add(parent.children);
  }
  for (const list of lists) {
    let length = 0;
    for (const node of list) if (!removed.has(node)) list[length++] = node;
    list.length = length;
  }
};

const replace = (node, replacement, dom) => {
  const { parent, prev, next } = node;
  replacement.parent = parent;
  replacement.prev = prev;
  replacement.next = next;
  if (prev) prev.next = replacement;
  if (next) next.prev = replacement;
  const siblings = parent?.children ?? dom;
  if (siblings) {
    const index = siblings.lastIndexOf(node);
    if (index >= 0) siblings[index] = replacement;
  }
};

const appendChild = (tag, child, dom) => {
  if (dom) remove(child, dom);
  insert(child, tag, tag.children.at(-1) ?? null, null);
};

const prependChild = (tag, child, dom) => {
  if (dom) remove(child, dom);
  insert(child, tag, null, tag.children[0] ?? null);
};

const append = (node, next) => insert(next, node.parent, node, node.next);

const prepend = (node, prev) => insert(prev, node.parent, node.prev, node);

const find = (test, nodes, tagsOnly, limit) => {
  if (typeof test == "string") {
    const name = test;
    test = (node) => node.name === name;
  }

  const result = [];
  const stack = [nodes].flat().reverse();

  while (stack.length && !(result.length >= limit)) {
    const node = stack.pop();
    if (tagsOnly && !isTag(node)) continue;
    if (test(node)) result.push(node);
    const { children } = node;
    if (children) {
      for (let i = children.length; i--;) stack.push(children[i]);
    }
  }

  return result;
};

const create = (name, ...definitions) => {
  const children = [];
  const attribs = {};

  for (const definition of definitions.flat(Infinity)) {
    if (!definition) continue;
    if (typeof definition == "string") {
      children.push(dataNode("text", definition));
    } else if (typeof definition == "object") {
      const { type } = definition;
      if (
        type == "text" || type == "comment"
          ? typeof definition.data == "string"
          : isTag(definition) && typeof definition.name == "string"
      ) {
        children.push(definition);
      } else {
        Object.assign(attribs, definition);
      }
    }
  }

  let [tagName, ...classes] = name.split(".");
  tagName ||= "div";
  if (classes.length) {
    attribs.class = [attribs.class, ...classes].filter(Boolean).join(" ");
  }

  const node = elementNode(tagType(tagName), tagName, attribs, children);

  remove(children);
  children.forEach((child, i) => {
    child.parent = node;
    child.prev = children[i - 1] ?? null;
    child.next = children[i + 1] ?? null;
  });

  return node;
};

const filterNodes = (test, nodes, limit = Infinity) =>
  find(test, nodes, false, limit);

const findOne = (test, nodes) => find(test, nodes, true, 1)[0] ?? null;

const findAll = (test, nodes) => find(test, nodes, true);

export {
  parse,
  serialize,
  Parser,
  create,
  isTag,
  remove,
  replace,
  appendChild,
  prependChild,
  append,
  prepend,
  filterNodes,
  findOne,
  findAll,
};
