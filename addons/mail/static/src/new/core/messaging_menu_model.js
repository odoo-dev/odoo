/* @odoo-module */

export class MessagingMenu {
    /** @type {number} */
    counter;
    /** @type {import("@mail/new/core/messaging").Messaging['state']} */
    _state;

    /**
     * @param {import("@mail/new/core/messaging").Messaging['state']} state
     * @param {Object} data
     * @returns {MessagingMenu}
     */
    static insert(state, data) {
        if (state.menu) {
            return state.menu;
        }
        const menu = new MessagingMenu(data);
        menu._state = state;
        state.menu = menu;
        // return reactive version
        return state.menu;
    }

    constructor(data) {
        Object.assign(this, {
            counter: 5, // sounds about right.
        });
    }

    /** @returns {import("@mail/new/core/thread_model").Thread[]} */
    get previews() {
        return Object.values(this._state.threads).filter((thread) => thread.is_pinned);
    }
}
