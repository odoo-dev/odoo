import { patch } from "@web/core/utils/patch";
import { DataServiceOptions } from "@point_of_sale/app/models/data_service_options";

patch(DataServiceOptions.prototype, {
    get databaseTable() {
        return {
            ...super.databaseTable,
            "pos.history.line": {
                key: "pos_line_uuid",
                condition: (record) => record.order_id?.canBeRemovedFromIndexedDB,
            },
        };
    },
    get dynamicModels() {
        return [...super.dynamicModels, "pos.history.line"];
    },
    get databaseIndex() {
        return {
            ...super.databaseIndex,
            "pos.history.line": ["pos_line_uuid"],
        };
    },
    get pohibitedAutoLoadedModels() {
        // Cannot be auto-loaded can cause infinite loop
        return [...super.pohibitedAutoLoadedModels, "pos.history.line"];
    },
});
