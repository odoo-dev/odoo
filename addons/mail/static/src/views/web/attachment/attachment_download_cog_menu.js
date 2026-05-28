import { DropdownItem } from "@web/core/dropdown/dropdown_item";
import { download } from "@web/core/network/download";
import { registry } from "@web/core/registry";
import { STATIC_ACTIONS_GROUP_NUMBER } from "@web/search/action_menus/action_menus";

import { Component } from "@odoo/owl";

const cogMenuRegistry = registry.category("cogMenu");

export class AttachmentDownloadCogMenu extends Component {
    static template = "mail.AttachmentDownloadCogMenu";
    static components = { DropdownItem };
    static props = {};

    get attachmentIds() {
        const root = this.env.model.root;
        if (this.env.config.viewType === "list") {
            return root.selection.map((r) => r.resId);
        }
        return root.records.map((r) => r.resId);
    }

    onDownload() {
        return download({
            url: "/mail/attachment/zip",
            data: {
                file_ids: this.attachmentIds.join(","),
                zip_name: "attachments.zip",
            },
        });
    }
}

export const attachmentDownloadCogMenuItem = {
    Component: AttachmentDownloadCogMenu,
    groupNumber: STATIC_ACTIONS_GROUP_NUMBER,
    isDisplayed: (env) => {
        if (env.config.resModel !== "ir.attachment") {
            return false;
        }
        const root = env.model.root;
        if (env.config.viewType === "list") {
            return root.selection.length > 0;
        }
        if (env.config.viewType === "kanban") {
            return root.records.length > 0;
        }
        return false;
    },
};

cogMenuRegistry.add("attachment-download-menu", attachmentDownloadCogMenuItem, { sequence: 20 });
