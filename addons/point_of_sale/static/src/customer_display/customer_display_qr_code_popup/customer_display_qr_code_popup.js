import { Component } from "@odoo/owl";
import { Dialog } from "@web/core/dialog/dialog";
import { qrCodeSrc } from "@point_of_sale/utils";
import { browser } from "@web/core/browser/browser";
import { _t } from "@web/core/l10n/translation";

export class QrCodeCustomerDisplay extends Component {
    static template = "point_of_sale.QrCodeCustomerDisplay";
    static components = { Dialog };
    static props = ["close", "qrCodeURL", "session"];

    get qrCode() {
        const baseUrl = this.props.session._base_url;
        return qrCodeSrc(`${baseUrl}${this.props.qrCodeURL}`);
    }

    get getCustomerDisplayURL() {
        return `${this.props.session._base_url}${this.props.qrCodeURL}`;
    }

    async onClickCopyURL(url) {
        const baseUrl = this.props.session._base_url;
        url = `${baseUrl}${this.props.qrCodeURL}`;
        await browser.navigator.clipboard.writeText(url);
        this.env.services.notification.add(_t("Link copied to clipboard."), {
            type: "success",
        });
    }
}
