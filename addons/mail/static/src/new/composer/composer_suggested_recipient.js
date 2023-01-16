/* @odoo-module */

import { Component } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";
import { sprintf } from "@web/core/utils/strings";
import { FormViewDialog } from "@web/views/view_dialogs/form_view_dialog";

/**
 * @typedef {Object} Props
 * @property {import("@mail/new/core/thread_model").Thread} thread
 * @property {import("@mail/new/core/thread_model").SuggestedReciptient} suggestedRecipient
 * @extends {Component<Props, Env>}
 */
export class ComposerSuggestedRecipient extends Component {
    static template = "mail.composer_suggested_recipient";
    static props = ["thread", "suggestedRecipient"];

    setup() {
        this.dialogService = useService("dialog");
        /** @type {import("@mail/new/views/chatter_service").ChatterService)}*/
        this.chatterService = useService("mail.chatter");
    }

    get titleText() {
        return sprintf(
            this.env._t("Add as recipient and follower (reason: %s)"),
            this.props.suggestedRecipient.reason
        );
    }

    onChangeCheckbox() {
        if (this.props.suggestedRecipient.persona) {
            this.props.suggestedRecipient.checked = !this.props.suggestedRecipient.checked;
        }
    }

    onClick() {
        if (!this.props.suggestedRecipient.persona) {
            // Recipients must always be partners. On selecting a suggested
            // recipient that does not have a partner, the partner creation form
            // should be opened.
            this.dialogService.add(FormViewDialog, {
                context: {
                    active_id: this.props.thread.id,
                    active_model: "mail.compose.message",
                    default_email: this.props.suggestedRecipient.email,
                    default_name: this.props.suggestedRecipient.name,
                    default_lang: this.props.suggestedRecipient.lang,
                    force_email: true,
                    ref: "compound_context",
                },
                onRecordSaved: () => this._onDialogSaved(),
                resModel: "res.partner",
                title: this.env._t("Please complete customer's information"),
            });
        }
    }

    async _onDialogSaved() {
        const suggestedRecipients = await this.chatterService.fetchData(
            this.props.thread.id,
            this.props.thread.model,
            ["suggestedRecipients"]
        );
        this.chatterService.loadSuggestedRecipients(
            this.props.thread,
            suggestedRecipients.suggestedRecipients
        );
    }
}
