/* @odoo-module */

import { Component, useState } from "@odoo/owl";
import { ComposerSuggestedRecipient } from "@mail/new/composer/composer_suggested_recipient";

/**
 * @typedef {Object} Props
 * @property {import("@mail/new/core/thread_model").Thread} thread
 * @property {string} className
 * @property {string} styleString
 * @property {boolean} hasFollowers
 * @extends {Component<Props, Env>}
 */
export class ComposerSuggestedRecipientsList extends Component {
    static template = "mail.composer_suggested_recipients_list";
    static components = { ComposerSuggestedRecipient };
    static props = ["thread", "className", "styleString", "hasFollowers?"];

    setup() {
        this.state = useState({
            showMore: false,
        });
    }

    get suggestedRecipients() {
        if (!this.state.showMore) {
            return this.props.thread.suggestedRecipients.slice(0, 3);
        }
        return this.props.thread.suggestedRecipients;
    }

    onClickShowMore() {
        this.state.showMore = true;
    }

    onClickShowLess() {
        this.state.showMore = false;
    }
}
