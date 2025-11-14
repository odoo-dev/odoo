import { ClosePosPopup } from "@point_of_sale/app/components/popups/closing_popup/closing_popup";

import { patch } from "@web/core/utils/patch";
import { companyStateDialog } from "@l10n_in_pos/app/components/popups/company_state_dialog/company_state_dialog";
import { productHsnDialog } from "@l10n_in_pos/app/components/popups/product_hsn_dialog/product_hsn_dialog";

patch(ClosePosPopup.prototype, {
    async confirm() {
        const products = await this.pos.data.searchRead("product.template", [["available_in_pos", "=", true], ["l10n_in_hsn_code", "=", false], ["taxes_id", "!=", false]], ["id"]);
        if (products) {
            this.dialog.add(productHsnDialog);
            return;
        }
        debugger;
        await this.pos.data.read("res.company", [this.pos.company.id]);
        if (this.pos.company.country_id?.code === "IN" && !this.pos.company.state_id) {
            this.dialog.add(companyStateDialog);
            return;
        }
        return await super.confirm();
    },
});
