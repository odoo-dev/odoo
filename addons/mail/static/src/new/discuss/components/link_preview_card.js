/** @odoo-module **/

import { LinkPreviewAside } from "@mail/new/discuss/components/link_preview_aside";

import { Component } from "@odoo/owl";

/**
 * @typedef {Object} Props
 * @property {import("@mail/new/core/link_preview_model").LinkPreview} linkPreview
 * @property {boolean} [canBeDeleted]
 * @extends {Component<Props, Env>}
 */
export class LinkPreviewCard extends Component {}

Object.assign(LinkPreviewCard, {
    template: "mail.link_preview_card",
    components: { LinkPreviewAside },
    props: ["linkPreview", "canBeDeleted"],
});
