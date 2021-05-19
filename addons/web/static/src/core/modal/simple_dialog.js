/** @odoo-module */

import { useModal } from "./modal_hook";

export class SimpleDialog extends owl.Component {
    setup() {
        useModal({
            contentClass: this.props.contentClass,
            fullscreen: this.props.fullscreen,
            renderFooter: this.props.renderFooter,
            renderHeader: this.props.renderHeader,
            size: this.props.size,
            technical: this.props.technical,
            title: this.props.title,
            buttons: this.props.buttons,
        });
    }
}
SimpleDialog.props = {
    contentClass: { type: String, optional: true },
    fullscreen: Boolean,
    renderFooter: Boolean,
    renderHeader: Boolean,
    size: {
        type: String,
        validate: (s) => ["modal-xl", "modal-lg", "modal-md", "modal-sm"].includes(s),
    },
    technical: Boolean,
    title: String,
    buttons: {
        type: Array,
        element: {
            type: Object,
            shape: {
                name: { type: String },
                icon: { type: String, optional: true },
                primary: { type: Boolean, optional: true },
                onClick: Function,
            },
        },
    },
};
SimpleDialog.defaultProps = {
    fullscreen: false,
    renderFooter: true,
    renderHeader: true,
    size: "modal-lg",
    technical: true,
    title: "Odoo",
    buttons: [
        {
            name: "Ok",
            primary: true,
            onClick: close,
        },
    ],
};
SimpleDialog.template = "web.SimpleDialog";

owl.QWeb.registerComponent("SimpleDialog", SimpleDialog);
