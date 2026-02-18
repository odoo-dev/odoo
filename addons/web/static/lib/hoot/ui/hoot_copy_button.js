/** @odoo-module */

import { Component, props, proxy, types as t, xml } from "@odoo/owl";
import { copy, hasClipboard } from "../hoot_utils";

export class HootCopyButton extends Component {
    static template = xml`
        <t t-if="this.hasClipboard()">
            <button
                type="button"
                class="text-gray-400 hover:text-gray-500"
                t-att-class="{ 'text-emerald': this.state.copied }"
                title="copy to clipboard"
                t-on-click.stop="this.onClick"
            >
                <i class="fa fa-clipboard" />
            </button>
        </t>
    `;

    props = props({
        "altText?": t.string,
        text: t.string,
    });

    hasClipboard = hasClipboard;

    setup() {
        this.state = proxy({ copied: false });
    }

    /**
     * @param {PointerEvent} ev
     */
    async onClick(ev) {
        const text = ev.altKey && this.props.altText ? this.props.altText : this.props.text;
        await copy(text);
        this.state.copied = true;
    }
}
