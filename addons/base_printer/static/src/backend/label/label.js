import { Component } from "@odoo/owl";

const EPSON_FORMAT_SIZE = {
    "dymo": { width: 2.2, height: 1.2 },
    "2x7": { width: 2.25, height: 1.25 },
    "4x7": { width: 1.5, height: 1.25 },
    "4x12": { width: 1.25, height: 1.0 },
    "4x12_no_price": { width: 1.25, height: 1.0 },
};

const DPI = 203;

export class PrintLabel extends Component {
    static template = "point_of_sale.print_lable";
    static props = {
        product: { type: Object },
        label_template: { type: String },
    };

    get labelSize() {
        const template = this.props.label_template || "2x7";
        const size = EPSON_FORMAT_SIZE[template] || EPSON_FORMAT_SIZE["2x7"];
        return {
            width: size.width * DPI,
            height: size.height * DPI,
        };
    }

    get barcodeSize() {
        return {
            width: this.labelSize.width * 0.7,
            height: this.labelSize.height * 0.3,
        };
    }

    get fontSize() {
        const isSmall = this.props.label_template === "4x12" || this.props.label_template === "4x12_no_price";
        return isSmall ? 18 : 22;
    }
}
