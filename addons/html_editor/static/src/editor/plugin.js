/**
 * @type { import("./editor").Editor } Editor
 * @type { import("./core/selection_plugin").SelectionPlugin } SelectionPlugin
 * @type { import("./core/dom_plugin").DomPlugin } DomPlugin
 * @type { import("./core/split_block_plugin").SplitBlockPlugin } SplitBlockPlugin
 * @type { import("./core/overlay_plugin").OverlayPlugin } OverlayPlugin
 *
 * @typedef { Object } SharedMethods
 * @property { SelectionPlugin.prototype.getEditableSelection } getEditableSelection
 * @property { SelectionPlugin.prototype.setSelection } setSelection
 * @property { SelectionPlugin.prototype.setCursorStart } setCursorStart
 * @property { SelectionPlugin.prototype.setCursorEnd } setCursorEnd
 * @property { DomPlugin.prototype.dom_insert } dom_insert
 * @property { SplitBlockPlugin.prototype.splitElementBlock } splitElementBlock
 * @property { OverlayPlugin.prototype.createOverlay } createOverlay
 */

export class Plugin {
    static name = "";
    static dependencies = [];
    static shared = [];

    /**
     * @param {Document} document
     * @param {HTMLElement} editable
     * @param {SharedMethods} shared
     * @param { Editor.prototype.dispatch } dispatch
     * @param {*} config
     * @param {*} services
     */
    constructor(document, editable, shared, dispatch, config, services) {
        /** @type { Document } **/
        this.document = document;
        /** @type { HTMLElement } **/
        this.editable = editable;
        this.config = config;
        this.services = services;
        /** @type { SharedMethods } **/
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
