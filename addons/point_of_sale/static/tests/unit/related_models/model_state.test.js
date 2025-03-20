import { expect, test, describe } from "@odoo/hoot";
import { createRelatedModels } from "@point_of_sale/app/models/related_models";
import { RAW_SYMBOL, STATE_SYMBOL } from "@point_of_sale/app/models/related_models/utils";
import { MODEL_DEF as modelDefs, MODEL_OPTS as modelOpts } from "./utils";

describe(`Model state`, () => {
    test("Value are stored in a state object", async () => {
        const { models } = createRelatedModels(modelDefs, {}, modelOpts);
        const order = models["pos.order"].create({ id: 99 });

        order.total = 9999;

        order.state_value = 2;
        expect(order.state_value).toBe(2);

        order.state_object = { value: "demo" };
        expect(order.state_object.value).toBe("demo");

        // Stored in state symbol
        expect(order[STATE_SYMBOL].state_value).toBe(2);
        expect(order[STATE_SYMBOL].state_object.value).toBe("demo");
        expect(order[RAW_SYMBOL].state_value).toBe(undefined);
        expect(order[RAW_SYMBOL].order).toBe(undefined);

        expect(order[RAW_SYMBOL].total).toBe(9999);
    });

    test("Extra fields", async () => {
        const { models } = createRelatedModels(modelDefs, {}, modelOpts);
        const order = models["pos.order"].create({
            id: 99,
            myCustomValue: "customValue",
            _extraField: "extra",
        });

        expect(order.myCustomValue).toBe(undefined);
        expect(order._extraField).toBe("extra");
        expect(order[STATE_SYMBOL].myCustomValue).toBe(undefined);
        expect(order[STATE_SYMBOL]._extraField).toBe("extra");

        //Extra from loaded data
        models.loadConnectedData({
            "pos.order": [
                {
                    id: 100,
                    extraField: "Value",
                    _extra: "1",
                },
            ],
        });

        //Not sorted in state but in raw
        const order2 = models["pos.order"].get(100);
        expect(order2[STATE_SYMBOL]).toBe(undefined);

        expect(order2[RAW_SYMBOL].extraField).toBe("Value");
        expect(order2[RAW_SYMBOL]._extra).toBe("1");
    });

    test("State values validation", async () => {
        const { models } = createRelatedModels(modelDefs, {}, modelOpts);
        const order = models["pos.order"].create({
            id: 99,
        });

        order.vDate = new Date();
        order.vString = "1";
        order.vNull = null;
        order.vSet = new Set(["1"]);
        order.vMap = new Map();
        order.vArray = [];
        order.vObject = { a: 1 };

        expect(() => {
            order.vFunction = () => "1";
        }).toThrow();

        expect(() => {
            // Not a plain object
            class Demo {}
            order.vNotPLainObject = new Demo();
        }).toThrow();

        expect(() => {
            order.vInObject = { a: () => 1 };
        }).toThrow();

        expect(() => {
            order.vInArray = [() => 1];
        }).toThrow();

        expect(() => {
            order.vDom = window;
        }).toThrow();

        expect(() => {
            const object = { a: 1 };
            object.b = object;
            order.vCircular = object;
        }).toThrow();

        expect(Object.keys(order[STATE_SYMBOL])).toEqual([
            "vDate",
            "vString",
            "vNull",
            "vSet",
            "vMap",
            "vArray",
            "vObject",
        ]);
    });
});
