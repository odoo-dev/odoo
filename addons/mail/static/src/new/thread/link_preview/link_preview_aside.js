/* @odoo-module */

import { useService } from "@web/core/utils/hooks";
import { Component } from "@odoo/owl";
import { LinkPreviewConfirmDelete } from "./link_preview_confirm_delete";

/**
 * @typedef {Object} Props
 * @property {import("@mail/new/core/link_preview_model").LinkPreview} linkPreview
 * @property {string} [className]
 * @extends {Component<Props, Env>}
 */
export class LinkPreviewAside extends Component {
    static props = ["linkPreview", "className?"];
    static template = "mail.link_preview_aside";

    setup() {
        this.dialogService = useService("dialog");
    }

    onClick() {
        this.dialogService.add(LinkPreviewConfirmDelete, {
            linkPreview: this.props.linkPreview,
            LinkPreviewListComponent: this.env.LinkPreviewListComponent,
        });
    }
}
