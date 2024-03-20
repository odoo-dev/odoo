/**
 * @typedef { import("./editor").Editor } Editor
 * @typedef { import("./core/history_plugin").HistoryPlugin } HistoryPlugin
 * @typedef { import("./core/selection_plugin").SelectionPlugin } SelectionPlugin
 * @typedef { import("./core/dom_plugin").DomPlugin } DomPlugin
 * @typedef { import("./core/split_plugin").SplitPlugin } SplitPlugin
 * @typedef { import("./core/overlay_plugin").OverlayPlugin } OverlayPlugin
 *
 * @typedef { Object } SharedMethods
 *
 * @property { HistoryPlugin['makeSavePoint'] } makeSavePoint
 * @property { HistoryPlugin['makeSnapshotStep'] } makeSnapshotStep
 * @property { HistoryPlugin['disableObserver'] } disableObserver
 * @property { HistoryPlugin['enableObserver'] } enableObserver
 * @property { HistoryPlugin['addExternalStep'] } addExternalStep
 * @property { HistoryPlugin['getHistorySteps'] } getHistorySteps
 * @property { HistoryPlugin['resetFromSteps'] } resetFromSteps
 * @property { SelectionPlugin['getEditableSelection'] } getEditableSelection
 * @property { SelectionPlugin['setSelection'] } setSelection
 * @property { SelectionPlugin['setCursorStart'] } setCursorStart
 * @property { SelectionPlugin['setCursorEnd'] } setCursorEnd
 * @property { DomPlugin['domInsert'] } domInsert
 * @property { SplitPlugin['splitElementBlock'] } splitElementBlock
 * @property { SplitPlugin['splitElement'] } splitElement
 * @property { SplitPlugin['splitAroundUntil'] } splitAroundUntil
 * @property { OverlayPlugin['createOverlay'] } createOverlay
 */

export class Plugin {
    static name = "";
    static dependencies = [];
    static shared = [];

    /**
     * @param {Editor['document']} document
     * @param {Editor['editable']} editable
     * @param {SharedMethods} shared
     * @param {Editor['dispatch']} dispatch
     * @param {import("./editor").EditorConfig} config
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
