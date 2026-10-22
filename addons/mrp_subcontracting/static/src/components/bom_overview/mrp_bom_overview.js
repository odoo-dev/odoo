import { patch } from "@web/core/utils/patch";
import { BomOverviewComponent } from "@mrp/components/bom_overview/mrp_bom_overview";

patch(BomOverviewComponent.prototype, {
    setup() {
        super.setup();
        this.subcontractors = {};
        this.showsubcontractors = false;
        this.state.currentSubcontractorId = 0;
    },

    async initBomData() {
        await super.initBomData();
        const bomData = await this.getBomData();
        if (bomData["subcontractors"]) {
            this.subcontractors = bomData["subcontractors"];
            this.showsubcontractors = bomData["showsubcontractors"];
            const keys = Object.keys(this.subcontractors);
            this.state.currentSubcontractorId = Number(keys[0]);
        }
    },

    getExtraContext() {
        return {
            ...super.getExtraContext(),
            subcontract_id: this.state.currentSubcontractorId,
        };
    },

    async onChangeSubcontractor(subcontractorId) {
        if (this.state.currentSubcontractorId != subcontractorId) {
            this.state.currentSubcontractorId = subcontractorId;
            await this.getBomData();
        }
    },
});
