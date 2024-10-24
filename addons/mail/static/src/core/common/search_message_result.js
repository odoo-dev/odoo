import { Component } from "@odoo/owl";
import { MessageCardList } from "./message_card_list";
import { _t } from "@web/core/l10n/translation";

/**
 * @typedef {Object} Props
 * @property {import("@mail/core/common/thread_model").Thread} thread
 * @property {import("@mail/core/common/message_model").Message} [messages]
 * @property {Object} [messaageSearch]
 * @property {function} [onClickJump]
 */
export class SearchMessageResult extends Component {
    static template = "mail.SearchMessageResult";
    static components = { MessageCardList };
    static props = ["thread", "messageSearch", "messages", "onClickJump"];

    setup() {
        super.setup();
    }

    get MESSAGE_FOUND() {
        if (this.props.messageSearch.messages.length === 0) {
            return false;
        }
        return _t("%s messages found", this.props.messageSearch.count);
    }

    onLoadMoreVisible() {
        const before = this.props.messaageSearch.messages
            ? Math.min(...this.props.messaageSearch.messages.map((message) => message.id))
            : false;
        this.props.messaageSearch.search(before);
    }
}
