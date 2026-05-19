import { discussSidebarItemsRegistry } from "@mail/core/public_web/discuss_app/sidebar/sidebar";
import { SidebarCategoryNav } from "@mail/discuss/core/public_web/discuss_app/sidebar/sidebar_category_nav";

import { Component } from "@odoo/owl";

import { useService } from "@web/core/utils/hooks";

/**
 * @typedef {Object} Props
 * @extends {Component<Props, Env>}
 */
export class DiscussSidebarCategories extends Component {
    static template = "mail.DiscussSidebarCategories";
    static props = {};
    static components = { SidebarCategoryNav };

    setup() {
        super.setup();
        this.store = useService("mail.store");
        this.discusscorePublicWebService = useService("discuss.core.public.web");
        this.orm = useService("orm");
    }
}

discussSidebarItemsRegistry.add("channels", DiscussSidebarCategories, { sequence: 30 });
