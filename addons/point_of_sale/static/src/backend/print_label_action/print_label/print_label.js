import { Component } from "@odoo/owl";

const EPSON_FORMAT_SIZE = {
    normal: { width: 2.25, height: 1.25 },
    small: { width: 1.25, height: 1.0 },
    alternative: { width: 2.0, height: 1.0 },
    jewelry: { width: 2.2, height: 0.5 },
};

const DPI = 203;

export class PrintLabel extends Component {
    static template = "point_of_sale.print_lable";
    static props = {
        product: { type: Object },
        epson_template: { type: String },
    };

    get labelSize() {
        const template = this.props.epson_template || "normal";
        const size = EPSON_FORMAT_SIZE[template] || EPSON_FORMAT_SIZE.normal;
        return {
            width: size.width * DPI,
            height: size.height * DPI,
        };
    }

    get barcodeSize() {
        const heightFactor = this.props.epson_template === "jewelry" ? 0.3 : 0.4;
        return {
            width: this.labelSize.width * 0.8,
            height: this.labelSize.height * heightFactor,
        };
    }

    get fontSize() {
        return this.props.epson_template === "jewelry" ? 18 : 22;
    }
}
