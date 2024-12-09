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
        this.tagExists = this.checkTagExistence();
        this.toShowTax = this.toShowTax();
        this.toShowAmount = this.toShowAmount();
        usePosition("accountTaxDropdown", () => this.widgetRef.el);
    }

    closeAccountTaxPopup() {
        this.state.showDropdown = false;
    }

    checkTagExistence() {
        if (Object.values(this.props.allTaxes)[0].tax_tag_ids) {
            return Object.values(this.props.allTaxes).some(
                (tax) => tax.tax_tag_ids && tax.tax_tag_ids.length > 0
            );
        }
        return Object.values(this.props.allTaxes).some(
            (tax) => tax.base_tag_ids && tax.base_tag_ids.length > 0
        );
    }

    toShowTax() {
        if (Object.values(this.props.allTaxes)[0].tax_tag_ids) {
            return Object.values(this.props.allTaxes).some((tax) => tax.name);
        }
        return Object.values(this.props.allTaxes).some((tax) => tax.name);
    }

    toShowAmount() {
        if (Object.values(this.props.allTaxes)[0].tax_tag_ids) {
            return Object.values(this.props.allTaxes).some((tax) => tax.tax_amount);
        }
        return Object.values(this.props.allTaxes).some((tax) => tax.tax_amount);
    }

}