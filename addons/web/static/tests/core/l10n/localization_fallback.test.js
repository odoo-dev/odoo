import { describe, expect, test } from "@odoo/hoot";
import { makeTestApp } from "@web/../tests/web_test_helpers";
import { localization } from "@web/core/l10n/localization";
import { getFallbackLangParameters } from "@web/core/l10n/localization_plugin";

describe.current.tags("headless");

describe("offline locale fallback", () => {
    test("derives number separators and grouping from the locale instead of assuming en-US", () => {
        const french = getFallbackLangParameters("fr-BE");
        expect(french.decimal_point).toBe(",");
        expect(french.thousands_sep).not.toBe(",");

        const english = getFallbackLangParameters("en-US");
        expect(english.decimal_point).toBe(".");
        expect(english.thousands_sep).toBe(",");
        expect(english.grouping).toBe("[3,0]");

        // 12,34,56,789
        expect(getFallbackLangParameters("hi-IN").grouping).toBe("[3,2,0]");
    });

    test("derives the date field order from the locale", () => {
        expect(getFallbackLangParameters("en-US").date_format.indexOf("%m")).toBeLessThan(
            getFallbackLangParameters("en-US").date_format.indexOf("%d")
        );
        expect(getFallbackLangParameters("fr-BE").date_format.indexOf("%d")).toBeLessThan(
            getFallbackLangParameters("fr-BE").date_format.indexOf("%m")
        );
    });

    test("always returns every parameter localization requires", () => {
        for (const locale of ["fr-BE", "en-US", "ar-SA", "not-a-real-locale"]) {
            const params = getFallbackLangParameters(locale);
            for (const key of [
                "date_format",
                "time_format",
                "decimal_point",
                "direction",
                "grouping",
                "thousands_sep",
                "week_start",
            ]) {
                expect(params[key] ?? null).not.toBe(null, {
                    message: `${key} missing for ${locale}`,
                });
            }
            expect(() => JSON.parse(params.grouping)).not.toThrow();
        }
    });

    test("reports right-to-left direction for RTL locales", () => {
        expect(getFallbackLangParameters("ar-SA").direction).toBe("rtl");
        expect(getFallbackLangParameters("fr-BE").direction).toBe("ltr");
    });

    test("is not applied over the parameters fetched from the server", async () => {
        // The mock server sends "%H:%M:%S", the fallback for "en" would use a 12-hour clock
        await makeTestApp();
        expect(localization.timeFormat).toBe("HH:mm:ss");
    });
});
