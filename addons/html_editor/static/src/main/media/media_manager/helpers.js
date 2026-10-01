export const IMAGE_MIMETYPES = [
    "image/jpg",
    "image/jpeg",
    "image/jpe",
    "image/png",
    "image/svg+xml",
    "image/gif",
    "image/webp",
];
export const VIDEO_MIMETYPES = ["video/mp4", "video/webm", "video/ogg"]; // todo : to validate

export const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".jpe", ".png", ".svg", ".gif", ".webp"];

export const ATTACHMENT_FIELDS = [
    "id",
    "name",
    "mimetype",
    "description",
    "checksum",
    "url",
    "type",
    "res_id",
    "res_model",
    "public",
    "access_token",
    "image_src",
    "image_width",
    "image_height",
    "original_id",
];

export const QUERRY_ORDERS_BY = {
    recent: "id desc",
    oldest: "id asc",
};

export class QueryHelper {
    constructor(props) {
        this.props = props;
    }

    search(query) {
        return ["name", "ilike", query || ""]; // todo need to be in another array ?
    }

    get recordDomain() {
        return [
            "|",
            ["public", "=", true],
            "&",
            ["res_model", "=", this.props.resModel],
            ["res_id", "=", this.props.resId || 0],
        ];
    }

    get imagesDomain() {
        const domain = [["mimetype", "in", IMAGE_MIMETYPES]];
        if (!this.props.useMediaLibrary) {
            domain.push(
                "|",
                ["url", "=", false],
                "!",
                "|",
                ["url", "=ilike", "/html_editor/shape/%"],
                ["url", "=ilike", "/web_editor/shape/%"]
            );
        }
        domain.push("!", ["name", "=like", "%.crop"]);
        domain.push("|", ["type", "=", "binary"]);
        domain.push("!", ["url", "=like", "/%/static/%"]);

        // Optimized images (meaning they are related to an `original_id`) can
        // only be shown in debug mode as the toggler to make those images
        // appear is hidden when not in debug mode.
        // There is thus no point in fetching those optimized images outside debug
        // mode. Worst, it leads to bugs: it might fetch only optimized images
        // when clicking on "load more" which will look like it's bugged as no
        // images will appear on screen (they all will be hidden).
        if (!this.props?.env?.debug) {
            const subDomain = [false];

            // Particular exception: if the edited image is an optimized
            // image, we need to fetch it too so it's displayed as the
            // selected image when opening the media dialog.
            // We might get a few more optimized images than necessary if the
            // original image has multiple optimized images, but it's not a
            // big deal.
            const originalId = this.props.media && this.props.media.dataset.originalId;
            if (originalId) {
                subDomain.push(originalId);
            }

            domain.push(["original_id", "in", subDomain]);
        }

        return domain;
    }
}
