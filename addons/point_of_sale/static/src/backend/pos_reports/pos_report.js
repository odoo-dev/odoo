import { Component } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { standardActionServiceProps } from "@web/webclient/actions/action_service";
import { ControlPanel } from "@web/search/control_panel/control_panel";
import { PosReportFilters } from "./filters/pos_report_filters";
import { usePosReport } from "./pos_report_store";

export class PosReportController extends Component {
    static template = "point_of_sale.PosReport";
    static props = { ...standardActionServiceProps };
    static path = this.props.action.path;
    static components = { ControlPanel, PosReportFilters };

    setup() {
        this.store = usePosReport();
    }

    get cssCustomClass() {
        return this.props?.action?.context?.report_name || "";
    }

    get getComponentName() {
        const reportName = this.props?.action?.context?.report_name;
        if (reportName) {
            return registry.category("actions").get(reportName).component;
        }
        return null;
    }
}

registry.category("actions").add("pos_report", PosReportController);
