import { _t } from "@web/core/l10n/translation";
import { Component, useState } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";
import { browser } from "@web/core/browser/browser";
import { deduceURLfromText } from "./utils";

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
        const deducedUrl = this.deduceUrl(this.state.url);
        this.state.url = deducedUrl
            ? this.correctLink(deducedUrl)
            : this.correctLink(this.state.url);
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

    /**
     * @private
     */
    correctLink(url) {
        if (url.indexOf("tel:") === 0) {
            url = url.replace(/^tel:([0-9]+)$/, "tel://$1");
        } else if (
            url &&
            !url.startsWith("mailto:") &&
            url.indexOf("://") === -1 &&
            url[0] !== "/" &&
            url[0] !== "#" &&
            url.slice(0, 2) !== "${"
        ) {
            url = "http://" + url;
        }
        return url;
    }
    deduceUrl(text) {
        text = text.trim();
        if (/^(https?:|mailto:|tel:)/.test(text)) {
            // Text begins with a known protocol, accept it as valid URL.
            return text;
        } else {
            return deduceURLfromText(text, this.props.linkEl) || "";
        }
    }
}
