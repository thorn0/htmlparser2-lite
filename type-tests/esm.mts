import * as htmlparser from "htmlparser2-lite";
import { parse, type DomNode } from "htmlparser2-lite";

const nodes: DomNode[] = parse("<p>");
console.log(nodes);

const decoded = parse("&amp;", {
  decodeEntities: (text: string, inAttribute: boolean) =>
    inAttribute ? text : text.toUpperCase(),
});
console.log(htmlparser.serialize(decoded, { decodeEntities: true }));
parse("&amp;", { decodeEntities: true, xmlMode: true });

const dom = htmlparser.parse("<b>1</b><p><b>2</b>");
const x = dom[0];
if (x.attribs) {
  console.log(x.children);
}
if (htmlparser.isTag(x)) {
  console.log(x.name, x.attribs, x.children);
}
htmlparser.remove(
  htmlparser.findAll((n) => n.name === "b", dom),
  dom,
);

const parser = new htmlparser.Parser({
  onopentag(name, attribs) {
    console.log(name, attribs.id, parser.startIndex, parser.endIndex);
  },
});
parser.end("<p id=1>text");

const div: htmlparser.DomTagNode = htmlparser.create("div.foo", { id: "x" }, [
  "text",
  htmlparser.findOne("p", dom) ?? undefined,
]);
htmlparser.appendChild(div, htmlparser.create("span"));
const texts: htmlparser.DomNode[] = htmlparser.filterNodes(
  (n) => n.type === "text",
  div,
  10,
);
console.log(htmlparser.serialize(texts, { xmlMode: "foreign" }));
