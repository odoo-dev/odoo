/* @odoo-module */

import { Component } from "@odoo/owl";
import { LinkPreviewAside } from "./link_preview_aside";

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
