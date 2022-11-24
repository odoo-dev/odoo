/** @odoo-module */

import { Component } from "@odoo/owl";
import { LinkPreviewAside } from "./link_preview_aside";

export class LinkPreviewImage extends Component {}

Object.assign(LinkPreviewImage, {
    template: "mail.link_preview_image",
    components: { LinkPreviewAside },
    props: ["linkPreview", "canBeDeleted"],
});
