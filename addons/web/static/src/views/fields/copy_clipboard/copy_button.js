/** @odoo-module **/

import { browser } from "@web/core/browser/browser";
import { Tooltip } from "@web/core/tooltip/tooltip";
import { useService } from "@web/core/utils/hooks";

const { Component, useRef } = owl;
export class CopyButton extends Component {
    setup() {
        this.button = useRef("button");
        this.popover = useService("popover");
    }

    showTooltip() {
        const closeTooltip = this.popover.add(this.button.el, Tooltip, {
            tooltip: this.props.successText,
        });
        browser.setTimeout(() => {
            closeTooltip();
        }, 800);
    }

    async onClick() {
        try {
            const content = this.props.content || (this.props.computedContent && this.props.computedContent());
            // any kind of content can be copied into the clipboard using
            // the appropriate native methods
            if (typeof content === "string") {
                browser.navigator.clipboard.writeText(content).then(() => {
                    this.showTooltip();
                });
            } else {
                browser.navigator.clipboard.write(content).then(() => {
                    this.showTooltip();
                });
            }
        } catch {
            return browser.console.warn("This browser doesn't allow to copy to clipboard");
        }
    }
}
CopyButton.template = "web.CopyButton";
CopyButton.props = {
    className: { type: String, optional: true },
    copyText: { type: String, optional: true },
    successText: { type: String, optional: true },
    content: { type: [String, Object], optional: true },
    computedContent: { type: Function, optional: true },
};
