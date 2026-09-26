const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const htmlparser = require("../dist/htmlparser2-lite");

describe("htmlparser.remove", () => {
  test("with 2 args", () => {
    const dom = htmlparser.parse("<a></a><b></b>");
    const b = dom[1];
    assert.notEqual(b.prev, null);
    assert.equal(b.prev, dom[0]);
    htmlparser.remove(dom[0], dom);
    assert.equal(dom.length, 1);
    assert.equal(dom[0], b);
    assert.equal(b.prev, null);
  });

  test("can be passed to Array.prototype.forEach", () => {
    const dom = htmlparser.parse("<p><a></a><b></b><a></a>");
    const links = htmlparser.findAll((n) => n.name === "a", dom);
    const b = htmlparser.findOne((n) => n.name === "b", dom);
    assert.equal(links.length, 2);
    assert.notEqual(b.prev, null);
    links.forEach(htmlparser.remove);
    assert.equal(b.prev, null);
    assert.equal(dom[0].children.length, 1);
  });

  test("can remove multiple nodes", () => {
    const dom = htmlparser.parse("<a></a><b></b><a></a>");
    assert.equal(dom.length, 3);
    const links = htmlparser.findAll((n) => n.name === "a", dom);
    assert.notEqual(dom[1].prev, null);
    htmlparser.remove(links, dom);
    assert.equal(dom[0].prev, null);
    assert.equal(dom.length, 1);
  });

  test("can remove multiple nodes when passed array is `children` array of parent node", () => {
    const dom = htmlparser.parse(
      /* HTML */ `<section name="section_phase">
        <field name="title" />
        <field name="description" />
      </section>`,
      { xmlMode: true },
    );
    assert.equal(dom.length, 1);
    const nodesToRemove = dom[0].children;
    assert.equal(nodesToRemove.length, 5);
    htmlparser.remove(nodesToRemove, dom);
    assert.equal(
      htmlparser.serialize(dom, { xmlMode: true }),
      `<section name="section_phase"/>`,
    );
  });
});
