/** @odoo-module */

import { PartnerDetailsEdit } from "@point_of_sale/app/screens/partner_list/partner_editor/partner_editor";
import { patch } from "@web/core/utils/patch";

patch(PartnerDetailsEdit.prototype, {
    setup() {
        super.setup(...arguments);
        this.changes.l10n_my_identification_number = this.props.partner.l10n_my_identification_number;
        this.changes.l10n_my_edi_malaysian_tin = this.props.partner.l10n_my_edi_malaysian_tin;
        this.changes.l10n_my_identification_type = this.getPartnerMyIdentificationType();
    },
    getPartnerMyIdentificationType() {
        return (
            this.props.partner.l10n_my_identification_type &&
            this.pos.l10n_my_identification_type.find(
                (type) => type.value === this.props.partner.l10n_my_identification_type
            )?.value
        );
    },
});
