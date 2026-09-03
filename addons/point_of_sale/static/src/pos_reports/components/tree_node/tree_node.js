import { Component, useProps, types as t } from "@odoo/owl";
import { usePosReport } from "../../pos_report_plugin";
import { formatCurrency } from "@web/core/currency";
import { formatFloat } from "@web/core/utils/numbers";

export class TreeNode extends Component {
    static template = "pos_reports.TreeNode";
    static components = { TreeNode };

    props = useProps({
        line: t.object(),
        columns: t.array(t.object()),
        currency: t.object(),
        getComponent: t.function(),
    });

    setup() {
        this.report = usePosReport();
    }

    get currentLine() {
        return this.props.line;
    }

    get lineClasses() {
        const classes = [];
        const style = this.currentLine.style;
        if (style === "bold") {
            classes.push("fw-bold");
        }
        if (this.currentLine.foldability === "expanded") {
            classes.push("o_report_unfolded");
        }
        const level = this.currentLine.level;
        if (level !== undefined && level !== null) {
            classes.push(`line_level_${level}`);
        }
        return classes.join(" ");
    }

    get isFoldable() {
        return this.currentLine.foldability !== "static";
    }

    async toggleFold() {
        if (!this.isFoldable) {
            return;
        }
        await this.report.toggleUnfold(this.currentLine, this.props.columns);
    }

    getColumnValue(colId) {
        return this.currentLine.values[colId];
    }

    getFormattedValue(column) {
        const value = this.getColumnValue(column.id);

        if (value === null || value === undefined) {
            return "";
        }

        const currency = this.props.currency;
        switch (column.type) {
            case "monetary":
                return formatCurrency(value, currency.id);

            case "float":
                return formatFloat(value, {
                    digits: [69, currency.decimal_places],
                });

            case "integer":
                return formatFloat(value, {
                    digits: [69, 0],
                });

            default:
                return String(value);
        }
    }
}
