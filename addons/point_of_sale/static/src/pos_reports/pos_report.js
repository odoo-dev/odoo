import { registry } from "@web/core/registry";
import { Component, useProps, t, onWillStart, providePlugins } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";
import { ControlPanel } from "@web/search/control_panel/control_panel";

import { PosReportPlugin, usePosReport } from "./pos_report_plugin";
import { PosReportFilters } from "./components/filters/filters";
import { Header } from "./components/header/header";
import { TreeNode } from "./components/tree_node/tree_node";

const posReportComponentRegistry = registry.category("pos_report_components");

export class PosReport extends Component {
    static template = "pos_reports.PosReport";
    static components = {
        ControlPanel,
        PosReportFilters,
        Header,
        TreeNode,
    };
    props = useProps({
        action: t.object(),
    });

    setup() {
        providePlugins([PosReportPlugin], {
            action: this.props.action,
            ui: useService("ui"),
        });
        this.report = usePosReport();

        onWillStart(async () => {
            if (this.report.reportId) {
                await this.report.loadReport();
            }
        });
    }

    getComponent(name) {
        const matches = posReportComponentRegistry
            .getEntries()
            .filter(
                ([_, value]) => value.slot === name && value.report === this.report.meta()?.name
            );

        if (matches.length) {
            return matches[matches.length - 1][1].component;
        }

        return PosReport.components[name];
    }
}

registry.category("actions").add("pos_report", PosReport);
