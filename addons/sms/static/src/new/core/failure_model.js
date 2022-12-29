/** @odoo-module */

import { Failure } from "@mail/new/core/failure_model";
import { _t } from "@web/core/l10n/translation";
import { patch } from "@web/core/utils/patch";

patch(Failure.prototype, "sms/failure_model", {
    get iconSrc() {
        if (this.type === "sms") {
            return "/sms/static/img/sms_failure.svg";
        }
        return this._super();
    },
    get body() {
        if (this.type === "sms") {
            return _t("An error occurred when sending an SMS");
        }
        return this._super();
    },
});
