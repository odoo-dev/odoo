import { patch } from "@web/core/utils/patch";
import { ResPartner } from "@point_of_sale/../tests/unit/data/res_partner.data";

patch(ResPartner.prototype, {
    _load_pos_data_fields() {
        return [...super._load_pos_data_fields(), "additional_identifiers"];
    },
});
