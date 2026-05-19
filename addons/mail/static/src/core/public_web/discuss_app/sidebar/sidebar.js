import { useSubEnv } from "@web/owl2/utils";
import { ActionList } from "@mail/core/common/action_list";
import { DiscussSearch } from "@mail/core/public_web/discuss_search";

import { Component } from "@odoo/owl";

import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";

export const discussSidebarItemsRegistry = registry.category("mail.discuss_sidebar_items");

/**
 * @typedef {Object} Props
 * @extends {Component<Props, Env>}
 */
export class DiscussSidebar extends Component {
    static template = "mail.DiscussSidebar";
    static props = {};
    static components = { ActionList, DiscussSearch };

    setup() {
        super.setup();
        this.store = useService("mail.store");
        this.ui = useService("ui");
        useSubEnv({ inDiscussSidebar: true });
    }

    get discussSidebarItems() {
        return discussSidebarItemsRegistry.getAll();
    }

    onClickViewHiddenConversations() {
        this.env.services.action.doAction("mail.discuss_my_conversations_action");
    }
}
