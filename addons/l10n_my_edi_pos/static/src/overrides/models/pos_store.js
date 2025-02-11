/** @odoo-module */

import { PosStore } from "@point_of_sale/app/store/pos_store";
import { patch } from "@web/core/utils/patch";

patch(PosStore.prototype, {
    //@override
    async _processData(loadedData) {
        await super._processData(...arguments);
        if (this.company.country?.code === 'MY') {
            this.l10n_my_identification_type = loadedData["l10n_my_identification_type"];
        }
    },
});
