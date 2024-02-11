export class Plugin {
    static name = "";
    static dependencies = [];
    static shared = [];

    /**
     * @param {Document} document
     * @param {HTMLElement} editable
     * @param {*} shared
     * @param {*} dispatch
     * @param {*} config
     * @param {*} services
     */
    constructor(document, editable, shared, dispatch, config, services) {
        this.document = document;
        this.editable = editable;
        this.config = config;
        this.services = services;
        this.shared = shared;
        this.dispatch = dispatch;
        this._cleanups = [];
        this.resources = null; // set before start
    }

    setup() {}

    /**
     * add it here so it is available in tooling
     *
     * @param {string} command
     * @param {any} payload
     * @returns { any }
     */
    dispatch(command, payload) {}

    handleCommand(command) {}

    addDomListener(target, eventName, fn, capture) {
        const handler = fn.bind(this);
        target.addEventListener(eventName, handler, capture);
        this._cleanups.push(() => target.removeEventListener(eventName, handler, capture));
    }

    destroy() {
        for (const cleanup of this._cleanups) {
            cleanup();
        }
    }
}
