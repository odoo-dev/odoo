import { patch } from "@web/core/utils/patch";
import { BomOverviewControlPanel } from "@mrp/components/bom_overview_control_panel/mrp_bom_overview_control_panel";

patch(BomOverviewControlPanel.prototype, {
    get subcontractorItems() {
        return this.props.data.subcontractors.map((partner) => ({
            id: partner.id,
            label: partner.name,
            class: { selected: partner.id === this.props.data.subcontractor_id },
            onSelected: () => this.env.overviewBus.trigger("change-subcontractor", partner.id),
        }));
    },

    get currentSubcontractorName() {
        const partner = this.props.data.subcontractors.find(
            (p) => p.id === this.props.data.subcontractor_id
        );
        return partner.name;
    },
});
