/**
 * @typedef { import("./editor").Editor } Editor
 * @typedef { import("./editor").EditorConfig } EditorConfig
 * @typedef { import("./core/user_command_plugin").UserCommandPlugin } UserCommandPlugin
 * @typedef { import("./core/history_plugin").HistoryPlugin } HistoryPlugin
 * @typedef { import("./core/selection_plugin").SelectionPlugin } SelectionPlugin
 * @typedef { import("./core/delete_plugin").DeletePlugin } DeletePlugin
 * @typedef { import("./core/dom_plugin").DomPlugin } DomPlugin
 * @typedef { import("./core/split_plugin").SplitPlugin } SplitPlugin
 * @typedef { import("./core/overlay_plugin").OverlayPlugin } OverlayPlugin
 * @typedef { import("./core/line_break_plugin").LineBreakPlugin } LineBreakPlugin
 * @typedef { import("./main/table/table_plugin").TablePlugin } TablePlugin
 * @typedef { import("./main/local_overlay_plugin").LocalOverlayPlugin } LocalOverlayPlugin
 * @typedef { import("./main/powerbox/powerbox_plugin").PowerboxPlugin } PowerboxPlugin
 * @typedef { import("./main/link/link_plugin").LinkPlugin } LinkPlugin
 * @typedef { import("./core/sanitize_plugin").SanitizePlugin } SanitizePlugin
 * @typedef { import("./core/format_plugin").FormatPlugin } FormatPlugin
 * @typedef { import("./others/collaboration/collaboration_plugin").CollaborationPlugin } CollaborationPlugin
 * @typedef { import("./others/collaboration/collaboration_odoo_plugin").CollaborationOdooPlugin } CollaborationOdooPlugin
 *
 * @typedef { Object } SharedMethods
 *
 * @property { UserCommandPlugin['execCommand'] } execCommand
 * @property { UserCommandPlugin['getCommands'] } getCommands
 * @property { HistoryPlugin['reset'] } reset
 * @property { HistoryPlugin['makeSavePoint'] } makeSavePoint
 * @property { HistoryPlugin['makeSnapshotStep'] } makeSnapshotStep
 * @property { HistoryPlugin['disableObserver'] } disableObserver
 * @property { HistoryPlugin['enableObserver'] } enableObserver
 * @property { HistoryPlugin['addExternalStep'] } addExternalStep
 * @property { HistoryPlugin['getHistorySteps'] } getHistorySteps
 * @property { HistoryPlugin['historyResetFromSteps'] } historyResetFromSteps
 * @property { HistoryPlugin['serializeSelection'] } serializeSelection
 * @property { HistoryPlugin['getNodeById'] } getNodeById
 * @property { HistoryPlugin['stageSelection'] } stageSelection
 * @property { HistoryPlugin['addStep'] } addStep
 * @property { SelectionPlugin['getSelectionData'] } getSelectionData
 * @property { SelectionPlugin['getEditableSelection'] } getEditableSelection
 * @property { SelectionPlugin['getSelectedNodes'] } getSelectedNodes
 * @property { SelectionPlugin['getTraversedNodes'] } getTraversedNodes
 * @property { SelectionPlugin['getTraversedBlocks'] } getTraversedBlocks
 * @property { SelectionPlugin['setSelection'] } setSelection
 * @property { SelectionPlugin['setCursorStart'] } setCursorStart
 * @property { SelectionPlugin['setCursorEnd'] } setCursorEnd
 * @property { SelectionPlugin['extractContent'] } extractContent
 * @property { SelectionPlugin['preserveSelection'] } preserveSelection
 * @property { SelectionPlugin['resetSelection'] } resetSelection
 * @property { SelectionPlugin['getSelectedNodes'] } getSelectedNodes
 * @property { SelectionPlugin['getTraversedNodes'] } getTraversedNodes
 * @property { SelectionPlugin['modifySelection'] } modifySelection
 * @property { SelectionPlugin['resetActiveSelection'] } resetActiveSelection
 * @property { FormatPlugin['isSelectionFormat'] } isSelectionFormat
 * @property { LocalOverlayPlugin['makeLocalOverlay'] } makeLocalOverlay
 * @property { PowerboxPlugin['getPowerboxItems'] } getPowerboxItems
 * @property { PowerboxPlugin['getAvailablePowerboxItems'] } getAvailablePowerboxItems
 * @property { PowerboxPlugin['openPowerbox'] } openPowerbox
 * @property { PowerboxPlugin['updatePowerbox'] } updatePowerbox
 * @property { PowerboxPlugin['closePowerbox'] } closePowerbox
 * @property { SanitizePlugin['sanitize'] } sanitize
 * @property { DeletePlugin['deleteRange'] } deleteRange
 * @property { DeletePlugin['deleteshareSelection'] } deleteSelection
 * @property { LinkPlugin['createLink'] } createLink
 * @property { LinkPlugin['insertLink'] } insertLink
 * @property { LinkPlugin['getPathAsUrlCommand'] } getPathAsUrlCommand
 * @property { DomPlugin['domInsert'] } domInsert
 * @property { DomPlugin['copyAttributes'] } copyAttributes
 * @property { SplitPlugin['isUnsplittable'] } isUnsplittable
 * @property { SplitPlugin['splitBlock'] } splitBlock
 * @property { SplitPlugin['splitElementBlock'] } splitElementBlock
 * @property { SplitPlugin['splitElement'] } splitElement
 * @property { SplitPlugin['splitSelection'] } splitSelection
 * @property { SplitPlugin['splitAroundUntil'] } splitAroundUntil
 * @property { SplitPlugin['splitTextNode'] } splitTextNode
 * @property { SplitPlugin['splitBlockNode'] } splitBlockNode
 * @property { OverlayPlugin['createOverlay'] } createOverlay
 * @property { LineBreakPlugin['insertLineBreak'] } insertLineBreak
 * @property { LineBreakPlugin['insertLineBreakNode'] } insertLineBreakNode
 * @property { LineBreakPlugin['insertLineBreakElement'] } insertLineBreakElement
 * @property { TablePlugin['addColumn'] } addColumn
 * @property { TablePlugin['addRow'] } addRow
 * @property { TablePlugin['removeColumn'] } removeColumn
 * @property { TablePlugin['removeRow'] } removeRow
 * @property { TablePlugin['moveColumn'] } moveColumn
 * @property { TablePlugin['moveRow'] } moveRow
 * @property { TablePlugin['resetTableSize'] } resetTableSize
 * @property { CollaborationPlugin['onExternalHistorySteps'] } onExternalHistorySteps
 * @property { CollaborationPlugin['historyGetMissingSteps'] } historyGetMissingSteps
 * @property { CollaborationPlugin['setInitialBranchStepId'] } setInitialBranchStepId
 * @property { CollaborationPlugin['getBranchIds'] } getBranchIds
 * @property { CollaborationPlugin['getSnapshotSteps'] } getSnapshotSteps
 * @property { CollaborationPlugin['resetFromSteps'] } resetFromSteps
 * @property { CollaborationOdooPlugin['getPeerMetadata'] } getPeerMetadata
 */

import { isProtected, isProtecting, isUnprotecting } from "./utils/dom_info";

export class Plugin {
    static name = "";
    static dependencies = [];
    static shared = [];

    /**
     * @param {Editor['document']} document
     * @param {Editor['editable']} editable
     * @param {SharedMethods} shared
     * @param {import("./editor").EditorConfig} config
     * @param {*} services
     */
    constructor(document, editable, shared, config, services) {
        /** @type { Document } **/
        this.document = document;
        /** @type { HTMLElement } **/
        this.editable = editable;
        /** @type { EditorConfig } **/
        this.config = config;
        this.services = services;
        /** @type { SharedMethods } **/
        this.shared = shared;
        this._cleanups = [];
        /**
         * The resources aggregated from all the plugins by the editor.
         */
        this._resources = null; // set before start
        this.isDestroyed = false;
    }

    setup() {}

    addDomListener(target, eventName, fn, capture) {
        const handler = (ev) => {
            if (
                !isProtecting(ev.target) &&
                (!isProtected(ev.target) || isUnprotecting(ev.target))
            ) {
                fn?.call(this, ev);
            }
        };
        target.addEventListener(eventName, handler, capture);
        this._cleanups.push(() => target.removeEventListener(eventName, handler, capture));
    }

    /**
     * @param {string} resourceId
     */
    getResource(resourceId) {
        return this._resources[resourceId] || [];
    }

    dispatchTo(resourceId, ...args) {
        this.getResource(resourceId).forEach((fn) => fn(...args));
    }

    delegateTo(resourceId, ...args) {
        return this.getResource(resourceId).some((fn) => fn(...args));
    }

    destroy() {
        for (const cleanup of this._cleanups) {
            cleanup();
        }
        this.isDestroyed = true;
    }
}
