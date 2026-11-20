import { patch } from "@web/core/utils/patch";
import { useBus } from "@web/core/utils/hooks";
import { BomOverviewComponent } from "@mrp/components/bom_overview/mrp_bom_overview";

patch(BomOverviewComponent.prototype, {
    setup() {
        super.setup();
        useBus(this.env.overviewBus, "change-subcontractor", (ev) =>
            this.onChangeSubcontractor(ev.detail)
        );
    },

    async onChangeSubcontractor(subcontractorId) {
        if (this.state.bomData.subcontractor_id != subcontractorId) {
            this.context = { ...this.context, bom_overview_subcontractor_id: subcontractorId };
            await this.getBomData();
        }
    },

    getReportName(printAll) {
        let reportName = super.getReportName(printAll);
        if (this.state.bomData.subcontractors && this.state.bomData.subcontractor_id) {
            reportName += "&subcontractor_id=" + this.state.bomData.subcontractor_id;
        }
        return reportName;
    },
});
