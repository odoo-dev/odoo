/* @odoo-module */

export class Chatter {
    /** @type {import("@mail/new/core/thread_model").Thread} */
    thread;
    /** @type {"logNote" | "sendMessage" | "none"} */
    composerAction;

    static insert(state, data) {
        if (!("thread" in data)) {
            throw new Error("Cannot insert Chatter: 'thread' is missing in data.");
        }
        let chatter;
        if (data.thread.chatter) {
            chatter = data.thread.chatter;
            chatter.update(data);
        } else {
            chatter = new Chatter(state, data);
        }
        // hack to make chatter reactive
        return state.threads[chatter.thread.id].chatter;
    }

    constructor(state, data) {
        Object.assign(this, {
            thread: data.thread,
            composerAction: "none",
            _state: state,
        });
        this.thread.chatter = this;
        return this.update(data);
    }

    update(data) {
        if ("composerAction" in data) {
            this.composerAction = data.composerAction;
        }
        return this;
    }
}
