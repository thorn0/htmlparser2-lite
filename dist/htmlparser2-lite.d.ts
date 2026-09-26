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
  constructor(handler: Handler, options?: ParserOptions);

  /** Start index of the markup that triggered the current callback. */
  startIndex: number;

  /** End index (inclusive) of the markup that triggered the current callback. */
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
 * Creates an element. Strings become text nodes, nodes are moved from where
 * they are, other objects are attributes, arrays are flattened.
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

export function appendChild(tag: DomTagNode, child: DomNode, dom?: Dom): void;

export function prependChild(tag: DomTagNode, child: DomNode, dom?: Dom): void;

/** Insert `next` after `node`. */
export function append(node: DomNode, next: DomNode): void;

/** Insert `prev` before `node`. */
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
  /***
   * Disables HTML-specific behavior: the content of special tags (<script> and <style>)
   * is no longer text only, "empty" tags (e.g. <br>) can have children, no tags are
   * closed implicitly, self-closing tags are recognized. For feeds and other XML content
   * (documents that don't consist of HTML), set this to true. Default: false.
   */
  xmlMode?: boolean;

  /***
   * If set to true, all tags will be lower-cased. If xmlMode is disabled, this defaults to true.
   */
  lowerCaseTags?: boolean;

  /***
   * If set to true, all attribute names will be lower-cased. If xmlMode is disabled, this defaults to true.
   */
  lowerCaseAttributeNames?: boolean;

  /***
   * If set to true, CDATA sections will be recognized as text even if the xmlMode option is not enabled.
   * NOTE: If xmlMode is set to true then CDATA sections will always be recognized as text.
   */
  recognizeCDATA?: boolean;

  /***
   * If set to true, self-closing tags will trigger the onclosetag event even if xmlMode is not set to true.
   * NOTE: If xmlMode is set to true then self-closing tags will always be recognized.
   */
  recognizeSelfClosing?: boolean;

  /**
   * Decode character references like `&amp;` in text and attribute values
   * (not in comments, CDATA, and in HTML, not in the elements whose text is
   * raw: <script>, <style>, <xmp>, <iframe>, <noembed>, <noframes>,
   * <plaintext>, <noscript>).
   *
   * `true` in XML mode: the XML entities and numeric references.
   *
   * `true` in HTML mode: all of HTML's, decoded by the browser's own parser,
   * so they come out exactly as the browser decodes them in the same markup.
   * Throws where there's no DOM, e.g. in Node or workers.
   *
   * A function: decodes the given text, e.g. with the `entities` package:
   * `(text, inAttribute) => inAttribute ? decodeHTMLAttribute(text) : decodeHTML(text)`.
   */
  decodeEntities?: boolean | ((text: string, inAttribute: boolean) => string);
}

export interface HandlerOptions {
  normalizeWhitespace?: boolean;
  withStartIndices?: boolean;
  withEndIndices?: boolean;
}

export interface SerializerOptions {
  xmlMode?: boolean | "foreign";
  spaceInSelfClosing?: boolean;
  /**
   * For a DOM parsed with `decodeEntities`: encode `&` as well, and `>` in
   * text and `<` in attribute values (needed for XML).
   */
  decodeEntities?: boolean;
}
