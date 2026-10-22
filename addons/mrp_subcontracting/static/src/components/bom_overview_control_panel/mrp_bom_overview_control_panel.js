import { patch } from "@web/core/utils/patch";
import { t } from "@odoo/owl";
import {
    BomOverviewControlPanel,
    bomOverviewControlPanelProps,
} from "@mrp/components/bom_overview_control_panel/mrp_bom_overview_control_panel";

Object.assign(bomOverviewControlPanelProps, {
    showsubcontractors: t.boolean().optional(),
    subcontractors: t.object().optional({}),
    changesubcontractor: t.function(),
    currentSubcontractorId: t.number().optional(),
});

patch(BomOverviewControlPanel.prototype, {
    getSubDomain() {
        const keys = Object.keys(this.props.subcontractors || {});
        return [["id", "in", keys]];
    },
});