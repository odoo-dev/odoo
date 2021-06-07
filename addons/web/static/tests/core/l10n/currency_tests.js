/** @odoo-module **/

import { formatCurrency } from "@web/core/l10n/currency";
import { localization } from "@web/core/l10n/localization";
import { patch, unpatch } from "@web/core/utils/patch";
import { defaultLocalization } from "../../helpers/mock_services";

QUnit.module("utils", () => {
    QUnit.module("Currency");

    QUnit.test("format", async (assert) => {
        patch(localization, "locpatch", defaultLocalization);

        const currency_usd = { name: "USD", digits: [69, 2], position: "before", symbol: "$" };
        const currency_eur = { name: "EUR", digits: [69, 2], position: "after", symbol: "€" };

        assert.deepEqual(formatCurrency(1234567.654, currency_usd), "$ 1,234,567.65");
        assert.deepEqual(formatCurrency(1234567.654, currency_eur), "1,234,567.65 €");
        assert.deepEqual(
            formatCurrency(1234567.654, undefined),
            "1,234,567.65",
            "undefined currency should be fine too"
        );
        assert.deepEqual(formatCurrency(1234567.654, currency_eur, { noSymbol: true }), "1,234,567.65");
        assert.deepEqual(formatCurrency(1234567.654, currency_eur, { humanReadable: true }), "1M €");
        assert.deepEqual(formatCurrency(1234567.654, undefined, { digits: [69, 1] }), "1,234,567.7");
        assert.deepEqual(
            formatCurrency(1234567.654, currency_usd, { digits: [69, 1] }),
            "$ 1,234,567.65",
            "currency digits should take over options digits when both are defined"
        );
        assert.strictEqual(formatCurrency(false, currency_eur), "");
        unpatch(localization, "locpatch");
    });

    // BOI: we do not have a parse method, but here are some tests if we want to add this at some point.
    // QUnit.test("parse", async (assert) => {
    //   serviceRegistry = new Registry();
    //   serviceRegistry.add("currency", currencyService);
    //   env = await makeTestEnv({ serviceRegistry });
    //   const { currency: curSvc } = env.services;
    //   assert.deepEqual(curSvc.parse("$ 1234567.65", "USD"), 1234567.65);
    //   assert.deepEqual(curSvc.parse("1234567.65 €", "EUR"), 1234567.65);
    //   assert.deepEqual(curSvc.parse("1234567.65 €", "EUR"), 1234567.65);
    //   assert.deepEqual(curSvc.parse("$ 1,234,567.65", "USD"), 1234567.65);
    //   assert.deepEqual(curSvc.parse("1,234,567.65 €", "EUR"), 1234567.65);
    //   assert.deepEqual(curSvc.parse("1,234,567.65 €", "EUR"), 1234567.65);
    //   assert.throws(function () {
    //     curSvc.parse("1234567.65 €", "OdooCoin");
    //   }, /currency not found/);
    //   assert.throws(function () {
    //     curSvc.parse("$ 1,234,567.65", "EUR");
    //   }, /not a correct 'EUR' monetary field/);
    // });
});
