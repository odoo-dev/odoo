import { registry } from "@web/core/registry";
import { standardFieldProps } from "@web/views/fields/standard_field_props";
import { getVideoThumbnailUrl } from "@html_editor/main/media/video/video_providers";
import { Component, signal, useProps } from "@odoo/owl";

/**
 * The thumbnail of a platform's video, on the `url` field of its card. The
 * play icon is displayed over it, or alone when the platform has no thumbnail.
 *
 * The thumbnail is loaded after the card is rendered: some platforms (Vimeo)
 * have to be asked for it. The url of an attachment does not change.
 */
export class VideoThumbnailField extends Component {
    static template = "html_editor.VideoThumbnailField";
    props = useProps(standardFieldProps);
    thumbnailUrl = signal("");

    setup() {
        const url = this.props.record.data[this.props.name];
        if (url) {
            getVideoThumbnailUrl(url).then((thumbnailUrl) => this.thumbnailUrl.set(thumbnailUrl));
        }
    }
}

export const videoThumbnailField = {
    component: VideoThumbnailField,
    supportedTypes: ["char"],
};

registry.category("fields").add("media_manager_video_thumbnail", videoThumbnailField);
