import { Component, onWillStart, signal, usePlugin } from "@odoo/owl";
import { PosReport } from "@point_of_sale/pos_reports/pos_report";
import { usePosReport } from "@point_of_sale/pos_reports/pos_report_plugin";
import { ActionPlugin } from "@web/webclient/actions/action_plugin";

export class PrintToPrinterButton extends Component {
    static template = "printer_pos.PrintToPrinterButton";

    setup() {
        this.report = usePosReport();
        this.action = usePlugin(ActionPlugin);
        this.hasPrinters = signal(false);
        onWillStart(async () => {
            const count = await this.report.orm.searchCount("ir.actions.report", [
                ["model", "=", "pos.report"],
                ["printer_ids", "!=", false],
            ]);
            this.hasPrinters.set(count > 0);
        });
    }

    async print() {
        const action = await this.report.orm.call(
            "pos.report",
            "print_to_printer",
            [[this.report.reportId]],
            { data: this.report.options() }
        );
        await this.action.doAction(action);
    }
}

Object.assign(PosReport.components, { PrintToPrinterButton });
