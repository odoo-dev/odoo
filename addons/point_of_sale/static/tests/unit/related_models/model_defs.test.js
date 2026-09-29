import { describe, expect, test } from "@odoo/hoot";
import { processModelDefs } from "@point_of_sale/app/models/related_models/model_defs";

describe.current.tags("headless");

describe("many2many inverse pairing", () => {
    test("fields sharing a relation table are paired together", () => {
        const [inverseMap] = processModelDefs({
            "a.model": {
                b_ids: { type: "many2many", relation: "b.model", relation_table: "a_b_rel" },
            },
            "b.model": {
                a_ids: { type: "many2many", relation: "a.model", relation_table: "a_b_rel" },
            },
        });

        const [field, inverse] = [...inverseMap.entries()][0];
        expect(field.relation_table).toBe("a_b_rel");
        expect(inverse.dummy).toBe(undefined);
    });

    test("non-stored fields with no relation table are never paired together", () => {
        const modelDefs = {
            "a.model": {
                b_ids: { type: "many2many", relation: "b.model", relation_table: "" },
            },
            "b.model": {
                a_ids: { type: "many2many", relation: "a.model", relation_table: "" },
                other_a_ids: { type: "many2many", relation: "a.model", relation_table: "" },
            },
        };

        expect(() => processModelDefs(modelDefs)).not.toThrow();

        const [, processed] = processModelDefs(modelDefs);
        const dummies = Object.values(processed["a.model"]).filter((f) => f.dummy);
        expect(dummies.length).toBe(2);
    });

    test("three fields sharing a real relation table still raise", () => {
        expect(() =>
            processModelDefs({
                "a.model": {
                    b_ids: { type: "many2many", relation: "b.model", relation_table: "a_b_rel" },
                },
                "b.model": {
                    a_ids: { type: "many2many", relation: "a.model", relation_table: "a_b_rel" },
                    a2_ids: { type: "many2many", relation: "a.model", relation_table: "a_b_rel" },
                },
            })
        ).toThrow();
    });
});
