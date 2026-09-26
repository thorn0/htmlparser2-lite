const { test } = require("node:test");
const assert = require("node:assert/strict");
const htmlparser = require("../dist/htmlparser2-lite");

test("it works", () => {
  assert.equal(htmlparser.serialize(htmlparser.create("div")), "<div></div>");
  assert.equal(
    htmlparser.serialize(htmlparser.create("div", null)),
    "<div></div>",
  );
  assert.equal(
    htmlparser.serialize(htmlparser.create("div", { class: "foo" })),
    '<div class="foo"></div>',
  );
  assert.equal(
    htmlparser.serialize(htmlparser.create("div", { class: "foo" }, "bar")),
    '<div class="foo">bar</div>',
  );
  var node = htmlparser.create(
    "div",
    { class: "foo" },
    "bar",
    htmlparser.create("strong", null, "baz"),
  );
  assert.equal(
    htmlparser.serialize(node),
    '<div class="foo">bar<strong>baz</strong></div>',
  );
  assert.equal(node.children[1].prev.data, "bar");
  assert.equal(node.children[1].parent, node);
  assert.equal(
    htmlparser.serialize(
      htmlparser.create("div", { class: "foo" }, [
        "bar",
        htmlparser.create("strong", null, "baz"),
      ]),
    ),
    '<div class="foo">bar<strong>baz</strong></div>',
  );
  assert.equal(
    htmlparser.serialize(
      htmlparser.create(
        "div",
        { class: "bar" },
        { class: "foo" },
        ["bar", htmlparser.create("strong", null, "baz")],
        "qux",
      ),
    ),
    '<div class="foo">bar<strong>baz</strong>qux</div>',
  );
});

test("ignore empty children", () => {
  var node = htmlparser.create("div", undefined, "x", null, undefined, "", "y");
  assert.equal(htmlparser.serialize(node), "<div>xy</div>");
});

test("maintains consistency of the donor tree when taking nodes from it", () => {
  var donor = htmlparser.parse(
    "<p>foo <strong>bar</strong><em>baz</em></p>",
  )[0];
  var strong = donor.children[1];
  assert.equal(strong.name, "strong");
  var created = htmlparser.create("div", "qux", strong);
  assert.equal(
    htmlparser.serialize(created),
    "<div>qux<strong>bar</strong></div>",
  );
  assert.equal(donor.children.length, 2);
  assert.equal(donor.children[0].next.name, "em");
});

test("CSS classes shortcut", () => {
  assert.equal(
    htmlparser.serialize(htmlparser.create("span.foo")),
    '<span class="foo"></span>',
  );
  assert.equal(
    htmlparser.serialize(htmlparser.create("span.foo.zoo")),
    '<span class="foo zoo"></span>',
  );
  assert.equal(
    htmlparser.serialize(htmlparser.create(".foo")),
    '<div class="foo"></div>',
  );
});

test("misc #1", () => {
  const markup =
    '<layout><field name="a"></field><field name="b"/><foo/></layout>';
  const el = htmlparser.parse(markup, { recognizeSelfClosing: true })[0];
  const fields = [];
  for (const child of el.children.slice()) {
    htmlparser.remove(child);
    if (child.name === "field") {
      fields.push(child);
      const div = htmlparser.create("div", null, child);
      htmlparser.appendChild(el, div);
    }
  }
  assert.equal(fields.length, 2);
  assert.equal(
    htmlparser.serialize(el),
    '<layout><div><field name="a"></field></div><div><field name="b"></field></div></layout>',
  );
});
