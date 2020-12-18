import { currencyService } from "../../src/services/currency";
import { makeTestEnv, OdooEnv } from "../helpers/index";
import { Registries } from "../../src/types";
import { Registry } from "../../src/core/registry";

let env: OdooEnv;
let serviceRegistry: Registries["serviceRegistry"];

QUnit.module("Currency");

QUnit.test("get & getAll", async (assert) => {
  serviceRegistry = new Registry();
  serviceRegistry.add("currency", currencyService);
  env = await makeTestEnv({ serviceRegistry });
  const { currency: curSvc } = env.services;

  assert.deepEqual(curSvc.get(1)?.name, "USD");
  assert.deepEqual(curSvc.get("USD")?.name, "USD");
  assert.deepEqual(curSvc.get("OdooCoin"), undefined);
  assert.deepEqual(
    curSvc.getAll().map((c) => c.name),
    ["USD", "EUR"]
  );
});

QUnit.test("format", async (assert) => {
  serviceRegistry = new Registry();
  serviceRegistry.add("currency", currencyService);
  env = await makeTestEnv({ serviceRegistry });
  const { currency: curSvc } = env.services;

  assert.deepEqual(curSvc.format(1234567.654, "USD"), "$&nbsp;1234567.65");
  assert.deepEqual(curSvc.format(1234567.654, "EUR"), "1234567.65&nbsp;€");
  assert.deepEqual(
    curSvc.format(1234567.654, "OdooCoin"),
    "1234567.65",
    "undefined currency should be fine too"
  );
  assert.deepEqual(curSvc.format(1234567.654, "USD", { forceString: true }), "$ 1234567.65");
  assert.deepEqual(curSvc.format(1234567.654, "EUR", { forceString: true }), "1234567.65 €");
  assert.deepEqual(curSvc.format(1234567.654, "EUR", { noSymbol: true }), "1234567.65");
  assert.deepEqual(curSvc.format(1234567.654, "EUR", { humanReadable: true }), "1M&nbsp;€");
  assert.deepEqual(curSvc.format(1234567.654, "OdooCoin", { digits: [69, 1] }), "1234567.7");
  assert.deepEqual(
    curSvc.format(1234567.654, "USD", { digits: [69, 1] }),
    "$&nbsp;1234567.65",
    "currency digits should take over options digits when both are defined"
  );
  assert.deepEqual(
    curSvc.format(1234567.654, "EUR", { humanReadable: (value: number) => value > 100000 }),
    "1M&nbsp;€"
  );
  assert.deepEqual(
    curSvc.format(1234567.654, "EUR", { humanReadable: (value: number) => value < 100000 }),
    "1234567.65&nbsp;€"
  );
});

QUnit.test("parse", async (assert) => {
  serviceRegistry = new Registry();
  serviceRegistry.add("currency", currencyService);
  env = await makeTestEnv({ serviceRegistry });
  const { currency: curSvc } = env.services;

  assert.deepEqual(curSvc.parse("$&nbsp;1234567.65", "USD"), 1234567.65);
  assert.deepEqual(curSvc.parse("1234567.65&nbsp;€", "EUR"), 1234567.65);
  assert.deepEqual(curSvc.parse("1234567.65 €", "EUR"), 1234567.65);

  assert.deepEqual(curSvc.parse("$&nbsp;1,234,567.65", "USD"), 1234567.65);
  assert.deepEqual(curSvc.parse("1,234,567.65&nbsp;€", "EUR"), 1234567.65);
  assert.deepEqual(curSvc.parse("1,234,567.65 €", "EUR"), 1234567.65);

  assert.throws(function () {
    curSvc.parse("1234567.65 €", "OdooCoin");
  }, /currency not found/);
  assert.throws(function () {
    curSvc.parse("$&nbsp;1,234,567.65", "EUR");
  }, /not a correct 'EUR' monetary field/);
});
