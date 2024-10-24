import { Component, useState, onWillUpdateProps } from "@odoo/owl";
import { ActionPanel } from "@mail/discuss/core/common/action_panel";
import { _t } from "@web/core/l10n/translation";
import { useService } from "@web/core/utils/hooks";
import { SearchMessageInputBar } from "@mail/core/common/search_message_input_bar";
import { SearchMessageResult } from "@mail/core/common/search_message_result";

/**
 * @typedef {Object} Props
 * @property {import("@mail/core/common/thread_model").Thread} thread
 * @property {function} [closeSearch]
 * @property {function} [onClickJump]
 */
export class SearchMessagesPanel extends Component {
    static template = "mail.SearchMessagesPanel";
    static components = { ActionPanel, SearchMessageInputBar, SearchMessageResult };
    static props = ["thread", "closSearch?", "onClickJump"];

    setup() {
        super.setup();
        this.store = useState(useService("mail.store"));
        onWillUpdateProps((nextProps) => {
            if (this.props.thread.notEq(nextProps.thread)) {
                this.env.searchMenu?.close();
            }
        });
    }

    get title() {
        return _t("Search Message");
    }
}
