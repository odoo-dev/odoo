import { Component, onWillUnmount, proxy, t, useProps } from "@odoo/owl";
import { personLook } from "@scale_up_game/three/kit/people";

/** Flat portrait of a cast member, drawn from the same look as the 3D character. */
export class Portrait extends Component {
    static template = "scale_up_game.Portrait";
    props = useProps({ who: t.string(), size: t.number().optional(42) });

    get look() {
        return personLook(this.props.who);
    }

    get hairPath() {
        // crown that follows the head, plus the volume of the chosen style
        const style = this.look.hairStyle || "short";
        const crown = "M14,30 A18,18 0 0,1 50,30 L50,26 A18,18 0 0,0 14,26 Z";
        if (style === "long") {
            return `${crown} M12,28 q-2,22 4,30 l8,0 q-6,-14 -4,-30 Z M52,28 q2,22 -4,30 l-8,0 q6,-14 4,-30 Z`;
        }
        if (style === "bun") {
            return `${crown} M32,6 m-7,0 a7,7 0 1,0 14,0 a7,7 0 1,0 -14,0`;
        }
        if (style === "cap") {
            return "M12,28 A20,20 0 0,1 52,28 L52,24 A20,20 0 0,0 12,24 Z M10,28 L58,28 L58,32 L10,32 Z";
        }
        return crown;
    }
}

/**
 * Story dialogue, one line at a time: the player clicks to let the next
 * character speak. Text types itself in; a click finishes the line, the
 * next click moves on.
 */
export class Dialogue extends Component {
    static template = "scale_up_game.Dialogue";
    static components = { Portrait };
    props = useProps({
        lines: t.array(),
        onDone: t.function(),
        onSpeaker: t.function().optional(() => () => {}),
    });

    setup() {
        this.state = proxy({ index: 0, shown: "" });
        this._timer = null;
        this._type();
        onWillUnmount(() => clearInterval(this._timer));
    }

    get line() {
        return this.props.lines[this.state.index] || { who: "ceo", text: "" };
    }

    get look() {
        return personLook(this.line.who);
    }

    get typing() {
        return this.state.shown.length < this.line.text.length;
    }

    get isLast() {
        return this.state.index >= this.props.lines.length - 1;
    }

    _type() {
        clearInterval(this._timer);
        this.state.shown = "";
        this.props.onSpeaker(this.line.who);
        const full = this.line.text;
        this._timer = setInterval(() => {
            if (this.state.shown.length >= full.length) {
                clearInterval(this._timer);
                return;
            }
            this.state.shown = full.slice(0, this.state.shown.length + 2);
        }, 16);
    }

    /** A click finishes the line, or moves to the next one. */
    advance = () => {
        if (this.typing) {
            clearInterval(this._timer);
            this.state.shown = this.line.text;
            return;
        }
        if (this.isLast) {
            this.finish();
            return;
        }
        this.state.index++;
        this._type();
    };

    finish = () => {
        clearInterval(this._timer);
        this.props.onSpeaker(null);
        this.props.onDone();
    };
}
