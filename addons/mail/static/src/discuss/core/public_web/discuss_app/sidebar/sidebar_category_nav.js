import { ChannelLazyLoad } from "@mail/discuss/core/common/channel_lazy_load";

import { Component } from "@odoo/owl";
import { useLayoutEffect, useState } from "@web/owl2/utils";
import { browser } from "@web/core/browser/browser";
import { useService } from "@web/core/utils/hooks";
import { exprToBoolean } from "@web/core/utils/strings";

const PANEL_OPEN_STORAGE_KEY = "mail.SidebarCategoryNav.isPanelOpen";

/**
 * @typedef {Object} Props
 * @extends {Component<Props, Env>}
 */
export class SidebarCategoryNav extends Component {
    static template = "mail.SidebarCategoryNav";
    static props = {};
    static components = { ChannelLazyLoad };

    setup() {
        super.setup();
        this.store = useService("mail.store");
        this.command = useService("command");
        this.action = useService("action");
        const storedPanelOpen = browser.localStorage.getItem(PANEL_OPEN_STORAGE_KEY);
        this.state = useState({
            activeCategoryId: null,
            isPanelOpen: storedPanelOpen !== null ? exprToBoolean(storedPanelOpen) : false,
        });
        useLayoutEffect(
            (categoryId) => {
                if (categoryId) {
                    this.state.activeCategoryId = categoryId;
                }
            },
            () => [this.store.discuss.thread?.channel?.discussAppCategory?.id]
        );
    }

    get categories() {
        return this.store.discuss.allCategories.filter((category) => !category.hidden);
    }

    get systemCategories() {
        return this.categories.filter((category) => category.technical_key);
    }

    get customCategories() {
        return this.categories.filter((category) => !category.technical_key);
    }

    get mailboxes() {
        const list = [];
        if (this.store.self_user?.notification_type === "inbox") {
            list.push(this.store.inbox);
        }
        list.push(this.store.bookmarkBox);
        if (this.store.self_user?.notification_type === "inbox") {
            list.push(this.store.history);
        }
        return list;
    }

    get activeCategory() {
        return (
            this.categories.find((category) => category.id === this.state.activeCategoryId) ??
            this.categories[0]
        );
    }

    mailboxIcon(mailbox) {
        switch (mailbox.id) {
            case "inbox":
                return "fa fa-inbox";
            case "bookmark":
                return "fa fa-bookmark-o";
            case "history":
                return "fa fa-history";
        }
        return "fa fa-folder";
    }

    onClickCategory(category) {
        this.state.activeCategoryId = category.id;
        if (!this.state.isPanelOpen) {
            this.openSidebar();
        }
    }

    openSidebar() {
        this.state.isPanelOpen = true;
        browser.localStorage.setItem(PANEL_OPEN_STORAGE_KEY, true);
    }

    closeSidebar() {
        this.state.isPanelOpen = false;
        browser.localStorage.setItem(PANEL_OPEN_STORAGE_KEY, false);
    }

    onClickMailbox(mailbox) {
        mailbox.setAsDiscussThread();
    }

    onClickSearch() {
        this.command.openMainPalette({ searchValue: "@" });
    }

    onClickNewMeeting() {
        this.store.startMeeting();
    }

    onClickViewHiddenConversations() {
        this.action.doAction("mail.discuss_my_conversations_action");
    }
}
