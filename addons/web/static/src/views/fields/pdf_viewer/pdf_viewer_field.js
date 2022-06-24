/** @odoo-module **/

import { _lt } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { url } from "@web/core/utils/urls";
import { standardFieldProps } from "../standard_field_props";
import { FileUploader } from "../file_handler";

const { Component, onWillUpdateProps, useState } = owl;

export class PdfViewerField extends Component {
    setup() {
        this.notification = useService("notification");
        this.state = useState({
            fileName: this.props.fileName || "",
            isValid: true,
            objectUrl: "",
        });
        onWillUpdateProps((nextProps) => {
            if (nextProps.readonly) {
                this.state.fileName = "";
                this.state.objectUrl = "";
            }
        });
    }
    get file() {
        return {
            data: this.props.fileData,
            name: this.state.fileName || this.props.fileData || null,
        };
    }
    get url() {
        if (this.state.isValid && this.props.value) {
            return (
                "/web/static/lib/pdfjs/web/viewer.html?file=" +
                encodeURIComponent(
                    this.state.objectUrl ||
                        url("/web/content", {
                            model: this.props.resModel,
                            id: this.props.resId,
                            field: this.props.previewImage || this.props.name,
                        })
                ) +
                `#page=${this.props.defaultPage || 1}`
            );
        }
        return null;
    }
    onFileRemove() {
        this.state.isValid = true;
        this.props.update(false);
    }
    onFileUploaded(file) {
        this.state.fileName = file.name;
        this.state.isValid = true;
        this.props.update(file.data);
        this.state.objectUrl = file.objectUrl;
    }
    onLoadFailed() {
        this.state.isValid = false;
        this.notification.add(this.env._t("Could not display the selected pdf"), {
            type: "danger",
        });
    }
}

PdfViewerField.template = "web.PdfViewerField";
PdfViewerField.components = {
    FileUploader,
};
PdfViewerField.props = {
    ...standardFieldProps,
    defaultPage: { type: Number, optional: true },
    fileData: { type: String, optional: true },
    fileName: { type: String, optional: true },
    previewImage: { type: String, optional: true },
    resId: { type: [Number, Boolean], optional: true },
    resModel: { type: String, optional: true },
};
PdfViewerField.defaultProps = {
    fileData: "",
};

PdfViewerField.displayName = _lt("PDF Viewer");
PdfViewerField.supportedTypes = ["binary"];

PdfViewerField.extractProps = (fieldName, record, attrs) => {
    return {
        defaultPage: record.data[fieldName + "_page"],
        fileData: record.data[fieldName] || "",
        fileName: record.data[attrs.filename] || "",
        previewImage: attrs.options.preview_image,
        resId: record.resId,
        resModel: record.resModel,
    };
};

registry.category("fields").add("pdf_viewer", PdfViewerField);
