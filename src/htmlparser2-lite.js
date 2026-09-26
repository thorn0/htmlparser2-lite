// Sets are faster than regexes for these lookups
const words = (str) => new Set(str.split(" "));

const VOID_ELEMENTS = words(
  "area base basefont br col command embed frame hr img input isindex keygen link meta param source track wbr",
);
const FOREIGN_ELEMENTS = words("svg math");
const INTEGRATION_POINTS = words(
  "mi mo mn ms mtext annotation-xml foreignObject desc title",
);
const UNENCODED_ELEMENTS = words(
  "style script xmp iframe noembed noframes plaintext noscript",
);
const SPECIAL_ELEMENTS = words("script style");
const TAG_TYPES = words("tag script style");

// Opening an element implicitly closes the current element if it's one of
// the elements mapped to it
const IMPLIED_CLOSE = new Map(
  [
    "tr/tr th td",
    "th/th",
    "td/thead th td",
    "body/head link script",
    "li/li",
    "p h1 h2 h3 h4 h5 h6 address article aside blockquote details div dl fieldset figcaption figure footer form header hr main nav ol pre section table ul/p",
    "select input output button datalist textarea/input option optgroup select button datalist textarea",
    "option/option",
    "optgroup/optgroup option",
    "dd dt/dd dt",
    "rt rp/rt rp",
    "tbody tfoot/thead tbody",
  ].flatMap((rule) => {
    const [opened, closed] = rule.split("/");
    const closedSet = words(closed);
    return opened.split(" ").map((name) => [name, closedSet]);
  }),
);

// In markup, only ASCII whitespace counts as whitespace, so `\s` (always
// inside brackets) gets replaced with it
const htmlRegExp = (re) =>
  RegExp(re.source.replaceAll("\\s", "\t\n\f\r "), re.flags);

const isTag = (node) => TAG_TYPES.has(node.type);

const tagType = (name) => (SPECIAL_ELEMENTS.has(name) ? name : "tag");

const lowerCase = (str, enabled) => (enabled ? str.toLowerCase() : str);

function Parser(handler, options = {}) {
  const parser = this;
  parser.startIndex = 0;
  parser.endIndex = 0;

  parser.end = (input = "") => {
    const { xmlMode } = options;
    const lowerCaseTags = options.lowerCaseTags ?? !xmlMode;
    const lowerCaseAttributeNames = options.lowerCaseAttributeNames ?? !xmlMode;

    const stack = [];
    // Numbers of open elements by name, to avoid searching the stack in vain
    const openCounts = { __proto__: null };
    const foreignContext = [];

    const emit = (name, a, b) => handler?.[name]?.(a, b);

    const setPosition = (start, end) => {
      parser.startIndex = start;
      parser.endIndex = end;
    };

    const push = (name) => {
      stack.push(name);
      openCounts[name] = (openCounts[name] ?? 0) + 1;
    };

    const pop = () => {
      const name = stack.pop();
      openCounts[name]--;
      emit("onclosetag", name);
    };

    const onOpenTag = (name, attribs) => {
      if (xmlMode || !VOID_ELEMENTS.has(name)) {
        push(name);
        if (FOREIGN_ELEMENTS.has(name)) foreignContext.push(true);
        else if (INTEGRATION_POINTS.has(name)) foreignContext.push(false);
      }
      emit("onopentag", name, attribs);
      if (!xmlMode && VOID_ELEMENTS.has(name)) emit("onclosetag", name);
    };

    const onSelfClosingTag = (name, attribs) => {
      onOpenTag(name, attribs);
      if (stack.at(-1) === name) pop();
    };

    const onCloseTag = (name) => {
      name = lowerCase(name, lowerCaseTags);
      if (FOREIGN_ELEMENTS.has(name) || INTEGRATION_POINTS.has(name)) {
        foreignContext.pop();
      }
      const index = openCounts[name] ? stack.lastIndexOf(name) : -1;
      if (index >= 0) {
        while (stack.length > index) pop();
      } else if (!xmlMode && (name == "p" || name == "br")) {
        onSelfClosingTag(name, {});
      }
    };

    const onInstruction = (prefix, value) =>
      emit(
        "onprocessinginstruction",
        prefix + lowerCase(value.split(/[\s/]/)[0], lowerCaseTags),
        prefix + value,
      );

    // Stateful (lastIndex), so created per call for reentrancy
    const TOKEN = htmlRegExp(
      /<(?:\/[\s]*([^\s>]+)[^>]*>?|!--(.*?)(?:-->|$)|!\[CDATA\[(.*?)(?:]]>|$)|!(.[^>]*)>?|\?([^>]*)>?|([^\s/<>!?][^\s/>]*))/gis,
    );
    const ATTRIBUTE = htmlRegExp(
      /([\s/]*)(?:>|([^\s/>][^\s/>=]*)(?:[\s]*=[\s]*(?:"([^"]*)"|'([^']*)'|(?!["'\s])([^\s>]*))|(?![\s]*=)))/y,
    );

    let index = 0;
    let start;
    let match;

    const onText = (end) => {
      if (end > index) {
        setPosition(index, end - 1);
        emit("ontext", input.slice(index, end));
      }
    };

    for (;;) {
      TOKEN.lastIndex = index;
      match = TOKEN.exec(input);
      start = match?.index ?? input.length;
      onText(start);
      if (!match) break;
      index = TOKEN.lastIndex;
      setPosition(start, index - 1);

      const [, endTag, comment, cdata, declaration, instruction, startTag] =
        match;

      if (comment != null) {
        emit("oncomment", comment);
      } else if (cdata != null) {
        if (xmlMode || options.recognizeCDATA) {
          emit("oncdatastart");
          emit("ontext", cdata);
          emit("oncdataend");
        } else {
          emit("oncomment", `[CDATA[${cdata}]]`);
        }
      } else if (!startTag) {
        // Drop an unterminated end tag, declaration or processing
        // instruction, it can only be at the end of the input
        if (input[index - 1] != ">") break;
        if (endTag) onCloseTag(endTag);
        else if (declaration) onInstruction("!", declaration);
        else onInstruction("?", instruction);
      } else {
        const name = lowerCase(startTag, lowerCaseTags);
        const attribs = {};

        ATTRIBUTE.lastIndex = index;
        while ((match = ATTRIBUTE.exec(input)) && match[2]) {
          const [, , rawKey, doubleQuoted, singleQuoted, unquoted] = match;
          const key = lowerCase(rawKey, lowerCaseAttributeNames);
          if (!Object.hasOwn(attribs, key)) {
            attribs[key] = doubleQuoted ?? singleQuoted ?? unquoted ?? "";
          }
        }
        // Unterminated tag at the end of the input, drop it
        if (!match) break;

        index = ATTRIBUTE.lastIndex;
        if (!xmlMode) {
          // Elements closed implicitly by this tag end right before it
          setPosition(start, start - 1);
          while (IMPLIED_CLOSE.get(name)?.has(stack.at(-1))) pop();
        }
        setPosition(start, index - 1);

        // Only whitespace and slashes can be before ">", so if there is a
        // slash, it's the last non-whitespace character
        const [, beforeEnd] = match;
        if (
          beforeEnd.includes("/") &&
          (xmlMode || options.recognizeSelfClosing || foreignContext.at(-1))
        ) {
          onSelfClosingTag(name, attribs);
        } else {
          onOpenTag(name, attribs);
        }

        // The content of <script> and <style> is text
        if (!xmlMode && SPECIAL_ELEMENTS.has(name.toLowerCase())) {
          const end = htmlRegExp(RegExp(`</[\\s]*${name}[\\s>]`, "gi"));
          end.lastIndex = index;
          start = end.exec(input)?.index ?? input.length;
          onText(start);
          index = start;
        }
      }
    }

    while (stack.length) pop();
    emit("onend");
  };
}

const parse = (markup, options = {}) => {
  const dom = [];
  const openElements = [];
  // Whether the last text node, the only one text can be appended to, ends
  // with a space (when normalizing whitespace)
  let endsWithSpace;

  const addNode = (node) => {
    const parent = openElements.at(-1) ?? null;
    const siblings = parent?.children ?? dom;
    const prev = siblings.at(-1) ?? null;
    node.parent = parent;
    node.prev = prev;
    node.next = null;
    if (prev) prev.next = node;
    if (options.withStartIndices) node.startIndex = parser.startIndex;
    if (options.withEndIndices) node.endIndex = parser.endIndex;
    siblings.push(node);
    return node;
  };

  const onClose = () => {
    const element = openElements.pop();
    if (options.withEndIndices) element.endIndex = parser.endIndex;
  };

  const parser = new Parser(
    {
      onopentag(name, attribs) {
        openElements.push(
          addNode({ type: tagType(name), name, attribs, children: [] }),
        );
      },
      onclosetag: onClose,
      oncdatastart() {
        openElements.push(addNode({ type: "cdata", children: [] }));
      },
      oncdataend: onClose,
      ontext(data) {
        const node = (openElements.at(-1)?.children ?? dom).at(-1);
        const append = node?.type == "text";
        // Appending must not renormalize or even read the existing text,
        // which would make it quadratic
        if (options.normalizeWhitespace) {
          data = data.replace(/\s+/g, " ");
          if (append && endsWithSpace && data[0] == " ") data = data.slice(1);
          if (data || !append) endsWithSpace = data.at(-1) == " ";
        }
        if (append) {
          node.data += data;
          if (options.withEndIndices) node.endIndex = parser.endIndex;
        } else {
          addNode({ type: "text", data });
        }
      },
      oncomment(data) {
        addNode({ type: "comment", data });
      },
      onprocessinginstruction(name, data) {
        addNode({ type: "directive", name, data });
      },
    },
    options,
  );

  parser.end(markup);
  return dom;
};

// Not recursive, so it works for any depth
const serialize = (dom, options = {}) => {
  let output = "";
  // Nodes and end tags to output, in reverse order, and the XML modes for
  // them (separate arrays to avoid allocations)
  const stack = [];
  const modes = [];
  const pushNodes = (nodes, xmlMode) => {
    for (let i = nodes.length; i--;) {
      stack.push(nodes[i]);
      modes.push(xmlMode);
    }
  };
  pushNodes([dom].flat(), options.xmlMode);

  while (stack.length) {
    const node = stack.pop();
    const xmlMode = modes.pop();
    if (typeof node == "string") {
      output += node;
      continue;
    }

    const { type, name, data, attribs, children, parent } = node;

    if (isTag(node)) {
      let xml =
        xmlMode == "foreign" && INTEGRATION_POINTS.has(parent?.name)
          ? false
          : xmlMode;
      if (!xml && FOREIGN_ELEMENTS.has(name)) xml = "foreign";

      output += `<${name}`;
      for (const key in attribs) {
        let value = attribs[key];
        output += ` ${key}`;
        if (value || xml) {
          // Checking first is much faster: most values have no quotes, and
          // replaceAll is slow even when it finds nothing
          if (value.includes('"')) value = value.replaceAll('"', "&quot;");
          output += `="${value}"`;
        }
      }
      if (xml && !children?.length) {
        output += options.spaceInSelfClosing ? " />" : "/>";
      } else {
        output += ">";
        if (xml || !VOID_ELEMENTS.has(name)) {
          stack.push(`</${name}>`);
          modes.push(0);
        }
        pushNodes(children ?? [], xml);
      }
    } else if (type == "directive") {
      output += `<${data}>`;
    } else if (type == "comment") {
      output += `<!--${data}-->`;
    } else if (type == "cdata") {
      output += `<![CDATA[${children[0].data}]]>`;
    } else if (data) {
      // See above about checking first
      output +=
        UNENCODED_ELEMENTS.has(parent?.name) || !data.includes("<")
          ? data
          : data.replaceAll("<", "&lt;");
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

  const [tagName, ...classes] = name.split(".");
  if (classes.length) {
    attribs.class = [attribs.class, ...classes].filter(Boolean).join(" ");
  }

  const node = {
    type: tagType(tagName || "div"),
    name: tagName || "div",
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
