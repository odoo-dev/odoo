/** @odoo-module **/

import { LinkPreviewAside } from "@mail/new/thread/link_preview/link_preview_aside";

import { Component } from "@odoo/owl";

/**
 * @typedef {Object} Props
 * @property {import("@mail/new/core/link_preview_model").LinkPreview} linkPreview
 * @property {boolean} canBeDeleted
 * @extends {Component<Props, Env>}
 */
export class LinkPreviewVideo extends Component {}

Object.assign(LinkPreviewVideo, {
    template: "mail.link_preview_video",
    components: { LinkPreviewAside },
    props: ["linkPreview", "canBeDeleted"],
});
