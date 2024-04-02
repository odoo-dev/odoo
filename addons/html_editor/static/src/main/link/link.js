import { Component, useRef, useState } from "@odoo/owl";

export class LinkPopover extends Component {
    static template = "html_editor.linkPopover";
    static props = {
        linkState: Object,
        overlay: Object,
    };
    setup() {
        this.urlInput = useRef("urlInput");
        this.state = useState({
            editing: this.props.linkState.linkElement.href ? false : true,
            url: this.props.linkState.linkElement.href || "",
        });
    }
    onClickApply() {
        this.state.editing = false;
        this.props.linkState.linkElement.href = this.state.url;
        this.props.overlay.close();
    }
    onClickEdit() {
        this.state.editing = true;
        this.state.url = this.props.linkState.linkElement.href;
    }
}
