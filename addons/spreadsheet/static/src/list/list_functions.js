import { _t } from "@web/core/l10n/translation";
import { helpers, registries, EvaluationError } from "@odoo/o-spreadsheet";
import { sprintf } from "@web/core/utils/strings";
import { LOADING_ERROR } from "@spreadsheet/data_sources/data_source";

const { arg, toString, toNumber } = helpers;
const { functionRegistry } = registries;

//--------------------------------------------------------------------------
// Spreadsheet functions
//--------------------------------------------------------------------------

function assertListsExists(listId, getters) {
    if (!getters.isExistingList(listId)) {
        throw new EvaluationError(sprintf(_t('There is no list with id "%s"'), listId));
    }
}

const ODOO_LIST = {
    description: _t("Get the value from a list."),
    args: [
        arg("list_id (string)", _t("ID of the list.")),
        arg("index (string)", _t("Position of the record in the list.")),
        arg("field_name (string)", _t("Name of the field.")),
    ],
    category: "Odoo",
    compute: function (listId, index, fieldName) {
        const id = toString(listId);
        const position = toNumber(index, this.locale) - 1;
        const _fieldName = toString(fieldName);
        assertListsExists(id, this.getters);
        return this.getters.getListCellValueAndFormat(id, position, _fieldName);
    },
    returns: ["NUMBER", "STRING"],
};

// This cache should be invalidated when EVALUATE_CELLS is triggered
// or even better, when a new command/event/whatever "CLEAR_CACHES"
// is triggered. (I see it useful when we want to force a refresh of
// a data source)
const ASYNC_CACHE = {};

function computeAsync(ctx, name, args, fn) {
    const key = name + JSON.stringify(args);
    if (!ASYNC_CACHE[key]) {
        fn.bind(ctx)(...args).then((result) => {
            ASYNC_CACHE[key] = result;
            //Trigger recompute, but of course there should be a cleaner way in ctx
            ctx.odooDataProvider.trigger("data-source-updated");
        });
        return LOADING_ERROR;
    }
    return ASYNC_CACHE[key];
}

// function computeList(listId, fieldName) {
//     const id = toString(listId);
//     const field = toString(fieldName);
//     assertListsExists(id, this.getters);
//     return this.getters.getListHeaderValue(id, field);
// }

async function computeList(listId, fieldName) {
    // Cannot try right now because computeList is not async and returns
    // directly a value or an error
    return `${toString(listId)} - ${toString(fieldName)}`;
}

const ODOO_LIST_HEADER = {
    description: _t("Get the header of a list."),
    args: [
        arg("list_id (string)", _t("ID of the list.")),
        arg("field_name (string)", _t("Name of the field.")),
    ],
    category: "Odoo",
    compute: function (listId, fieldName) {
        return computeAsync(this, "LIST_HEADER", [listId, fieldName], computeList);
    },
    returns: ["NUMBER", "STRING"],
};

functionRegistry.add("ODOO.LIST", ODOO_LIST);
functionRegistry.add("ODOO.LIST.HEADER", ODOO_LIST_HEADER);
