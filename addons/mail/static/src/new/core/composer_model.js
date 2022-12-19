/* @odoo-module */

export class Composer {
    /** @type {Message} */
    message;
    /** @type {string} */
    textInputContent;
    /** @type {Thread} */
    thread;
    /** @type {{ start: number, end: number, direction: "forward" | "backward" | "none"}}*/
    selection = {
        start: 0,
        end: 0,
        direction: "none",
    };
    /** @type {Boolean} */
    forceCursorMove;
    /** @typedef {'message' | 'note'| false} */
    type;

    /**
     * @param {import("@mail/new/core/messaging").Messaging['state']} state
     * @param {Object} data
     * @returns {Composer}
     */
    static insert(state, data) {
        const { message, thread } = data;
        if (Boolean(message) === Boolean(thread)) {
            throw new Error("Composer shall have a thread xor a message.");
        }
        const composer = (thread ?? message)?.composer;
        if (composer) {
            return composer.update(data);
        }
        return new Composer(state, data);
    }

    constructor(state, data) {
        const { message, thread } = data;
        if (thread) {
            this.thread = thread;
            thread.composer = this;
        } else if (message) {
            this.message = message;
            message.composer = this;
        }
        Object.assign(this, {
            textInputContent: "",
            type: thread?.type === "chatter" ? false : "message",
            _state: state,
        });
        return this.update(data);
    }

    update(data) {
        if ("textInputContent" in data) {
            this.textInputContent = data.textInputContent;
        }
        if ("selection" in data) {
            Object.assign(this.selection, data.selection);
        }
        return this;
    }
}
