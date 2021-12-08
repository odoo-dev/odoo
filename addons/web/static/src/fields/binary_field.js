/** @odoo-module **/

import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { download } from "@web/core/network/download";
import { standardFieldProps } from "./standard_field_props";
import { FileDownloader, FileUploader } from "./file_handler";

const { Component } = owl;
const { useState } = owl.hooks;

function isBinarySize(value) {
    return /^\d+(\.\d*)? [^0-9]+$/.test(value);
}

export class BinaryField extends Component {
    setup() {
        this.notification = useService("notification");
        this.state = useState({
            file: {
                data: this.props.record.data[this.props.name],
                name:
                    this.props.record.data[this.props.attrs.filename] ||
                    this.props.attrs.filename ||
                    this.props.value,
            },
            isValid: true,
        });
    }
    async onFileDownload() {
        await download({
            data: {
                model: this.props.record.resModel,
                id: this.props.record.resId,
                field: this.props.name,
                filename_field: this.state.file.name,
                filename: this.state.file.name || "",
                download: true,
                data: isBinarySize(this.props.value) ? null : this.props.value,
            },
            url: "/web/content",
        });
    }
    onFileRemove() {
        this.state.file = {};
        this.state.isValid = true;
        this.props.update(false);
        this.props.update(false, { name: this.props.attrs.filename });
    }
    onFileUploaded(info) {
        this.state.file = info;
        this.state.isValid = true;
        this.props.update(info.data);
    }
    onLoadFailed() {
        this.state.isValid = false;
        this.notification.add(this.env._t("Could not display the selected binary"), {
            type: "danger",
        });
    }
}

BinaryField.components = {
    FileDownloader,
    FileUploader,
};
BinaryField.props = {
    ...standardFieldProps,
};
BinaryField.template = "web.BinaryField";

registry.category("fields").add("binary", BinaryField);
