import { patch } from "@web/core/utils/patch";
import { PartnerList } from "@point_of_sale/app/screens/partner_list/partner_list";

patch(PartnerList.prototype, {
    setup() {
        super.setup(...arguments);
    },
    isPhoneMixinApplied() {
        return true;
    },
});
