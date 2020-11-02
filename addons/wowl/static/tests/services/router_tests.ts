import * as QUnit from "qunit";
import { parseHash, parseSearchQuery, Route, routeToUrl } from "../../src/services/router";

QUnit.module("Router");

QUnit.test("can parse an empty hash", (assert) => {
  assert.deepEqual(parseHash(""), {});
});

QUnit.test("can parse an single hash", (assert) => {
  assert.deepEqual(parseHash("#"), {});
});

QUnit.test("can parse a hash with a single key/value pair", (assert) => {
  const hash = "#action=114";
  assert.deepEqual(parseHash(hash), { action: "114" });
});

QUnit.test("can parse a hash with 2 key/value pairs", (assert) => {
  const hash = "#action=114&active_id=mail.box_inbox";
  assert.deepEqual(parseHash(hash), { action: "114", active_id: "mail.box_inbox" });
});

QUnit.test("a missing value is encoded as an empty string", (assert) => {
  const hash = "#action";
  assert.deepEqual(parseHash(hash), { action: "" });
});

QUnit.test("a missing value is encoded as an empty string -- 2", (assert) => {
  const hash = "#action=";
  assert.deepEqual(parseHash(hash), { action: "" });
});

QUnit.test("can parse a realistic hash", (assert) => {
  const hash = "#action=114&active_id=mail.box_inbox&cids=1&menu_id=91";
  const expected = {
    action: "114",
    active_id: "mail.box_inbox",
    cids: "1",
    menu_id: "91",
  };
  assert.deepEqual(parseHash(hash), expected);
});

QUnit.test("can parse an empty search", (assert) => {
  assert.deepEqual(parseSearchQuery(""), {});
});

QUnit.test("can parse an simple search with no value", (assert) => {
  assert.deepEqual(parseSearchQuery("?a"), { a: "" });
});

QUnit.test("can parse an simple search with a value", (assert) => {
  assert.deepEqual(parseSearchQuery("?a=1"), { a: "1" });
});

QUnit.test("can parse an search with 2 key/value pairs", (assert) => {
  assert.deepEqual(parseSearchQuery("?a=1&b=2"), { a: "1", b: "2" });
});

QUnit.test("can parse URI encoded strings", (assert) => {
  assert.deepEqual(parseSearchQuery("?space=this%20is"), { space: "this is" });
  assert.deepEqual(parseHash("#comma=that%2Cis"), { comma: "that,is" });
});

QUnit.test("routeToUrl encodes URI compatible strings", (assert) => {
  const route: Route = { pathname: "/asf", search: {}, hash: {} };
  assert.strictEqual(routeToUrl(route), "/asf");

  route.search = { a: "11", f: undefined, g: "summer wine" };
  assert.strictEqual(routeToUrl(route), "/asf?a=11&g=summer%20wine");

  route.hash = { b: "2", c: "", d: undefined, e: "kloug,gloubi" };
  assert.strictEqual(routeToUrl(route), "/asf?a=11&g=summer%20wine#b=2&c&e=kloug%2Cgloubi");
});
