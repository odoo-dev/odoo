import { _t } from "@web/core/l10n/translation";
import { Component, useState } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";
import { browser } from "@web/core/browser/browser";

export class LinkPopover extends Component {
    static template = "html_editor.linkPopover";
    static props = {
        linkEl: { validate: (el) => el.nodeType === Node.ELEMENT_NODE },
        onApply: Function,
        onRemove: Function,
        onCopy: Function,
    };
    setup() {
        this.state = useState({
            editing: this.props.linkEl.href ? false : true,
            url: this.props.linkEl.href || "",
            label: this.props.linkEl.textContent || "",
        });
        this.notificationService = useService("notification");
    }
    onClickApply() {
        this.state.editing = false;
        if (this.state.label === "") {
            this.state.label = this.state.url;
        }
        this.props.onApply(this.state.url, this.state.label);
    }
    onClickEdit() {
        this.state.editing = true;
        this.state.url = this.props.linkEl.href;
        this.state.label = this.props.linkEl.textContent;
    }
    async onClickCopy(ev) {
        ev.preventDefault();
        await browser.navigator.clipboard.writeText(this.props.linkEl.href || "");
        this.notificationService.add(_t("Link copied to clipboard."), {
            type: "success",
        });
        this.props.onCopy();
    }
    onClickRemove() {
        this.props.onRemove();
    }
}
