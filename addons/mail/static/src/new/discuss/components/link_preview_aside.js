/** @odoo-module **/

import { LinkPreviewConfirmDelete } from "@mail/new/discuss/components/link_preview_confirm_delete";

import { Component } from "@odoo/owl";

import { useService } from "@web/core/utils/hooks";

/**
 * @typedef {Object} Props
 * @property {import("@mail/new/core/link_preview_model").LinkPreview} linkPreview
 * @property {string} [className]
 * @extends {Component<Props, Env>}
 */
export class LinkPreviewAside extends Component {
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

Object.assign(LinkPreviewAside, {
    template: "mail.link_preview_aside",
    props: ["linkPreview", "className?"],
});
