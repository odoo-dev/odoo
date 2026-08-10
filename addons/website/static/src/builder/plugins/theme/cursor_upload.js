import { _t } from "@web/core/l10n/translation";
import { rpc } from "@web/core/network/rpc";
import { getDataURLFromFile } from "@web/core/utils/urls";
import { svgToPNG, webpToPNG } from "@website/js/utils";

export const CURSOR_MAX_SIZE = 32;
export const CURSOR_MAX_BYTES = 1024 * 1024;
export const CURSOR_ACCEPT = "image/png,image/svg+xml,image/webp,image/gif";

const SAFE_IMAGE_SRC = /^\/web\/image\/[\w.%-]+(?:\/[\w.%-]+)*$/;

/**
 * @param {string} accept
 * @returns {Promise<File|null>} null if the user cancelled
 */
function selectLocalImage(accept) {
    return new Promise((resolve) => {
        const inputEl = document.createElement("input");
        inputEl.type = "file";
        inputEl.accept = accept;
        inputEl.style.display = "none";
        document.body.appendChild(inputEl);
        const done = () => {
            const file = inputEl.files?.[0] || null;
            inputEl.remove();
            resolve(file);
        };
        inputEl.addEventListener("change", done, { once: true });
        inputEl.addEventListener("cancel", done, { once: true });
        inputEl.click();
    });
}

/**
 * Asks for a local image and turns it into a public attachment usable as a CSS
 * cursor. The media dialog is deliberately not used here: the conversion to PNG
 * has to happen *before* the attachment is created.
 *
 * @param {Object} services
 * @param {Object} services.notification
 * @returns {Promise<Object|null>} the attachment media info, or null if the
 *      user cancelled or the file was rejected
 */
export async function pickAndUploadCursorImage({ notification }) {
    const file = await selectLocalImage(CURSOR_ACCEPT);
    if (!file) {
        return null;
    }
    if (file.size > CURSOR_MAX_BYTES) {
        notification.add(
            _t("The cursor image is too large. Please use a file smaller than 1 MB."),
            {
                title: file.name,
                type: "warning",
            }
        );
        return null;
    }

    let dataURL;
    try {
        dataURL = await getDataURLFromFile(file);
        if (dataURL.startsWith("data:image/svg+xml")) {
            // Safari does not support SVG cursors at all and Chrome requires
            // intrinsic dimensions on the <svg> root, so SVG is always
            // rasterized.
            dataURL = await svgToPNG(dataURL);
        } else if (dataURL.startsWith("data:image/webp")) {
            // image_process() refuses to resize WEBP, which would leave us with
            // an oversized cursor the browser ignores.
            dataURL = await webpToPNG(dataURL);
        }
    } catch {
        notification.add(_t("This image could not be read."), {
            title: file.name,
            type: "danger",
        });
        return null;
    }

    const extension = dataURL.startsWith("data:image/gif") ? "gif" : "png";
    const attachment = await rpc("/html_editor/attachment/add_data", {
        // The file name is part of the stored URL, hence of the generated SCSS:
        // never forward the one chosen by the user.
        name: `website_cursor_${Date.now()}.${extension}`,
        data: dataURL.split(",")[1],
        is_image: true,
        width: CURSOR_MAX_SIZE,
        height: CURSOR_MAX_SIZE,
    });

    if (attachment.error) {
        notification.add(attachment.error, { title: file.name, type: "danger" });
        return null;
    }
    if (!attachment.image_src || !SAFE_IMAGE_SRC.test(attachment.image_src)) {
        notification.add(_t("This image cannot be used as a cursor."), {
            title: file.name,
            type: "danger",
        });
        return null;
    }
    return attachment;
}
