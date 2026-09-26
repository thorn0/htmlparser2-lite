/// <reference types="htmlparser2-lite" />

// A script loading the UMD build with <script> gets the `htmlparser` global
const globalDom: htmlparser.DomNode[] = htmlparser.parse("<p>a</p>");
console.log(htmlparser.serialize(globalDom));
