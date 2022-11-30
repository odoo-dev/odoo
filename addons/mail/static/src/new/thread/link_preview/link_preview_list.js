/** @odoo-module **/

import { Component } from "@odoo/owl";
import { LinkPreviewCard } from "@mail/new/thread/link_preview/link_preview_card";
import { LinkPreviewImage } from "@mail/new/thread/link_preview/link_preview_image";
import { LinkPreviewVideo } from "@mail/new/thread/link_preview/link_preview_video";

/**
 * @typedef {Object} Props
 * @property {import("@mail/new/core/link_preview_model").LinkPreview[]} linkPreviews
 * @property {boolean} [canBeDeleted]
 * @extends {Component<Props, Env>}
 */
export class LinkPreviewList extends Component {
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

Object.assign(LinkPreviewList, {
    template: "mail.link_preview_list",
    components: { LinkPreviewCard, LinkPreviewImage, LinkPreviewVideo },
    defaultProps: {
        canBeDeleted: false,
    },
    props: ["linkPreviews", "canBeDeleted?"],
});
