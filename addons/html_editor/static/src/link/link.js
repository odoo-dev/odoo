// import { _t } from "@web/core/l10n/translation";
import { Component, useRef, useState, onMounted } from "@odoo/owl";
import { useOverlay } from "../core/overlay_plugin";

export class LinkPopover extends Component {
    static template = "html_editor.linkPopover";
    static props = {
        // overlay props
        dispatch: Function,
        offset: Function,
        el: {
            validate: (el) => el.nodeType === Node.ELEMENT_NODE,
        },
        // link props
        linkState: Object,
    };
    setup() {
        console.log(this.props.linkState.linkElement);
        // const ref = useRef("root");
        this.urlInput = useRef("urlInput");
        this.state = useState({
            editing: this.props.linkState.linkElement.href ? false : true,
            url: this.props.linkState.linkElement.href || "",
        });
        this.overlay = useOverlay("root", { position: "bottom" });
        onMounted(() => {
            // this.urlInput.el.focus(); // Focus on the input by default
        });
    }
    onClickApply() {
        this.state.editing = false;
        this.props.linkState.linkElement.href = this.state.url;
        this.overlay.close();
    }
    onClickEdit() {
        this.state.editing = true;
        this.state.url = this.props.linkState.linkElement.href;
    }
}
