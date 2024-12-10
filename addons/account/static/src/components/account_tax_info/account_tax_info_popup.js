import { Component, useState, useRef } from "@odoo/owl";
import { usePosition } from "@web/core/position/position_hook";

export class AccountTaxPopup extends Component {
    static template = "account.AccountTaxPopup";
    static props = {
        id: { type: Number },
        allTaxes: { type: Object },
        close: { type: Function },
    };

    setup() {
        this.state = useState({
            showDropdown: true,
        });
        this.widgetRef = useRef("accountTax");
        this.taxTagExists = this.checkTagExistence();
        this.baseTagExists = this.checkBaseTagExistence();
        this.toShowTax = this.toShowTax();
        this.toShowAmount = this.toShowAmount();
        usePosition("accountTaxDropdown", () => this.widgetRef.el);
    }

    closeAccountTaxPopup() {
        this.state.showDropdown = false;
    }

    checkTagExistence() {
        return Object.values(this.props.allTaxes).some(
            (tax) => tax.tax_tag_ids && tax.tax_tag_ids.length > 0
        );
    }

    checkBaseTagExistence() {
        return Object.values(this.props.allTaxes).some(
            (tax) => tax.base_tag_ids && tax.base_tag_ids.length > 0
        );
    }

    toShowTax() {
        return Object.values(this.props.allTaxes).some((tax) => tax.name);
    }

    toShowAmount() {
        return Object.values(this.props.allTaxes).some((tax) => tax.tax_amount);
    }
}
