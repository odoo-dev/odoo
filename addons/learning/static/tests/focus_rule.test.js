import { describe, expect, test } from "@odoo/hoot";
import { isFieldInFocus, pickTopImportant } from "@learning/focus/focus_rule";

describe.current.tags("headless");

const fields = {
    name: { type: "char" },
    default_code: { type: "char" },
    type: { type: "selection" },
    categ_id: { type: "many2one" },
    list_price: { type: "monetary" },
    sale_ok: { type: "boolean" },
};
const profile = { name: 105, categ_id: 6, type: 6, sale_ok: 2, list_price: 2, default_code: 2, unknown: 9 };

function top(overrides = {}) {
    return pickTopImportant({
        profile,
        fields,
        learnedTypes: new Set(["char", "selection", "boolean"]),
        learnedFields: new Set(),
        cap: 10,
        ...overrides,
    });
}

describe("pickTopImportant", () => {
    test("keeps important fields whose type is learned", () => {
        expect([...top()]).toEqual(["name", "type", "default_code", "sale_ok"]);
    });

    test("a field met in a lesson counts even if its type is not mastered", () => {
        expect(top({ learnedFields: new Set(["categ_id"]) }).has("categ_id")).toBe(true);
    });

    test("the cap limits known fields, always-important ones come on top", () => {
        expect([...top({ cap: 1 })]).toEqual(["name", "type"]);
        expect([...top({ cap: 0 })]).toEqual(["name"]);
    });

    test("ignores fields the record does not have", () => {
        expect(top().has("unknown")).toBe(false);
    });
});

describe("isFieldInFocus", () => {
    const context = { targets: new Set(["categ_id"]), topImportant: new Set(["name"]) };
    const field = (name, flags = {}) => ({ name, required: false, empty: false, invalid: false, ...flags });

    test("lesson targets and important known fields are in focus", () => {
        expect(isFieldInFocus(field("categ_id"), context)).toBe(true);
        expect(isFieldInFocus(field("name"), context)).toBe(true);
        expect(isFieldInFocus(field("list_price"), context)).toBe(false);
    });

    test("required fields are in focus only while empty", () => {
        expect(isFieldInFocus(field("uom_id", { required: true, empty: true }), context)).toBe(true);
        expect(isFieldInFocus(field("uom_id", { required: true, empty: false }), context)).toBe(false);
    });

    test("an invalid field is always in focus", () => {
        expect(isFieldInFocus(field("list_price", { invalid: true }), context)).toBe(true);
    });
});
