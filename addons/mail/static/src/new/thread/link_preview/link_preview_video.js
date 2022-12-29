/* @odoo-module */

import { Component } from "@odoo/owl";
import { LinkPreviewAside } from "./link_preview_aside";

/**
 * @typedef {Object} Props
 * @property {import("@mail/new/core/link_preview_model").LinkPreview} linkPreview
 * @property {boolean} deletable
 * @extends {Component<Props, Env>}
 */
export class LinkPreviewVideo extends Component {
    static components = { LinkPreviewAside };
    static props = ["linkPreview", "deletable"];
    static template = "mail.link_preview_video";
}
