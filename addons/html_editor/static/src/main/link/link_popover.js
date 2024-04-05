import { Component, useState } from "@odoo/owl";

export class LinkPopover extends Component {
    static template = "html_editor.linkPopover";
    static props = {
        linkEl: { validate: (el) => el.nodeType === Node.ELEMENT_NODE },
        onApply: Function,
        dispatch: Function,
        close: Function,
    };
    setup() {
        this.state = useState({
            editing: this.props.linkEl.href ? false : true,
            url: this.props.linkEl.href || "",
        });
    }
    onClickApply() {
        this.state.editing = false;
        this.props.onApply(this.state.url);
        this.props.dispatch("RESTORE_SELECTION");
    }
    onClickEdit() {
        this.state.editing = true;
        this.state.url = this.props.linkEl.href;
    }
    onClickRemove() {
        this.props.dispatch("REMOVE_LINK");
        this.props.close();
        // todo selection is not restored after removing a link
        this.props.dispatch("RESTORE_SELECTION");
    }
}
