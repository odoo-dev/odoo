/** @odoo-module alias=root.widget */

import { PublicRoot, createPublicRoot } from "@web/legacy/js/public/public_root";
import { LivechatRoot } from "@im_livechat/new/core/livechat_root";
import { makeRoot, makeShadow } from "@im_livechat/new/core/boot_helpers";
import { registry } from "@web/core/registry";
import { whenReady } from "@odoo/owl";
import { serverUrl } from "@im_livechat/livechat_data";
import { session } from "@web/session";

session.origin = serverUrl;
registry.category("main_components").remove("mail.ChatWindowContainer");

async function start() {
    await whenReady();
    const target = await makeShadow(makeRoot(document.body));
    registry
        .category("main_components")
        .add("im_livechat.LivechatRoot", { Component: LivechatRoot });
    return createPublicRoot(PublicRoot, { target });
}

export default start();
