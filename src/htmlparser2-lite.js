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

// The tokens in HTML and in XML. Tag names start with a letter in HTML, and
// with almost anything in XML (in start tags, not with "!" and "?", which
// start other markup). Groups (the end groups are "" at the end of the
// input): 1 start tag name (first as the most common), 2 what's before ">" if
// the tag ends right after its name (then the attribute regex isn't needed),
// 3 end tag name, 4 bogus comment after "</" (HTML), 5 comment, 6 its end
// ("-?>" right after "<!--" in HTML), 7 CDATA, 8 its end, 9 after "<!", 10
// its end, 11 after "<?", 12 its end (XML).
const TOKENS = [false, true].map((xmlMode) => {
  const startName = xmlMode ? "[^ />!?]" : "[a-zA-Z]";
  const endName = xmlMode ? "[^ />]" : "[a-zA-Z]";
  const htmlOnly = xmlMode ? "(?!)" : "";
  return htmlRegExp(
    `<(?:(${startName}[^ />]*)(?:([ /]*)>)?|/${xmlMode ? "[ ]*" : ""}(${endName}[^ />]*)[^>]*>?|${htmlOnly}/(?=[^])([^>]*)>?|!--(.*?)(--!?>|${htmlOnly}(?<=!--)-?>|$)|!\\[CDATA\\[(.*?)(]]>|$)|!(${xmlMode ? "-?>?" : ""}[^>]*)(>?)|\\?${xmlMode ? "(.*?)(\\?>|$)" : "([^>]*)()>?"})`,
    "gs",
  );
});

// An attribute or the end of a start tag (group 1: what's before ">")
const ATTRIBUTE = htmlRegExp(
  `([ /]*)(?:>|([^ />][^ />=]*)(?:[ ]*=[ ]*(?:"([^"]*)"|'([^']*)'|(?!["' ])([^ >]*))|(?![ ]*=)))`,
  "y",
);

// The end tags of the elements with text content (not <plaintext>, which has
// none)
const TEXT_END_TAGS = new Map(
  [...TEXT_ONLY]
    .filter(([, kind]) => kind < 3)
    .map(([name]) => [name, htmlRegExp(`</${name}[ />]`, "gi")]),
);

const tagType = (name) =>
  name == "script" || name == "style" ? name : "tag";

const TAG_TYPES = words("tag script style");

const isTag = (node) => TAG_TYPES.has(node.type);

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

function Parser(handler, options = {}) {
  const parser = this;
  parser.startIndex = parser.endIndex = 0;

  parser.end = (input = "") => {
    const { xmlMode, decodeEntities, recognizeSelfClosing, recognizeCDATA } =
      options;
    const lowerCaseTags = options.lowerCaseTags ?? !xmlMode;
    const lowerCaseAttributeNames = options.lowerCaseAttributeNames ?? !xmlMode;

    const decode =
      typeof decodeEntities == "function"
        ? decodeEntities
        : decodeEntities && (xmlMode ? decodeXML : createBrowserDecoder());
    const decoded = (text, inAttribute) =>
      decode && text.includes("&") ? decode(text, inAttribute) : text;

    const stack = [];
    // Numbers of open elements by name, so that end tags matching no open
    // element don't search the stack
    const openCounts = { __proto__: null };
    // The foreign context of the content of the current element: "svg",
    // "math", false for HTML inside those, undefined outside; and those of
    // its ancestors
    let foreignContext;
    const foreignContexts = [];

    const setPosition = (start, end) => {
      parser.startIndex = start;
      parser.endIndex = end;
    };

    const push = (name) => {
      stack.push(name);
      openCounts[name] = (openCounts[name] | 0) + 1;
      foreignContexts.push(foreignContext);
      foreignContext = FOREIGN_CONTEXTS.get(name) ?? foreignContext;
    };

    const pop = () => {
      const name = stack.pop();
      openCounts[name]--;
      foreignContext = foreignContexts.pop();
      handler?.onclosetag?.(name);
    };

    // Lowercases the name (if enabled) and, in HTML, restores the case of SVG
    // names (in SVG, or when closing an open element, which can only be in
    // <svg>) and renames <image> to <img> (outside SVG and MathML)
    const tagName = (name) => {
      name = lowerCase(name, lowerCaseTags);
      if (xmlMode || !lowerCaseTags) return name;
      if (foreignContext != null) {
        const svgName = SVG_TAG_NAMES.get(name);
        if (foreignContext == "svg" || (svgName && openCounts[svgName])) {
          return svgName ?? name;
        }
      }
      return !foreignContext && name == "image" ? "img" : name;
    };

    const onOpenTag = (name, attribs) => {
      const isVoid = !xmlMode && VOID_ELEMENTS.has(name);
      if (!isVoid) push(name);
      handler?.onopentag?.(name, attribs);
      if (isVoid) handler?.onclosetag?.(name);
    };

    const closeCurrentTag = (name) => {
      if (stack.at(-1) == name) pop();
    };

    const onCloseTag = (name) => {
      const index = openCounts[name] ? stack.lastIndexOf(name) : -1;
      if (index >= 0) {
        while (stack.length > index) pop();
      } else if (!xmlMode && (name == "p" || name == "br")) {
        onOpenTag(name, {});
        closeCurrentTag(name);
      }
    };

    const onComment = (data) => handler?.oncomment?.(data);

    // The name is the first word in XML, and "doctype" in HTML (the only
    // declaration there)
    const onInstruction = (prefix, value, data) =>
      handler?.onprocessinginstruction?.(prefix +
          lowerCase(
            xmlMode ? value.split(/[\s/]/)[0] : value.slice(0, 7),
            lowerCaseTags,
          ),
        prefix + data,
      );

    const TOKEN = TOKENS[xmlMode ? 1 : 0];

    let index = 0;
    let start;
    let match;

    // `raw`: raw text, which isn't decoded
    const onText = (end, raw) => {
      if (end > index) {
        setPosition(index, end - 1);
        const text = input.slice(index, end);
        handler?.ontext?.(raw ? text : decoded(text, false));
      }
    };

    for (;;) {
      TOKEN.lastIndex = index;
      match = TOKEN.exec(input);
      const tokenEnd = TOKEN.lastIndex;
      start = match?.index ?? input.length;
      onText(start);
      if (!match) break;
      index = tokenEnd;
      setPosition(start, index - 1);

      const [
        ,
        startTag,
        startTagEnd,
        endTag,
        bogusEndTag,
        comment,
        commentEnd,
        cdata,
        cdataEnd,
        declaration,
        declarationEnd,
        instruction,
        instructionEnd,
      ] = match;

      if (startTag) {
        const name = tagName(startTag);
        // Text-only names aren't changed by tagName, except for lowercasing
        const textOnlyName = lowerCaseTags ? name : name.toLowerCase();
        const textOnly =
          !xmlMode && !foreignContext && TEXT_ONLY.get(textOnlyName);
        const attribs = {};

        // The whitespace and slashes before ">"
        let beforeEnd = startTagEnd;
        while (beforeEnd == null) {
          ATTRIBUTE.lastIndex = index;
          match = ATTRIBUTE.exec(input);
          if (!match) break;
          index = ATTRIBUTE.lastIndex;
          const [, before, rawKey, doubleQuoted, singleQuoted, unquoted] = match;
          // The end of the tag
          if (!rawKey) {
            beforeEnd = before;
            break;
          }
          const key = lowerCase(rawKey, lowerCaseAttributeNames);
          if (!Object.hasOwn(attribs, key)) {
            attribs[key] = decoded(
              doubleQuoted ?? singleQuoted ?? unquoted ?? "",
              true,
            );
          }
        }
        // Unterminated tag at the end of the input, drop it
        if (beforeEnd == null) break;

        // A <form> in another one is ignored
        if (!xmlMode && name == "form" && openCounts.form) continue;
        if (!xmlMode) {
          // Elements closed implicitly by this tag end right before it
          setPosition(start, start - 1);
          while (IMPLIED_CLOSE.get(name)?.has(stack.at(-1))) pop();
        }
        setPosition(start, index - 1);

        onOpenTag(name, attribs);

        // Only whitespace and slashes can be before ">", so if there is a
        // slash, it's the last non-whitespace character. The foreign context
        // of the element itself applies (`<svg/>` is self-closing), hence
        // this check comes after onOpenTag.
        const selfClosing = beforeEnd.includes("/");
        if (selfClosing && (xmlMode || recognizeSelfClosing || foreignContext)) {
          closeCurrentTag(name);
        }

        if (textOnly && !(selfClosing && recognizeSelfClosing)) {
          start = input.length;
          if (textOnly < 3) {
            const endTag = TEXT_END_TAGS.get(textOnlyName);
            endTag.lastIndex = index;
            start = endTag.exec(input)?.index ?? start;
          }
          onText(start, textOnly > 1);
          index = start;
        }
      } else if (comment != null) {
        // A partial "--!>" at the end of the input isn't part of an HTML
        // comment
        onComment(
          commentEnd || xmlMode ? comment : comment.replace(/-(-!?)?$/, ""),
        );
      } else if (cdata != null) {
        if (xmlMode || (cdataEnd && recognizeCDATA)) {
          if (cdataEnd || cdata) {
            handler?.oncdatastart?.();
            // The text is after "<![CDATA["
            setPosition(start + 9, start + 8 + cdata.length);
            handler?.ontext?.(cdata);
            setPosition(start, index - 1);
            handler?.oncdataend?.();
          }
        } else if (cdataEnd && foreignContext) {
          handler?.ontext?.(cdata);
        } else {
          onComment(`[CDATA[${cdata}${cdataEnd && "]]"}`);
        }
      } else if (bogusEndTag != null) {
        // "</>" is ignored
        if (bogusEndTag) onComment(bogusEndTag);
      } else if (instruction != null) {
        if (!xmlMode) {
          onComment(`?${instruction}`);
        } else if (instructionEnd) {
          // Unlike in htmlparser2, the data ends with "?", so that it's
          // serialized back as it was
          onInstruction("?", instruction, `${instruction}?`);
        }
      } else if (declaration != null) {
        // In HTML, anything but DOCTYPE is a comment
        if (!xmlMode && !/^doctype/i.test(declaration)) {
          onComment(declaration);
        } else if (declarationEnd) {
          onInstruction("!", declaration, declaration);
        }
      } else if (endTag) {
        // Drop an unterminated end tag, it can only be at the end of the
        // input
        if (input[index - 1] == ">") onCloseTag(tagName(endTag));
      }
    }

    // Elements still open end at the end of the input
    setPosition(input.length, input.length - 1);
    while (stack.length) pop();
    handler?.onend?.();
  };
}

const parse = (markup, options = {}) => {
  const { xmlMode, normalizeWhitespace, withStartIndices, withEndIndices } =
    options;
  const dom = [];
  const openElements = [];
  // Whether the last text node, the only one text can be appended to, ends
  // with a space (when normalizing whitespace)
  let endsWithSpace;

  // The parent and the previous sibling of the next node
  let parent;
  let siblings;
  let prev;
  const locate = () => {
    parent = openElements.at(-1) ?? null;
    siblings = parent?.children ?? dom;
    prev = siblings.at(-1) ?? null;
  };

  const addNode = (node) => {
    if (prev) prev.next = node;
    if (withStartIndices) node.startIndex = parser.startIndex;
    if (withEndIndices) node.endIndex = parser.endIndex;
    siblings.push(node);
    return node;
  };

  const onClose = () => {
    const element = openElements.pop();
    if (withEndIndices) element.endIndex = parser.endIndex;
  };

  const parser = new Parser(
    {
      onopentag(name, attribs) {
        locate();
        openElements.push(
          addNode({
            type: xmlMode ? "tag" : tagType(name),
            name,
            attribs,
            children: [],
            parent,
            prev,
            next: null,
          }),
        );
      },
      onclosetag: onClose,
      oncdatastart() {
        locate();
        openElements.push(
          addNode({ type: "cdata", children: [], parent, prev, next: null }),
        );
      },
      oncdataend: onClose,
      ontext(data) {
        locate();
        const append = prev?.type == "text";
        // Only the new text is normalized, and the existing text isn't even
        // read, so that appending many pieces takes linear time
        if (normalizeWhitespace) {
          data = data.replace(/\s+/g, " ");
          if (append && endsWithSpace && data[0] == " ") data = data.slice(1);
          if (data || !append) endsWithSpace = data.at(-1) == " ";
        }
        if (append) {
          prev.data += data;
          if (withEndIndices) prev.endIndex = parser.endIndex;
        } else {
          addNode({ type: "text", data, parent, prev, next: null });
        }
      },
      oncomment(data) {
        locate();
        addNode({ type: "comment", data, parent, prev, next: null });
      },
      onprocessinginstruction(name, data) {
        locate();
        addNode({ type: "directive", name, data, parent, prev, next: null });
      },
    },
    options,
  );

  parser.end(markup);
  return dom;
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
  // the way are remembered, so that each is visited once.
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
    for (let next = node.parent; next != ancestor; next = next.parent) {
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
      children.push({ type: "text", data: definition });
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

  const node = {
    type: tagType(tagName),
    name: tagName,
    attribs,
    children,
    parent: null,
    prev: null,
    next: null,
  };

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
