export as namespace htmlparser;

export interface BaseDomNode {
  parent?: DomNode | null;
  next?: DomNode | null;
  prev?: DomNode | null;
  startIndex?: number;
  endIndex?: number;
}

export type DomNode =
  DomTextNode | DomDirectiveNode | DomCommentNode | DomTagNode | DomCdataNode;

export type Dom = DomNode[];

export interface DomTextNode extends BaseDomNode {
  type: "text";
  data: string;
  name?: undefined;
  attribs?: undefined;
  children?: undefined;
}

export interface DomDirectiveNode extends BaseDomNode {
  type: "directive";
  data: string;
  // Actually, `name` is `string`, but this breaks type guards like `if (el.name === 'p') ...`.
  name?: undefined;
  attribs?: undefined;
  children?: undefined;
}

export interface DomCommentNode extends BaseDomNode {
  type: "comment";
  data: string;
  name?: undefined;
  attribs?: undefined;
  children?: undefined;
}

export interface DomTagNode extends BaseDomNode {
  type: "tag" | "script" | "style";
  data?: undefined;
  name: string;
  attribs: { [name: string]: string };
  children: DomNode[];
}

export interface DomCdataNode extends BaseDomNode {
  type: "cdata";
  data?: undefined;
  name?: undefined;
  attribs?: undefined;
  // Specifying `DomTextNode[]` is not practical because of https://github.com/microsoft/TypeScript/issues/35045
  children: DomNode[];
}

export class Parser {
  constructor(handler?: Handler, options?: ParserOptions);

  /**
   * Start index of the markup that triggered the current callback. For an
   * element closed implicitly by a start tag, the start of that tag (and
   * `endIndex` is one less: the empty range right before it). At the end of
   * the input, including in `onend`, the length of the input (and `endIndex`
   * is one less again).
   */
  startIndex: number;

  /**
   * End index (inclusive) of the markup that triggered the current callback,
   * see `startIndex` for the exceptions.
   */
  endIndex: number;

  /**
   * Parses the input, calling the callbacks, `onend` last. Each call parses
   * its input separately.
   */
  end(input: string): void;
}

export function parse(
  markup: string,
  options?: ParserOptions & HandlerOptions,
): DomNode[];

/**
 * Writes nodes as markup. Nodes that are part of a DOM are written as in the
 * whole DOM, e.g. the content of an element inside <svg> as SVG.
 */
export function serialize(
  dom: DomNode | DomNode[],
  options?: SerializerOptions,
): string;

export type CreateArgument =
  | DomNode
  | string
  | { [name: string]: string }
  | null
  | undefined
  | CreateArgument[];

/**
 * Creates an element. Strings become text nodes, element, text and comment
 * nodes become its children (moved from their parents, but not from an array
 * of top-level nodes: remove them from it first with `remove(nodes, dom)`),
 * other objects are attributes, arrays are flattened.
 * @param tagName Can contain CSS classes: `div.foo.bar`, `.foo` (a div)
 */
export function create(
  tagName: string,
  ...childrenOrAttribs: CreateArgument[]
): DomTagNode;

/** Tests whether a node is a tag (`tag`, `script` or `style`). */
export function isTag(node: DomNode): node is DomTagNode;

/**
 * Removes the nodes from their parents and from `dom`. The removed nodes keep
 * their own `parent`, `prev` and `next`. To remove many nodes, pass them all
 * in one call: that's much faster than calling `remove` for each of them.
 * @param nodes Nodes to remove
 * @param dom Array of top-level nodes, e.g. returned from `parse`.
 * Ignored if `number`, so `forEach` can be used: `nodes.forEach(remove)`
 */
export function remove(nodes: DomNode | DomNode[], dom?: Dom | number): void;

/**
 * Note that if `replacement` is part of the DOM, it should be removed first
 * (e.g. using `remove`) for proper cleanup.
 */
export function replace(node: DomNode, replacement: DomNode, dom?: Dom): void;

/**
 * Makes `child` the last child of `tag`. If `child` is in a DOM, pass that
 * DOM's array of top-level nodes as `dom` to move it (it's removed from where
 * it was only then).
 */
export function appendChild(tag: DomTagNode, child: DomNode, dom?: Dom): void;

/** Like `appendChild`, but makes `child` the first child. */
export function prependChild(tag: DomTagNode, child: DomNode, dom?: Dom): void;

/**
 * Inserts `next` after `node`. `next` must not be in a DOM (remove it
 * first). If `node` is a top-level node, `next` isn't added to the array of
 * top-level nodes.
 */
export function append(node: DomNode, next: DomNode): void;

/** Like `append`, but inserts `prev` before `node`. */
export function prepend(node: DomNode, prev: DomNode): void;

/**
 * Finds the nodes, of any type, that pass the test among the given nodes and
 * their descendants, in document order. Unlike `findAll`, finds text nodes,
 * comments, etc. too.
 * @param [limit=Infinity] Stop after finding this many nodes
 */
export function filterNodes(
  test: (node: DomNode) => boolean,
  nodes: DomNode | DomNode[],
  limit?: number,
): DomNode[];

/**
 * Finds the first tag that passes the test among the given nodes and their
 * descendants, in document order. Text nodes, comments, etc. are skipped.
 * @param test Tag name or predicate function
 */
export function findOne(
  test: ((el: DomTagNode) => boolean) | string,
  nodes: DomNode[],
): DomTagNode | null;

/**
 * Finds the tags that pass the test among the given nodes and their
 * descendants, in document order. Text nodes, comments, etc. are skipped.
 * @param test Tag name or predicate function
 */
export function findAll(
  test: ((el: DomTagNode) => boolean) | string,
  nodes: DomNode[],
): DomTagNode[];

export interface Handler {
  onopentag?: (name: string, attribs: { [type: string]: string }) => void;
  ontext?: (text: string) => void;
  onclosetag?: (text: string) => void;
  onprocessinginstruction?: (name: string, data: string) => void;
  oncomment?: (data: string) => void;
  oncdatastart?: () => void;
  oncdataend?: () => void;
  onend?: () => void;
}

export interface ParserOptions {
  /**
   * Parse XML (e.g. feeds) instead of HTML: the content of <script>, <title>,
   * etc. isn't text only, elements like <br> aren't void, no elements are
   * closed implicitly, `/>` closes elements, CDATA sections are recognized,
   * `<!x>` and `<?x?>` are directives (not comments), names aren't lowercased
   * by default, and `parse` gives <script> and <style> elements the type
   * `tag`.
   *
   * Default: `false`
   */
  xmlMode?: boolean;

  /**
   * Lowercase tag names.
   *
   * Default: `true` in HTML, `false` in XML (`!xmlMode`)
   */
  lowerCaseTags?: boolean;

  /**
   * Lowercase attribute names.
   *
   * Default: `true` in HTML, `false` in XML (`!xmlMode`)
   */
  lowerCaseAttributeNames?: boolean;

  /**
   * In HTML too, parse CDATA sections as CDATA (`oncdatastart`, `ontext`,
   * `oncdataend`, `cdata` nodes) instead of comments (or text inside <svg>
   * and <math>, but not inside elements like <foreignObject> there, which
   * contain HTML). Always on in XML.
   *
   * Default: `false`
   */
  recognizeCDATA?: boolean;

  /**
   * In HTML too, close elements written as self-closing (`<x/>`), so that
   * `<script/>`, `<title/>` etc. are empty. Always on in XML, and in HTML
   * inside <svg> and <math> (but not inside elements like <foreignObject>,
   * which contain HTML).
   *
   * Default: `false`
   */
  recognizeSelfClosing?: boolean;

  /**
   * Decode character references like `&amp;` in text and attribute values
   * (not in comments, CDATA, and in HTML, not in the elements whose text is
   * raw: <script>, <style>, <xmp>, <iframe>, <noembed>, <noframes>,
   * <plaintext>).
   *
   * `true` in XML mode: the XML entities and numeric references.
   *
   * `true` in HTML mode: all of HTML's, decoded by the browser's own parser,
   * so they come out exactly as the browser decodes them in the same markup.
   * Throws where there's no DOM, e.g. in Node or workers.
   *
   * A function: decodes the given text, e.g. with the `entities` package:
   * `(text, inAttribute) => inAttribute ? decodeHTMLAttribute(text) : decodeHTML(text)`.
   *
   * Default: `false`
   */
  decodeEntities?: boolean | ((text: string, inAttribute: boolean) => string);
}

/** Options of `parse` for building the DOM. */
export interface HandlerOptions {
  /**
   * Replace each run of whitespace in text with a single space.
   *
   * Default: `false`
   */
  normalizeWhitespace?: boolean;

  /**
   * Set `startIndex` of nodes: the index of their first character in the
   * input.
   *
   * Default: `false`
   */
  withStartIndices?: boolean;

  /**
   * Set `endIndex` of nodes: the index of their last character in the input
   * (for elements, of their end tag; an element closed implicitly by a start
   * tag ends right before it).
   *
   * Default: `false`
   */
  withEndIndices?: boolean;
}

export interface SerializerOptions {
  /**
   * `true`: output XML: elements without children self-close (`<x/>`),
   * elements like <br> aren't void, attributes always get values.
   *
   * `"foreign"`: output HTML as inside <svg> or <math>: elements without
   * children self-close (except elements like <foreignObject>, which contain
   * HTML, as the output inside them is) and attributes always get values.
   *
   * `false`: output HTML, switching to `"foreign"` inside <svg> and <math>.
   *
   * The text of <script>, <style> and the other elements whose text is raw
   * in HTML isn't escaped, except inside <svg> and <math> (but inside
   * elements like <foreignObject> there, it isn't escaped either), in XML
   * too unless `decodeEntities` is set (e.g. for HTML parsed with
   * `recognizeSelfClosing` and written with `xmlMode: true`).
   *
   * Default: `false`
   */
  xmlMode?: boolean | "foreign";

  /**
   * Write self-closing elements as `<x />` instead of `<x/>`.
   *
   * Default: `false`
   */
  spaceInSelfClosing?: boolean;

  /**
   * For a DOM parsed with `decodeEntities`: escape `&`, `<` and `>` in text
   * and `&`, `<` and `"` in attribute values. Without it, only `<` in text
   * and `"` in attribute values are escaped, because text that wasn't decoded
   * is still escaped. With it, the text of <script>, <style> etc. is escaped
   * in XML output too.
   *
   * Default: `false`
   */
  decodeEntities?: boolean;
}
