/** @ts-check */

import { expect, test } from "@odoo/hoot";
import { SET_MANY_GLOBAL_FILTER_VALUE } from "@spreadsheet/global_filters/global_filters_actions";

const FILTERS = [
    { filterId: "f1", value: "foo" },
    { filterId: "f2", value: "bar" },
];

const createMockModel = (success) => {
    const calls = [];
    return {
        model: {
            dispatch(action, payload) {
                calls.push({ action, payload });
                return {
                    isSuccessful: action === "SET_MANY_GLOBAL_FILTER_VALUE" ? success : true,
                };
            },
        },
        calls,
    };
};

test("SET_MANY_GLOBAL_FILTER_VALUE skips fallbacks when batch dispatch succeeds", () => {
    const { model, calls } = createMockModel(true);
    SET_MANY_GLOBAL_FILTER_VALUE(model, FILTERS);
    expect(calls).toEqual([
        {
            action: "SET_MANY_GLOBAL_FILTER_VALUE",
            payload: { filters: FILTERS },
        },
    ]);
});

test("SET_MANY_GLOBAL_FILTER_VALUE falls back to individual dispatches when batch fails", () => {
    const { model, calls } = createMockModel(false);
    SET_MANY_GLOBAL_FILTER_VALUE(model, FILTERS);
    expect(calls).toEqual([
        {
            action: "SET_MANY_GLOBAL_FILTER_VALUE",
            payload: { filters: FILTERS },
        },
        {
            action: "SET_GLOBAL_FILTER_VALUE",
            payload: { id: "f1", value: "foo" },
        },
        {
            action: "SET_GLOBAL_FILTER_VALUE",
            payload: { id: "f2", value: "bar" },
        },
    ]);
});
