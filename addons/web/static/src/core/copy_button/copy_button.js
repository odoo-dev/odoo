/** @odoo-module **/

import { browser } from "@web/core/browser/browser";
import { Tooltip } from "@web/core/tooltip/tooltip";
import { usePopover } from "@web/core/popover/popover_hook";
import { Component, useRef } from "@odoo/owl";

export class CopyButton extends Component {
    static template = "web.CopyButton";
    static props = {
        className: { type: String, optional: true },
        copyText: { type: String, optional: true },
        disabled: { type: Boolean, optional: true },
        successText: { type: String, optional: true },
        content: { type: [Function, String, Object], optional: true },
    };

    setup() {
        this.button = useRef("button");
        this.popover = usePopover(Tooltip);
    }

    showTooltip() {
        this.popover.open(this.button.el, { tooltip: this.props.successText });
        browser.setTimeout(this.popover.close, 800);
    }

    async onClick() {
        const content =
            this.props.content instanceof Function ? this.props.content() : this.props.content;
        if (!browser.navigator.clipboard) {
            return browser.console.warn("This browser doesn't allow to copy to clipboard");
        }
        let write;
        // any kind of content can be copied into the clipboard using
        // the appropriate native methods
        if (typeof content === "string" || content instanceof String) {
            write = (value) => browser.navigator.clipboard.writeText(value);
        } else {
            write = (value) => browser.navigator.clipboard.write(value);
        }
        try {
            await write(content);
        } catch (error) {
            return browser.console.warn(error);
        }
        this.showTooltip();
    }
}
