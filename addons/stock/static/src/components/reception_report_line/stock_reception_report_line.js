/** @odoo-module **/

import { orm } from "@web/core/orm";
import { useService } from "@web/core/utils/hooks";
import { formatFloat } from "@web/core/utils/numbers";
import { Component } from "@odoo/owl";

export class ReceptionReportLine extends Component {
    static template = "stock.ReceptionReportLine";
    static props = {
        data: Object,
        parentIndex: String,
        showUom: Boolean,
        precision: Number,
    };

    setup() {
        this.actionService = useService("action");
        this.formatFloat = (val) => formatFloat(val, { digits: [false, this.props.precision] });
    }

    //---- Handlers ----

    async onClickForecast() {
        const action = await orm.call(
            "stock.move",
            "action_product_forecast_report",
            [[this.data.move_out_id]],
        );

        return this.actionService.doAction(action);
    }

    async onClickPrint() {
        if (!this.data.move_out_id) {
            return;
        }
        const reportFile = 'stock.report_reception_report_label';
        const modelIds = [this.data.move_out_id];
        const productQtys = [Math.ceil(this.data.quantity) || '1'];

        return this.actionService.doAction({
            type: "ir.actions.report",
            report_type: "qweb-pdf",
            report_name: `${reportFile}?docids=${modelIds}&quantity=${productQtys}`,
            report_file: reportFile,
        });
    }

    async onClickAssign() {
        await orm.call(
            "report.stock.report_reception",
            "action_assign",
            [false, [this.data.move_out_id], [this.data.quantity], [this.data.move_ins]],
        );
        this.env.bus.trigger("update-assign-state", { isAssigned: true, tableIndex: this.props.parentIndex, lineIndex: this.data.index });
    }

    async onClickUnassign() {
        const done = await orm.call(
            "report.stock.report_reception",
            "action_unassign",
            [false, this.data.move_out_id, this.data.quantity, this.data.move_ins]
        )
        if (done) {
            this.env.bus.trigger("update-assign-state", { isAssigned: false, tableIndex: this.props.parentIndex, lineIndex: this.data.index });
        }
    }

    //---- Getters ----

    get data() {
        return this.props.data;
    }
}
