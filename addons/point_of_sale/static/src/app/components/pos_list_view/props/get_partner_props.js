import { _t } from "@web/core/l10n/translation";
import { PartnerNameCell } from "../cells/partner_name_cell";
import { PartnerContactCell } from "../cells/partner_contact_cell";
import { PartnerInfoCell } from "../cells/partner_info_cell";
import { PartnerActionCell } from "../cells/partner_action_cell";

export const getPartnerProps = (pos) => {
    const listAction = { label: _t("Create"), action: () => pos.editPartner() };
    const createBtn = pos.cashier._role !== "minimal" ? listAction : false;
    const selectedId = pos.getOrder().partner_id?.id;
    return {
        header: true,
        headerTitle: _t("Choose customer"),
        headerAction: createBtn,
        onClick: (partner) => pos.setPartnerToCurrentOrder(partner),
        records: pos.models["res.partner"].getAll(),
        value: selectedId,
        fields: [
            {
                type: "component",
                component: PartnerNameCell,
            },
            {
                type: "char",
                formatter: (record) => record.pos_contact_address,
            },
            {
                type: "component",
                component: PartnerContactCell,
            },
            {
                type: "component",
                component: PartnerInfoCell,
            },
            {
                type: "action",
                component: PartnerActionCell,
                classes: {
                    mobile: "float-right float-start",
                },
            },
        ],
    };
};
