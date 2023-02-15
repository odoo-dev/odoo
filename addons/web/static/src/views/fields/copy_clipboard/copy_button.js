/** @odoo-module **/

import { browser } from "@web/core/browser/browser";
import { Tooltip } from "@web/core/tooltip/tooltip";
import { useService } from "@web/core/utils/hooks";

import { Component, useRef } from "@odoo/owl";
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
        if (!browser.navigator.clipboard) {
            return browser.console.warn("This browser doesn't allow to copy to clipboard");
        }
        let write;
        // any kind of content can be copied into the clipboard using
        // the appropriate native methods
        if (typeof this.props.content === "string" || this.props.content instanceof String) {
            write = browser.navigator.clipboard.writeText;
        } else {
            write = browser.navigator.clipboard.write;
        }
        write(this.props.content).then(() => {
            this.showTooltip();
        }).catch((error) => {
            browser.console.warn("This browser doesn't grant access to copy to clipboard");
        });
    }
}
CopyButton.template = "web.CopyButton";
CopyButton.props = {
    className: { type: String, optional: true },
    copyText: { type: String, optional: true },
    successText: { type: String, optional: true },
    content: { type: [String, Object], optional: true },
};
