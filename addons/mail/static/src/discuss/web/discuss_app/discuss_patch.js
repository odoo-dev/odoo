/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { Sidebar } from "@mail/discuss/web/discuss_app/sidebar";
import { Discuss } from "@mail/discuss/discuss_app/discuss";
import { MessagingMenu } from "@mail/discuss/web/messaging_menu/messaging_menu";

patch(Discuss, "mail/web", {
    components: { ...Discuss.components, Sidebar, MessagingMenu },
});
