import { useHover } from "@mail/utils/common/hooks";
import { Component, useState } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";

/**
 * @typedef {Object} Props
 * @property {Function} onClick
 * @extends {Component<Props, Env>}
 */
export class AddEmojiButton extends Component {
    static template = "mail.AddEmojiButton";
    static props = { onClick: Function };

    setup() {
        super.setup(...arguments);
        this.ui = useState(useService("ui"));
        this.state = useState({ customIcon: null });
        this.smileys = ["😏", "🤯", "😎", "🥶", "😊", "😄", "😃", "😆", "🤣"];
        this.hoverState = useHover("root", {
            onHover: () => {
                const smileysExceptCurrent = this.smileys.filter(
                    (smiley) => smiley !== this.state.customIcon
                );
                this.state.customIcon =
                    smileysExceptCurrent[Math.floor(Math.random() * smileysExceptCurrent.length)];
            },
        });
    }
}
