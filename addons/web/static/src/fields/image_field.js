/** @odoo-module **/

import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { url } from "@web/core/utils/urls";
import { _lt } from "@web/core/l10n/translation";
import { FileUploader } from "./file_handler";
import { standardFieldProps } from "./standard_field_props";

const { Component, useState } = owl;

export const fileTypeMagicWordMap = {
    "/": "jpg",
    R: "gif",
    i: "png",
    P: "svg+xml",
};
const placeholder = "/web/static/img/placeholder.png";

function isBinarySize(value) {
    return /^\d+(\.\d*)? [^0-9]+$/.test(value);
}

export class ImageField extends Component {
    setup() {
        this.notification = useService("notification");
        this.state = useState({
            isValid: true,
        });
    }
    get url() {
        if (this.state.isValid && this.props.value) {
            if (isBinarySize(this.props.value)) {
                const previewFieldName = this.props.previewImage || this.props.name;
                return url("/web/image", {
                    model: this.props.record.resModel,
                    id: this.props.record.resId,
                    field: previewFieldName,
                });
            } else {
                // Use magic-word technique for detecting image type
                const magic = fileTypeMagicWordMap[this.props.value[0]] || "png";
                return `data:image/${magic};base64,${this.props.value}`;
            }
        }
        return placeholder;
    }
    get sizeStyle() {
        let style = "";
        if (this.props.width) {
            style += `max-width: ${this.props.width}px;`;
        }
        if (this.props.height) {
            style += `max-height: ${this.props.height}px;`;
        }
        return style;
    }

    onFileRemove() {
        this.state.isValid = true;
        this.props.update(false);
    }
    onFileUploaded(info) {
        this.state.isValid = true;
        this.props.update(info.data);
    }
    onLoadFailed() {
        this.state.isValid = false;
        this.notification.add(this.env._t("Could not display the selected image"), {
            type: "danger",
        });
    }
}

ImageField.template = "web.ImageField";
ImageField.props = {
    ...standardFieldProps,
    previewImage: { type: String, optional: true },
    acceptedFileExtensions: { type: String, optional: true },
    width: { type: Number, optional: true },
    height: { type: Number, optional: true },
};
ImageField.defaultProps = {
    acceptedFileExtensions: "image/*",
};
ImageField.components = {
    FileUploader,
};
(ImageField.displayName = _lt("Image")),
    (ImageField.supportedTypes = ["binary"]),
    (ImageField.convertAttrsToProps = (attrs) => {
        return {
            previewImage: attrs.preview_image,
            acceptedFileExtensions: attrs.options.accepted_file_extensions,
            width: attrs.options.size && attrs.options.size[0],
            height: attrs.options.size && attrs.options.size[1],
        };
    });

registry.category("fields").add("image", ImageField);
