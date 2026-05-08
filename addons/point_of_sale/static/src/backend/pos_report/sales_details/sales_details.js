import { Component, onWillStart, useEffect } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { debounce } from "@web/core/utils/timing";
import { ControlPanel } from "@web/search/control_panel/control_panel";
import { standardActionServiceProps } from "@web/webclient/actions/action_service";
import { PosReportFilters } from "@point_of_sale/backend/pos_report/filters/pos_report_filters";
import { usePosReport } from "@point_of_sale/backend/pos_report/pos_report_store";

export class PosSalesDetailsReport extends Component {
    static template = "point_of_sale.PosSalesDetailsReport";
    static props = { ...standardActionServiceProps };
    static path = this.props.action.path;
    static components = { ControlPanel, PosReportFilters };
    static filterConfig = [
        {
            type: "date_range",
            fields: ["date_start", "date_stop"],
        },
        {
            type: "multi_select",
            field: "config_ids",
            model: "pos.config",
            label: "Point of Sale",
        },
    ];

    setup() {
        this.store = usePosReport();
        this.store.setFilterConfig(this.constructor.filterConfig);
        this.fetchReport = debounce(() => this.loadData(), 300);

        onWillStart(async () => {
            await this.store.fetchAndRegisterTemplates(
                this.props.actionId,
                "report.point_of_sale.report_saledetails",
                "get_report_templates"
            );
        });

        useEffect(
            () => {
                this.fetchReport();
            },
            () => [this.store.filterChanged]
        );
    }

    get reportParams() {
        const filters = this.store.filters;
        return {
            date_start: filters.date_start,
            date_stop: filters.date_stop,
            config_ids: filters.config_ids,
        };
    }

    async export_pdf() {
        await this.store.action.doAction({
            type: "ir.actions.report",
            report_name: "point_of_sale.report_saledetails",
            report_type: "qweb-pdf",
            data: this.reportParams,
        });
    }

    async loadData() {
        const { date_start, date_stop, config_ids } = this.reportParams;
        await this.store.loadData(this.props.actionId, {
            model: "report.point_of_sale.report_saledetails",
            method: "get_sale_details",
            params: [date_start, date_stop, config_ids],
        });
        this.store.renderTemplates(this.props.actionId);
    }
}

registry.category("actions").add("report_saledetails", PosSalesDetailsReport);
