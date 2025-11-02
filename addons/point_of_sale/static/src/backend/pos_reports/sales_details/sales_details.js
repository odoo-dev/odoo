import { Component, onWillStart, useEffect } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { formatCurrency as webFormatCurrency } from "@web/core/currency";
import { usePosReport } from "../pos_report_store";

export class PosSalesDetailsReport extends Component {
    static template = "point_of_sale.PosSalesDetailsReport";

    setup() {
        this.store = usePosReport();

        onWillStart(async () => {
            await this.loadData();
        });

        useEffect(
            () => {
                this.loadData();
            },
            () => [this.store.filterChanged]
        );
    }

    formatMonetary(price) {
        return webFormatCurrency(price, this.store.data.currency.id);
    }

    async loadData() {
        const filters = this.store.filters;
        const params = {
            date_start: filters.date_start,
            date_stop: filters.date_stop,
            config_ids: filters.config_ids || [],
        };

        await this.store.fetchData({
            model: "report.point_of_sale.report_saledetails",
            method: "get_sale_details",
            args: [params.date_start, params.date_stop, params.config_ids, false],
        });
    }
}

registry.category("actions").add("pos_sales_details", {
    component: PosSalesDetailsReport,
});
