/* @odoo-module */

import { useMessaging } from "@mail/new/messaging_hook";
import { Component } from "@odoo/owl";
import { Dialog } from "@web/core/dialog/dialog";

import { _t } from "@web/core/l10n/translation";

export class MessageDeleteDialog extends Component {
    static components = { Dialog };
    static props = ["close", "message", "messageComponent"];
    static template = "mail.message.delete";

    setup() {
        this.messaging = useMessaging();
        this.title = _t("Confirmation");
    }

    onClickDelete() {
        this.messaging.deleteMessage(this.props.message);
        this.props.close();
    }
}
