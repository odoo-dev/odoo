/** @odoo-module **/

import { localization } from "@web/core/l10n/localization";
import {
    formatFloat,
    formatFloatFactor,
    formatFloatTime,
    formatInteger,
    formatMany2one,
} from "@web/fields/format";
import { defaultLocalization } from "../helpers/mock_services";
import { patchWithCleanup } from "../helpers/utils";

QUnit.module("Format Fields", (hooks) => {
    hooks.beforeEach(() => {
        patchWithCleanup(localization, defaultLocalization);
    });

    QUnit.test("formatFloat", function (assert) {
        patchWithCleanup(localization, { grouping: [3, 3, 3, 3] });
        assert.strictEqual(formatFloat(1000000), "1,000,000.00");

        patchWithCleanup(localization, { grouping: [3, 2, -1] });
        assert.strictEqual(formatFloat(106500), "1,06,500.00");

        patchWithCleanup(localization, { grouping: [1, 2, -1] });
        assert.strictEqual(formatFloat(106500), "106,50,0.00");

        patchWithCleanup(localization, {
            grouping: [3, 0],
            decimalPoint: ",",
            thousandsSep: ".",
        });
        assert.strictEqual(formatFloat(6000), "6.000,00");
        assert.strictEqual(formatFloat(false), "");
    });

    QUnit.test("formatFloatFactor", function (assert) {
        assert.strictEqual(formatFloatFactor(false), "");
        assert.strictEqual(formatFloatFactor(6000), "6,000.00");
        assert.strictEqual(formatFloatFactor(6000, null, { factor: 3 }), "18,000.00");
        assert.strictEqual(formatFloatFactor(6000, null, { factor: 0.5 }), "3,000.00");
    });

    QUnit.test("formatFloatTime", function (assert) {
        assert.strictEqual(formatFloatTime(2), "02:00");
        assert.strictEqual(formatFloatTime(3.5), "03:30");
        assert.strictEqual(formatFloatTime(0.25), "00:15");

        assert.strictEqual(formatFloatTime(-0.5), "-00:30");

        const options = { noLeadingZeroHour: true };
        assert.strictEqual(formatFloatTime(2, null, options), "2:00");
        assert.strictEqual(formatFloatTime(3.5, null, options), "3:30");
        assert.strictEqual(formatFloatTime(-0.5, null, options), "-0:30");
    });

    QUnit.test("formatInteger", function (assert) {
        patchWithCleanup(localization, { grouping: [3, 3, 3, 3] });
        assert.strictEqual(formatInteger(1000000), "1,000,000");

        patchWithCleanup(localization, { grouping: [3, 2, -1] });
        assert.strictEqual(formatInteger(106500), "1,06,500");

        patchWithCleanup(localization, { grouping: [1, 2, -1] });
        assert.strictEqual(formatInteger(106500), "106,50,0");

        assert.strictEqual(formatInteger(0), "0");
        assert.strictEqual(formatInteger(false), "");
    });

    QUnit.test("formatMany2one", function (assert) {
        assert.strictEqual(formatMany2one(null), "");
        assert.strictEqual(formatMany2one([1, "A M2O value"]), "A M2O value");
        assert.strictEqual(
            formatMany2one({
                data: { display_name: "A M2O value" },
            }),
            "A M2O value"
        );

        assert.strictEqual(
            formatMany2one([1, "A M2O value"], null, { escape: true }),
            "A%20M2O%20value"
        );
        assert.strictEqual(
            formatMany2one(
                {
                    data: { display_name: "A M2O value" },
                },
                null,
                { escape: true }
            ),
            "A%20M2O%20value"
        );
    });
});
