/** @odoo-module */

import { AbstractAwaitablePopup } from "@point_of_sale/app/popup/abstract_awaitable_popup";
import { _lt } from "@web/core/l10n/translation";

export class ConfirmPopup extends AbstractAwaitablePopup {
    static template = "ConfirmPopup";
    static defaultProps = {
        confirmText: _t("Ok"),
        cancelText: _t("Cancel"),
        title: _t("Confirm?"),
        body: "",
    };
}
