import { Component } from "@odoo/owl";
import { browser } from "@web/core/browser/browser";
import { Dropdown } from "@web/core/dropdown/dropdown";
import { DropdownItem } from "@web/core/dropdown/dropdown_item";

import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { DISCUSS_SIDEBAR_COMPACT_LS } from "./discuss_app_model";

export const discussSidebarItemsRegistry = registry.category("mail.discuss_sidebar_items");

/**
 * @typedef {Object} Props
 * @extends {Component<Props, Env>}
 */
export class DiscussSidebar extends Component {
    static template = "mail.DiscussSidebar";
    static props = {};
    static components = { Dropdown, DropdownItem };

    setup() {
        super.setup();
        this.store = useService("mail.store");
    }

    get discussSidebarItems() {
        return discussSidebarItemsRegistry.getAll();
    }

    setIsSidebarCompact(value) {
        this.store.discuss.isSidebarCompact = value;
        if (value) {
            browser.localStorage.setItem(DISCUSS_SIDEBAR_COMPACT_LS, "true");
        } else {
            browser.localStorage.removeItem(DISCUSS_SIDEBAR_COMPACT_LS);
        }
    }
}
