import htmlparser = require("htmlparser2-lite");

const dom: htmlparser.DomNode[] = htmlparser.parse("<p>a</p>");
console.log(htmlparser.serialize(dom), htmlparser.findOne("p", dom)?.name);
