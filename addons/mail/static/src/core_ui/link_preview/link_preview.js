/* @odoo-module */

import { useService } from "@web/core/utils/hooks";
import { Component } from "@odoo/owl";
import { LinkPreviewConfirmDelete } from "./link_preview_confirm_delete";

/**
 * @typedef {Object} Props
 * @property {import("@mail/core/link_preview_model").LinkPreview} linkPreview
 * @property {boolean} [deletable]
 * @extends {Component<Props, Env>}
 */
export class LinkPreview extends Component {
    static template = "mail.LinkPreview";
    static props = ["linkPreview", "deletable"];
    static components = {};

    setup() {
        this.dialogService = useService("dialog");
    }

    onClick() {
        this.dialogService.add(LinkPreviewConfirmDelete, {
            linkPreview: this.props.linkPreview,
            LinkPreview,
        });
    }
}
