/* @odoo-module */

import { Component } from "@odoo/owl";
import { LinkPreviewCard } from "./link_preview_card";
import { LinkPreviewImage } from "./link_preview_image";
import { LinkPreviewVideo } from "./link_preview_video";

/**
 * @typedef {Object} Props
 * @property {import("@mail/new/core/link_preview_model").LinkPreview[]} linkPreviews
 * @property {boolean} [canBeDeleted]
 * @extends {Component<Props, Env>}
 */
export class LinkPreviewList extends Component {
    static components = { LinkPreviewCard, LinkPreviewImage, LinkPreviewVideo };
    static props = ["linkPreviews", "canBeDeleted?"];
    static defaultProps = {
        canBeDeleted: false,
    };
    static template = "mail.link_preview_list";

    get linkPreviewsImage() {
        return this.props.linkPreviews.filter((linkPreview) => linkPreview.isImage);
    }

    get linkPreviewsVideo() {
        return this.props.linkPreviews.filter((linkPreview) => linkPreview.isVideo);
    }

    get linkPreviewsCard() {
        return this.props.linkPreviews.filter((linkPreview) => linkPreview.isCard);
    }
}
