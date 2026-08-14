/** @odoo-module */

import { AbstractAwaitablePopup } from "@point_of_sale/app/popup/abstract_awaitable_popup";
import { _t } from "@web/core/l10n/translation";

/**
 * 17.0 has no ConfirmationDialog in the POS, and the standard ConfirmPopup escapes its body,
 * which would print the link to the faulty invoice as raw markup. This popup renders it.
 */
export class ZatcaErrorPopup extends AbstractAwaitablePopup {
    static template = "l10n_sa_edi_pos.ZatcaErrorPopup";
    static defaultProps = {
        confirmText: _t("Ok"),
        title: _t("ZATCA Validation Error"),
        body: "",
        cancelKey: false,
    };
}
