import { useRef } from "@web/owl2/utils";
import { Tooltip } from "@web/core/tooltip/tooltip";
import { usePopover } from "@web/core/popover/popover_hook";
import { Component } from "@odoo/owl";

export class CopyButton extends Component {
    static template = "web.CopyButton";
    static props = {
        className: { type: String, optional: true },
        copyText: { type: String, optional: true },
        disabled: { type: Boolean, optional: true },
        successText: { type: String, optional: true },
        icon: { type: String, optional: true },
        content: { type: [String, Object, Function], optional: true },
    };

    setup() {
        this.button = useRef("button");
        this.popover = usePopover(Tooltip);
    }

    showTooltip() {
        this.popover.open(this.button.el, { tooltip: this.props.successText });
        setTimeout(this.popover.close, 800);
    }

    async onClick() {
        let write, content;
        if (typeof this.props.content === "function") {
            content = this.props.content();
        } else {
            content = this.props.content;
        }
        // any kind of content can be copied into the clipboard using
        // the appropriate native methods
        if (typeof content === "string" || content instanceof String) {
            write = (value) => navigator.clipboard.writeText(value);
        } else {
            write = (value) => navigator.clipboard.write(value);
        }
        try {
            await write(content);
        } catch (error) {
            return console.warn(error);
        }
        this.showTooltip();
    }
}
