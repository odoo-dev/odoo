// @ts-check

/**
 * Apply multiple global filter values in a single batch operation,
 * with a fallback to individual updates if the batch fails.
 *
 * @param {import("@spreadsheet").OdooSpreadsheetModel} model
 * @param {import("@spreadsheet").SetManyGlobalFilterValueCommand["filters"]} filters
 */
export function SET_MANY_GLOBAL_FILTER_VALUE(model, filters) {
    const result = model.dispatch("SET_MANY_GLOBAL_FILTER_VALUE", { filters });
    if (!result.isSuccessful) {
        for (const { filterId, value } of filters) {
            model.dispatch("SET_GLOBAL_FILTER_VALUE", {
                id: filterId,
                value,
            });
        }
    }
}
