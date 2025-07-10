import { Component, useState } from "@odoo/owl";


export class StockValuationReportLine extends Component {
    static template = "stock_account.StockValuationReport.InventoryValuationLine";
    static props = {
        class: { type: String, optional: true },
        label: String,
        level: { type: Number, optional: true },
        line: { type: Object, optional: true },
        sublines: { type: Array, optional: true },
        onClickMethod: { type: Function, optional: true },
        value: { type: Number, optional: true },
    };
    static defaultProps = {
        level: 0,
    };

    setup() {
        this.state = useState({ displaySublines: false });

        this.totalProps = {
            class: "total",
            label: this.env._t("Total"),
            level: this.props.level,
            value: this.props.value,
        };
        if (this.props.onClickMethod) {
            this.totalProps.onClickMethod = this.props.onClickMethod.bind(this);
        }
    }

    getSublineProps(line) {
        const props = {
            label: line.display_name,
            line: line,
            sublines: line.lines,
            level: this.props.level + 2,
            value: line.value,
        };
        if (this.props.onClickMethod) {
            props.onClickMethod = props.onClickMethod;
        }
        return props;
    }

    // Getters -----------------------------------------------------------------
    get cssClass() {
        let cssClass = this.props.class || "";
        cssClass += ` line_level_${this.props.level}`;
        return cssClass;
    }

    get displayTotalOnSeparateLine() {
        return Boolean(this.props.value && this.state.displaySublines);
    }

    get formattedValue() {
        return this.env.formatMonetary(this.props.value);
    }

    // On Click Methods --------------------------------------------------------
    onClick() {
        this.props.onClickMethod && this.props.onClickMethod(this.props.line);
    }

    onClickToggle() {
        if (this.props.sublines && this.props.sublines.length) {
            this.state.displaySublines = !this.state.displaySublines;
        }
    }
}

StockValuationReportLine.components = { StockValuationReportLine };
