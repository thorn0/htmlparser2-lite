// A stand-in for the DOM APIs that `decodeEntities: true` uses in HTML mode,
// decoding like a browser does, with the entities package. It also checks that
// only single character references are passed to it.
const { decodeHTML, decodeHTMLAttribute } = require("entities");

const REFERENCE = /^&[#\w]+;?=?$/;

const createElement = () => ({
  firstChild: null,
  textContent: "",
  set innerHTML(html) {
    const [, attribute] = /^<a title="([^"]*)">$/.exec(html) ?? [];
    if (attribute != null && REFERENCE.test(attribute)) {
      this.firstChild = { title: decodeHTMLAttribute(attribute) };
    } else if (REFERENCE.test(html)) {
      this.textContent = decodeHTML(html);
    } else {
      throw Error(`Not a single character reference: ${html}`);
    }
  },
});

globalThis.document = {
  implementation: { createHTMLDocument: () => ({ createElement }) },
};
