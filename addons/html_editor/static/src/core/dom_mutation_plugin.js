import { Plugin } from "../plugin";
import { trackOccurrences, trackOccurrencesPair } from "@html_editor/utils/tracking";
import { treeToNodes, nodeToTree, NodeMap } from "@html_editor/utils/dom_info";
import { childNodes, descendants, getCommonAncestor } from "@html_editor/utils/dom_traversal";
import { omit, pick } from "@web/core/utils/objects";
import { toggleClass } from "@html_editor/utils/dom";
import { withSequence } from "@html_editor/utils/resource";
import { EditorCommit } from "@html_editor/utils/commit";

/**
 * DOM
 */
/**
 * @typedef { string } NodeId
 *
 * @typedef { Object } Tree
 * @property { Node } node
 * @property { Tree[] } children
 *
 * @typedef { Object } SerializedNode
 * @property { number } nodeType
 * @property { NodeId } nodeId
 * @property { string } textValue
 * @property { string } tagName
 * @property { SerializedNode[] } children
 * @property { Record<string, string> } attributes
 *
 * @typedef { Object } SerializedSelection
 * @property { NodeId } anchorNodeId
 * @property { number } anchorOffset
 * @property { NodeId } focusNodeId
 * @property { number } focusOffset
 */

/**
 * COMMITS
 */
/**
 * @typedef { import("../utils/commit").EditorCommit } Commit
 * @typedef { import("../utils/commit").EditorCommitType } EditorCommitType
 *
 * @typedef { Object } DomMutationCommitData
 * @property { number } authorTimestamp              // timestamp of the commit authoring, before any mutation is applied
 * @property { EditorMutation[] } mutations          // the mutations to apply/revert
 * @property { NodeId } activeElementId              // the ID of the active element before applying the mutations
 * @property { SerializedSelection } selection       // the serialized selection before applying the mutations
 * @property { SerializedSelection } selectionAfter  // the serialized selection after applying the mutations
 * @property { Object } external                     // any data added from and managed by an external plugin
 */

/**
 * MUTATIONS
 */
/**
 * @typedef { "attributes" | "characterData" | "childList" } NativeMutationType
 */
/**
 * Native Mutations
 * ----------------
 *
 * Narrowed typing for the native `MutationRecord` type, to differentiate between
 * each mutation type, omitting all properties that are always `null` for the
 * given type of mutation.
 *
 * @template { NativeMutationType } [T=NativeMutationType]
 * @typedef { Extract<|
 *    (Pick<MutationRecord, "target" | "attributeName" | "attributeNamespace" | "oldValue"> & { type: "attributes" })
 *  | (Pick<MutationRecord, "target" | "oldValue"> & { type: "characterData" })
 *  | (Pick<MutationRecord, "target" | "addedNodes" | "removedNodes" | "previousSibling" | "nextSibling"> & { type: "childList" }),
 * { type: T }
 * > } NativeMutation
 */
/**
 * @typedef { Exclude<NativeMutationType, "childList"> | "classList" | "add" | "remove" } EditorMutationType
 */
/**
 * Editor Mutations
 * ----------------
 *
 * Expanded mutation object, with extra information that is helpful for our
 * purposes in the editor.
 *
 * @template { EditorMutationType } [T=EditorMutationType]
 * @typedef { Extract<|
 *    (NativeMutation<"attributes"> | { value: string })
 *  | (Omit<NativeMutation<"attributes">, "attributeName" | "attributeNamespace" | "type"> & { type: "classList", className: string, value: boolean })
 *  | (NativeMutation<"characterData"> | { value: string })
 *  | (Pick<NativeMutation<"childList">, "previousSibling" | "nextSibling"> | { tree: Tree, parent: Node } & { type: "add" })
 *  | (Pick<NativeMutation<"childList">, "previousSibling" | "nextSibling"> | { tree: Tree, parent: Node } & { type: "remove" }),
 * { type: T }
 * > } EditorMutation
 */
/**
 * Serialized Mutations
 * --------------------
 *
 * Serialized version of `EditorMutation`s for safely passing around the editor
 * without losing references and to allow as JSON payload.
 *
 * @template { EditorMutationType } [T=EditorMutationType]
 * @typedef { Extract<|
 *     (Omit<EditorMutation<"attributes">, "target"> & { nodeId: NodeId })
 *   | (Omit<EditorMutation<"classList">, "target"> & { nodeId: NodeId })
 *   | (Omit<EditorMutation<"characterData">, "target"> & { nodeId: NodeId })
 *   | (Omit<EditorMutation<"classList">, "target"> & { nodeId: NodeId })
 *   | (Omit<EditorMutation<"add">, "target" | "previousSibling" | "nextSibling" | "tree" | "parent"> & { nodeId: NodeId, previousNodeId: NodeId, nextNodeId: NodeId, serializedNode: SerializedNode, parentNodeId: NodeId })
 *   | (Omit<EditorMutation<"remove">, "target" | "previousSibling" | "nextSibling" | "tree" | "parent"> & { nodeId: NodeId, previousNodeId: NodeId, nextNodeId: NodeId, serializedNode: SerializedNode, parentNodeId: NodeId }),
 *   { type: T }
 * > } SerializedMutation
 */

/**
 * @typedef { Object } PreviewableOperation
 * @property { Function } commit
 * @property { Function } preview
 * @property { Function } revert
 */
/**
 * @typedef { Object } ObservedState
 * @property { Map<string, string> } attributes
 * @property { Map<string, boolean> } classList
 * @property { Map<string, string> } characterData
 */
/**
 * @typedef { WeakMap<NativeMutation<"childList">, { added: Tree[], removed: Tree[] }> } ChildListToTreesMap
 */

/**
 * @typedef { Object } DomMutationShared
 * @property { DomMutationPlugin['commit'] } commit
 * @property { DomMutationPlugin['discard'] } discard
 * @property { DomMutationPlugin['stage'] } stage
 * @property { DomMutationPlugin['unstage'] } unstage
 * @property { DomMutationPlugin['stash'] } stash
 * @property { DomMutationPlugin['unstash'] } unstash
 * @property { DomMutationPlugin['updateExternal'] } updateExternal
 * @property { DomMutationPlugin['stageCustomMutation'] } stageCustomMutation
 * @property { DomMutationPlugin['applyCustomMutation'] } applyCustomMutation
 * @property { DomMutationPlugin['hasStagedMutations'] } hasStagedMutations
 * @property { DomMutationPlugin['ignoreDOMMutations'] } ignoreDOMMutations
 * @property { DomMutationPlugin['makePreviewableOperation'] } makePreviewableOperation
 * @property { DomMutationPlugin['makePreviewableAsyncOperation'] } makePreviewableAsyncOperation
 * @property { DomMutationPlugin['makeSavePoint'] } makeSavePoint
 * @property { DomMutationPlugin['createSnapshotCommit'] } createSnapshotCommit
 * @property { DomMutationPlugin['stageSelection'] } stageSelection
 * @property { DomMutationPlugin['stageFocus'] } stageFocus
 * @property { DomMutationPlugin['getIsPreviewing'] } getIsPreviewing
 * @property { DomMutationPlugin['getNodeById'] } getNodeById
 * @property { DomMutationPlugin['getNodeId'] } getNodeId
 * @property { DomMutationPlugin['serializeSelection'] } serializeSelection
 */

/**
 * @typedef { ((
 *    arg: {
 *      nodeId: NodeId,
 *      attributeName: string,
 *      oldValue: string,
 *      value: string,
 *      reverse: boolean,
 *    },
 *    options: { ensureNewMutations: boolean }
 *  ) => arg)[] } attribute_change_processors
 * @typedef { ((root: HTMLElement) => void)[] } on_content_updated_handlers
 * @typedef { ((record: SerializedMutation[]) => void)[] } on_attribute_changed_handlers
 * @typedef { ((record: SerializedMutation[], currentOperation: EditorCommitType) => void)[] } on_new_records_handled_handlers
 * @typedef { (() => void)[] } on_savepoint_restored_handlers
 * @typedef { ((node: Node, childTreesToSerialize: Tree[]) => Tree[])[] } serializable_descendants_processors
 * @typedef { ((type: EditorCommitType) => void)[] } on_will_commit_handlers
 * @typedef { ((records: NativeMutation[]) => void)[] } on_will_filter_mutation_record_handlers
 * @typedef { ((commit: Commit) => Commit)[] } editor_commit_processors
 * @typedef { ((record: NativeMutation) => boolean | undefined)[] } is_mutation_savable_predicates
 * @typedef { ((record: EditorMutation<"classList">) => boolean | undefined)[] } is_classlist_mutation_savable_predicates
 */
export class DomMutationPlugin extends Plugin {
    static id = "domMutation";
    static dependencies = ["history", "selection", "sanitize"];
    static shared = [
        // Main public API
        "commit",
        "discard",
        "stage",
        "unstage",
        "stash",
        "unstash",
        "updateExternal",

        // DOM Map Handling
        "getNodeById",
        "getNodeId",
        "serializeSelection",

        // From Original
        "stageCustomMutation",
        "applyCustomMutation",
        "getIsPreviewing",
        "hasStagedMutations",
        "ignoreDOMMutations",
        "makePreviewableOperation",
        "makePreviewableAsyncOperation",
        "makeSavePoint",
        "createSnapshotCommit",
        "stageSelection",
        "stageFocus",
    ];
    /** @type {import("plugins").EditorResources} */
    resources = {
        on_editor_started_handlers: withSequence(9, this.enableObserver.bind(this)),
        on_will_reset_history_from_commits_handlers: () => {
            // TODO AGE: this is only to replace the `withObserverOff` call in
            // `history.resetFromCommits` but it's not useful for `history.reset`,
            // and assumes a call to `history_reset_from_commits_handlers` after.
            this.lastEnableObserverCallback = this.disableObserver();
        },
        on_history_reset_from_commits_handlers: () => {
            // See above.
            this.lastEnableObserverCallback?.();
            this.lastEnableObserverCallback = undefined;
        },
        on_history_reset_handlers: withSequence(0, () => {
            this.dependencies.history.write(this.createSnapshotCommit("reset"));
            this.stageSelection();
        }),
        on_prepare_drag_handlers: this.disableHasStagedMutationsWarning.bind(this),
        on_history_cleaned_handlers: this.clean.bind(this),
        on_will_add_external_commit_handlers: () => {
            // The last commit is an uncommited draft, revert it first
            this.stash();
        },
        on_external_commit_added_handlers: () => {
            // Reapply the uncommited draft, since this is not an operation which should cancel it
            this.unstash();
        },
        apply_commit_overrides: (commit) => {
            if (commit.data.mutations) {
                this.applyCommit(commit);
                return true;
            }
        },
        revert_commit_overrides: (commit, { ensureNewMutations = false } = {}) => {
            if (commit.data.mutations) {
                this.revertCommit(commit, { ensureNewMutations });
                return true;
            }
        },
        on_will_undo_handlers: this.discard.bind(this),
        on_single_commit_undone_handlers: withSequence(0, (revertedCommit) => {
            // TODO AGE: This used to be done in history after undo a single
            // commit and before dispatching on_undone_handlers. See if there is
            // a better way.
            // Consider the last position of the history as an undo.
            // Include any commit data stored in the reverted commit and that
            // is not handled by this plugin.
            // Note AGE: this is the `extraStepInfos` stuff.
            for (const [key, value] of Object.entries(revertedCommit.data.external)) {
                this.updateExternal(key, value);
            }
            this._commit({
                type: "undo",
                metadata: revertedCommit.metadata,
            });
        }),
        on_will_redo_handlers: this.discard.bind(this),
        on_single_commit_redone_handlers: withSequence(0, (revertedCommit) => {
            // TODO AGE: This used to be done in history after redo a single
            // commit and before dispatching on_redone_handlers. See if there is
            // a better way.
            // Include any commit data stored in the reverted commit and
            // that is not handled by this plugin.
            // Note AGE: this is the `extraStepInfos` stuff.
            for (const [key, value] of Object.entries(revertedCommit.data.external)) {
                this.updateExternal(key, value);
            }
            this._commit({
                type: "redo",
                metadata: revertedCommit.metadata,
            });
        }),
        commit_root_providers: (commit) =>
            this.getMutationsRoot(commit.data.mutations || []) || this.editable,
    };

    setup() {
        this.nodeMap = new NodeMap();
        this.mutationFilteredClasses = new Set(this.getResource("system_classes"));
        this.mutationFilteredAttributes = new Set(this.getResource("system_attributes"));
        this.addGlobalDomListener("pointerup", (ev) => {
            if (this.editable.contains(ev.target)) {
                this.stageSelection();
            }
        });
        this.observer = new MutationObserver((records) => this.flush({ records }));
        this.enableObserverCallbacks = new Set();
        this._cleanups.push(() => this.observer.disconnect());
        this.clean();
        /** @type { DomMutationCommitData[] } */
        this.currentStash = [];
    }

    clean() {
        this.currentChanges = new CurrentChanges();
        // TODO AGE: rename to clarify what it is.
        /** @type { WeakMap<Node, ObservedState } */
        this.lastObservedState = new WeakMap();
        this.nodeMap = new NodeMap();
        this.setNodeId(this.editable);
    }

    // ===============
    // Main public API
    // ===============

    commit({ batchable = false } = {}) {
        return this._commit({ metadata: { batchable } });
    }

    _commit({ type = "original", metadata = {} } = {}) {
        this.flush({ dispatch: true, currentOperation: type });
        const currentMutationsCount = this.currentChanges.mutations.length;
        if (currentMutationsCount === 0) {
            return false;
        }
        const commitRoot = this.getMutationsRoot(this.currentChanges.mutations) || this.editable;
        this.processThrough("normalize_processors", commitRoot, type);
        this.flush({ dispatch: false, currentOperation: type });
        if (currentMutationsCount === this.currentChanges.mutations.length) {
            // If there was no registered mutation during the normalization commit,
            // force the dispatch of a content_updated to allow i.e. the hint
            // plugin to react to non-observed changes (i.e. a div becoming
            // a baseContainer).
            this.dispatchContentUpdated();
        }

        // TODO AGE: rename
        this.trigger("on_will_commit_handlers", type); // making sure it updates the commit we're adding

        // Set the type of the commit here. That way, the state of undo and redo
        // is truly accessible when executing the onChange callback. It is
        // useful for external components if they execute shared.can(Undo|Redo)
        const commit = this.dependencies.history.write(this.createCommit(type, metadata));

        this.currentChanges = new CurrentChanges();

        this.stageSelection();

        // Note AGE: will not trigger for a reset commit (it calls history.write
        // directly). That's like it used to be before my changes: reset caused
        // a step without calling addStep but by using steps.push directly.
        this.trigger("on_committed_handlers", commit);

        this.config.onChange?.({ isPreviewing: this.isPreviewing });
        return commit;
    }

    discard() {
        const changes = this.currentChanges.data;
        // Discard current draft.
        this.flush();
        this.revertMutations(this.currentChanges.mutations);
        this.observer.takeRecords();
        this.currentChanges.resetMutations();
        return changes;
    }

    stash() {
        this.currentStash.push(this.discard());
    }

    unstash(index = -1) {
        if (this.currentStash.length > index) {
            const changes = this.currentStash.splice(index, 1)[0];
            this.applyMutations(changes.mutations);
            // TODO AGE: this condition is theoretically insufficient because
            // the observer could also be disconnected. I guess best would be to
            // reactivate it before calling `applyMutation` and disable it
            // again. See about that when looking into
            // `disableObserver`/`withObserverOff`.
            if (this.isObserverDisabled) {
                // Make sure the unstashed mutations are recorded.
                this.stage(changes.mutations);
            }
            // TODO AGE: shouldn't this also apply other changes?
        }
    }

    /**
     * Add the given serialized mutation(s) to `this.currentChanges`, which will
     * be used in the next commit.
     *
     * @param { SerializedMutation | SerializedMutation[] } mutations
     */
    stage(mutations) {
        mutations = Array.isArray(mutations) ? mutations : [mutations];
        this.currentChanges.addMutations(...mutations);
    }

    unstage(mutations) {
        // TODO AGE
    }

    /**
     * Process the given native mutation records (or take the observer's current
     * mutation records by default) and stage them.
     *
     * @param { Object } [params]
     * @param { NativeMutation[] } [params.records = this.observer.takeRecords()]
     * @param { boolean } [params.dispatch = true]
     * @param { CommitType } [params.currentOperation] the type of the commit we're about to write
     *
     * TODO AGE: see if I can get rid of all these arguments. Should this be
     * called `stage`?
     */
    flush({ records = this.observer.takeRecords(), dispatch = true, currentOperation } = {}) {
        if (this.observer.takeRecords().length) {
            throw new Error("MutationObserver has pending records");
        }

        // First process the records:
        const processedRecords = this.processNativeMutations(records);
        const serializedRecords = this.serializeEditorMutations(processedRecords);

        // Then stage them.
        this.stage(serializedRecords);

        // And finally, inform other plugins of changes.
        if (serializedRecords.length) {
            for (const mutation of serializedRecords) {
                if (mutation.type === "attributes") {
                    this.trigger("on_attribute_changed_handlers", mutation);
                }
            }
            // TODO modify `handleMutations` of web_studio to handle `undoOperation`.
            if (dispatch) {
                this.trigger(
                    "on_new_records_handled_handlers",
                    serializedRecords,
                    currentOperation
                );
                // Process potential new mutations caused by the handlers.
                this.flush({ dispatch: false });
            }
            this.dispatchContentUpdated();
        }
    }

    /**
     * Set a key/value pair in the data of the next commit.
     *
     * @param { string } key
     * @param { any } value
     */
    updateExternal(key, value) {
        this.currentChanges.updateExternal(key, value);
    }

    // ===================
    // Mutation processing
    // ===================

    /**
     * Filter through a batch of `NativeMutation`s then turn them into
     * `EditorMutation`s by adding information to them and splitting them so we
     * have individual records for each class change, each added node and each
     * removed nodes, and assign an ID to any added node.
     *
     * @param { NativeMutation[] } mutations
     * @returns { EditorMutation[] }
     */
    processNativeMutations(mutations) {
        this.trigger("on_will_filter_mutation_record_handlers", mutations);

        // Filter out same-textContent mutations. This needs to happen
        // first because it could affect the siblings computations below.
        mutations = mutations.filter((mutation) => {
            if (mutation.type === "childList") {
                // Check if a mutation consists of removing and adding a single
                // text node with the same text content, which occurs in Firefox
                // but is optimized away in Chrome.
                const { addedNodes, removedNodes } = mutation;
                const [firstAdded, firstRemoved] = [addedNodes[0], removedNodes[0]];
                if (
                    [addedNodes, removedNodes].every((nodes) => nodes.length === 1) &&
                    [firstAdded, firstRemoved].every((node) => node.nodeType === Node.TEXT_NODE) &&
                    firstAdded.textContent === firstRemoved.textContent
                ) {
                    const oldId = this.getNodeId(firstRemoved);
                    if (oldId) {
                        this.nodeMap.set(oldId, firstAdded);
                        return false;
                    }
                }
            }
            return true;
        });

        // Build a map of childList trees for all the mutations.
        const childListToTrees = this.createChildListToTreesMap(mutations);

        // Track the attributes/characterData mutation occurrences.
        const [isFirstAttribute, isFirstCharData] = [trackOccurrencesPair(), trackOccurrences()];
        const isFirstOccurrence = (mutation) =>
            mutation.type === "attributes"
                ? isFirstAttribute(mutation.target, mutation.attributeName)
                : isFirstCharData(mutation.target);

        // Now do the processing.
        return mutations
            .flatMap((mutation) => {
                if (!this.isObservedNode(mutation.target)) {
                    return false;
                }
                const isSavable =
                    !this.isObserverDisabled &&
                    (this.checkPredicates("is_mutation_savable_predicates", mutation) ?? true);
                switch (mutation.type) {
                    case "attributes":
                    case "characterData": {
                        if (isSavable) {
                            // Keep only the first mutation record for each
                            // (node, attribute) pair. Mutation records of type
                            // "attribute" and "characterData" provide the old
                            // value, but not the new value. When multiple
                            // mutations occur in the same batch for an
                            // element's attribute or characterData, we only
                            // know the final value of the accumulated changes,
                            // which is the DOM's current state. The oldValue
                            // provided by mutations after the first one are
                            // intermediate states that we do not care about.
                            // Discarding them allows us to store a single
                            // record representing the accumulated changes,
                            // instead of reconstructing the new value
                            // introduced by each mutation.
                            if (isFirstOccurrence(mutation)) {
                                if (mutation.type === "attributes") {
                                    return this.processAttributesMutation(mutation);
                                } else if (mutation.type === "characterData") {
                                    return this.processCharacterDataMutation(mutation);
                                }
                            }
                        } else {
                            // If the observer is disabled, store the last
                            // observed state of the target's affected property
                            // (attribute/class/textContent) and drop the
                            // record.
                            this.storeOldValue(mutation);
                        }
                        return false;
                    }
                    case "childList": {
                        return (
                            isSavable && this.processChildListMutation(mutation, childListToTrees)
                        );
                    }
                }
            })
            .filter(Boolean);
    }

    /**
     * Process a native mutation of type "attributes" by returning `false` if it
     * should be ignored, or turning it into one or several `EditorMutation`s.
     *
     * This involves:
     * - splitting a change on the "class" attribute into an array of mutations
     *   of type "classList" @see createClassListMutations
     * - giving it a `value` property
     * - updating its `oldValue` property @see updateOldValue
     *
     * @param { NativeMutation<"attributes"> } mutation
     * @returns { |
     *        EditorMutation<"attributes">
     *      | EditorMutation<"classList">[]
     *      | false }
     */
    processAttributesMutation(mutation) {
        if (
            // Skip the attributes change on the dom.
            mutation.target === this.editable ||
            mutation.attributeName === "contenteditable" ||
            // Skip system mutations.
            this.mutationFilteredAttributes.has(mutation.attributeName)
        ) {
            return false;
        }
        if (mutation.attributeName === "class") {
            return (
                this.createClassListMutations(mutation)
                    .map(this.updateOldValue.bind(this))
                    // Filter out no-op.
                    .filter((classRecord) => classRecord.value !== classRecord.oldValue)
            );
        } else {
            const processedMutation = this.updateOldValue(
                /** @type { EditorMutation<"attributes"> } */ {
                    ...pick(mutation, "type", "target", "attributeName", "oldValue"),
                    value: mutation.target.getAttribute(mutation.attributeName),
                }
            );
            if (processedMutation.value === processedMutation.oldValue) {
                // Filter out no-op.
                return false;
            }
            return processedMutation;
        }
    }

    /**
     * Process a native mutation of type "characterData" by returning `false` if
     * it should be ignored, or turning it into one an `EditorMutation`.
     *
     * This involves:
     * - giving it a `value` property
     * - updating its `oldValue` property @see updateOldValue
     *
     * @param {NativeMutation<"characterData">} mutation
     * @returns {EditorMutation<"characterData"> | false}
     */
    processCharacterDataMutation(mutation) {
        const processedMutation = this.updateOldValue(
            /** @type { EditorMutation<"characterData"> } */ {
                ...pick(mutation, "type", "target", "oldValue"),
                value: mutation.target.textContent,
            }
        );
        // Filter out no-ops.
        return processedMutation.value === processedMutation.oldValue ? false : processedMutation;
    }

    /**
     * Process a native mutation of type "childList" by returning `false` if it
     * should be ignored, or turning it into an array of single-node
     * `EditorMutation`s of types "add" and/or "remove".
     *
     * This involves:
     * - assigning IDs to all added nodes
     * - splitting the record into one record per item in the `addedNodes` and
     *   `removedNodes` arrays
     * - giving each newly created record the native mutation's target as
     *   `parent` property
     * - giving each newly created record a `tree` property containing the tree
     *   of the record's corresponding `addedNodes` or `removedNodes` item.
     *
     * Note: Splitting the record requires having build a `ChildListToTreesMap`
     * with @see createChildListToTreesMap using all the records in the batch.
     *
     * @param { NativeMutation<"childList"> } mutation
     * @param { ChildListToTreesMap } childListToTrees
     * @returns { EditorMutation<"add" | "remove">[] | false }
     */
    processChildListMutation(mutation, childListToTrees) {
        if (!this.nodeMap.hasNode(mutation.target)) {
            throw new Error("Unknown parent node");
        }

        const trees = childListToTrees.get(mutation);

        // Filter out unobserved nodes in the removed trees.
        const removeUnobservedNodes = (tree) =>
            this.isObservedNode(tree.node)
                ? {
                      node: tree.node,
                      children: tree.children.map(removeUnobservedNodes).filter(Boolean),
                  }
                : null;
        trees.removed = trees.removed.map(removeUnobservedNodes).filter(Boolean);
        childListToTrees.set(mutation, trees); // TODO AGE: probably not necessary.

        // Invalidate sibling references to unobserved nodes
        const previousSibling =
            mutation.previousSibling === null || this.isObservedNode(mutation.previousSibling)
                ? mutation.previousSibling
                : undefined;
        const nextSibling =
            mutation.nextSibling === null || this.isObservedNode(mutation.nextSibling)
                ? mutation.nextSibling
                : undefined;

        if (
            // Filter out no-op
            (!trees.added.length && !trees.removed.length) ||
            // Filter out mutation without a valid position for node insertion
            (previousSibling === undefined && nextSibling === undefined)
        ) {
            return false;
        }

        // Assign ids to newly added childList nodes early so later records in
        // the same `MutationObserver` batch can resolve them (notably in
        // `isObservedNode`).
        trees.added
            .flatMap(treeToNodes)
            .filter((node) => !this.nodeMap.hasNode(node))
            .forEach((node) => this.nodeMap.set(this.generateId(), node));

        // Split the mutation into single node mutations.
        return [
            ...trees.removed.map((tree, index) => ({
                type: "remove",
                tree,
                parent: mutation.target,
                previousSibling,
                nextSibling: trees.removed[index + 1]?.node || nextSibling,
            })),
            ...trees.added.map((tree, index) => ({
                type: "add",
                tree,
                parent: mutation.target,
                previousSibling: trees.added[index - 1]?.node || previousSibling,
                nextSibling,
            })),
        ];
    }

    /**
     * Break down a single class attribute `NativeMutation` into individual
     * class addition/removal `EditorMutation`s for more precise history
     * tracking.
     *
     * @param { NativeMutation<"attributes"> } mutation
     * @returns { EditorMutation<"classList">[] }
     */
    createClassListMutations(mutation) {
        // oldValue can be nullish, or have extra spaces
        const classesBefore = new Set(mutation.oldValue?.split(" ").filter(Boolean));
        const classesAfter = new Set(mutation.target.classList);
        const addedClasses = classesAfter.difference(classesBefore);
        const removedClasses = classesBefore.difference(classesAfter);

        /** @type { (className: string, isAdded: boolean) => EditorMutation<"classList"> } */
        const createClassRecord = (className, isAdded) => ({
            type: "classList",
            target: mutation.target,
            className,
            value: isAdded,
            oldValue: !isAdded,
        });
        // Generate records for each class change, skipping system mutations.
        return [
            ...[...addedClasses].map((cls) => createClassRecord(cls, true)),
            ...[...removedClasses].map((cls) => createClassRecord(cls, false)),
        ].filter(
            (classRecord) =>
                !this.mutationFilteredClasses.has(classRecord.className) &&
                (this.checkPredicates("is_classlist_mutation_savable_predicates", classRecord) ??
                    true)
        );
    }

    /**
     * `NativeMutation` records of type "childList" do not contain information
     * about the descendants of the added/removed nodes at the time of the
     * mutation. This returns a map from the "childList" mutations in a batch to
     * their respective added/removed trees.
     *
     * @param { NativeMutation[] } mutations
     * @returns { ChildListToTreesMap }
     */
    createChildListToTreesMap(mutations) {
        /** @type { ChildListToTreesMap } */
        const childListToTreesMap = new WeakMap();
        /** @type { WeakMap<Node, Node[]> } */
        const childListSnapshot = new WeakMap();
        /**
         * @param {Node} node
         * @returns {Node[]}
         */
        const getChildListSnapshot = (node) => childListSnapshot.get(node) || childNodes(node);
        /**
         * @param {Node} node
         * @returns {Tree}
         */
        const makeSnapshotTree = (node) => ({
            node,
            children: getChildListSnapshot(node).map(makeSnapshotTree),
        });
        /**
         * Reconstructs the child list before a mutation based on the state
         * after it and the child list modifications
         *
         * @param {Node[]} childListAfter
         * @param {NativeMutation} record
         * @returns {Node[]}
         */
        const reconstructChildList = (childListAfter, record) => {
            const { removedNodes, previousSibling, nextSibling } = record;
            const previousSiblingNodes = previousSibling
                ? childListAfter.slice(0, childListAfter.indexOf(previousSibling) + 1)
                : [];
            const nextSiblingNodes = nextSibling
                ? childListAfter.slice(childListAfter.indexOf(nextSibling))
                : [];
            return [...previousSiblingNodes, ...removedNodes, ...nextSiblingNodes];
        };
        mutations.toReversed().forEach((/** @type { NativeMutation } */ record) => {
            if (record.type === "childList") {
                childListToTreesMap.set(record, {
                    added: [...record.addedNodes].map(makeSnapshotTree),
                    removed: [...record.removedNodes].map(makeSnapshotTree),
                });
                // Update snapshot for previous mutations
                const childListAfterMutation = getChildListSnapshot(record.target);
                const childListBefore = reconstructChildList(childListAfterMutation, record);
                childListSnapshot.set(record.target, childListBefore);
            }
        });
        return childListToTreesMap;
    }

    // ================
    // DOM Map Handling
    // ================

    /**
     * @param { NodeId } id
     * @returns { Node | undefined }
     */
    getNodeById(id) {
        return this.nodeMap.getNode(id);
    }

    /**
     * @param {Node} node
     * @returns {NodeId}
     */
    getNodeId(node) {
        return this.nodeMap.getId(node);
    }

    /**
     * @param { Node } node
     */
    setNodeId(node) {
        let id = this.nodeMap.getId(node);
        if (!id) {
            id = node === this.editable ? "root" : this.generateId();
            this.nodeMap.set(id, node);
            node = node.firstChild;
            while (node) {
                this.setNodeId(node);
                node = node.nextSibling;
            }
        }
        return id;
    }

    /**
     * Serialize a node and its children.
     *
     * @param { Node } node
     * @returns { SerializedNode | null }
     */
    serializeNode(node) {
        return this.serializeTree(nodeToTree(node));
    }

    /**
     * @param { Tree } tree
     * @returns { SerializedNode | null }
     */
    serializeTree(tree) {
        const node = tree.node;
        const nodeId = this.getNodeId(node);
        if (!nodeId) {
            return null;
        }
        const result = {
            nodeType: node.nodeType,
            nodeId: nodeId,
        };
        if (node.nodeType === Node.TEXT_NODE) {
            result.textValue = node.nodeValue;
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            const childTreesToSerialize = this.processThrough(
                "serializable_descendants_processors",
                tree.children,
                node
            );
            result.tagName = node.tagName;
            result.attributes = Object.fromEntries(
                [...node.attributes].map((attr) => [attr.name, attr.value])
            );
            result.children = childTreesToSerialize
                .map((tree) => this.serializeTree(tree))
                .filter(Boolean);
        }
        return result;
    }

    /**
     * Serialize an editor selection.
     * @param { EditorSelection } selection
     * @returns { SerializedSelection }
     */
    serializeSelection(selection) {
        return {
            anchorNodeId: this.getNodeId(selection.anchorNode),
            anchorOffset: selection.anchorOffset,
            focusNodeId: this.getNodeId(selection.focusNode),
            focusOffset: selection.focusOffset,
        };
    }

    /**
     * Turn `EditorMutation`s into `SerializedMutation`s by replacing their
     * references to nodes with node IDs and serialized trees.
     *
     * @param { EditorMutation[] } records
     * @returns { SerializedMutation[] }
     */
    serializeEditorMutations(records) {
        return records.flatMap((record) => {
            switch (record.type) {
                case "characterData":
                case "classList":
                case "attributes": {
                    const nodeId = this.getNodeId(record.target);
                    return { ...omit(record, "target"), nodeId };
                }
                case "add":
                case "remove": {
                    const [nextNodeId, previousNodeId] = [
                        record.nextSibling,
                        record.previousSibling,
                    ].map((sibling) =>
                        // Preserve undefined and null values
                        sibling ? this.getNodeId(sibling) : sibling
                    );
                    // Note: IDs are assigned to added nodes in
                    // `processChildListMutation`.
                    return {
                        type: record.type,
                        nodeId: this.getNodeId(record.tree.node),
                        parentNodeId: this.getNodeId(record.parent),
                        serializedNode: this.serializeTree(record.tree),
                        nextNodeId,
                        previousNodeId,
                    };
                }
                default: {
                    return record;
                }
            }
        });
    }

    /**
     * Unserialize a node and its children.
     *
     * @param { SerializedNode } node
     * @returns { Node }
     */
    unserializeNode(node) {
        let [unserializedNode, newNodesMap] = this._unserializeNode(node, this.nodeMap);
        if (!unserializedNode) {
            return null;
        }
        const fakeNode = this.document.createElement("fake-el");
        // TODO AGE: this next line has the effect of REMOVING THE NODE FROM THE
        // DOM! Is that intended?
        fakeNode.appendChild(unserializedNode);
        this.dependencies.sanitize.sanitize(fakeNode, { IN_PLACE: true });
        unserializedNode = fakeNode.firstChild;
        if (!unserializedNode) {
            return null;
        }
        // Only assing id to the remaining nodes, otherwise the removed nodes
        // will still be accessible through the nodeMap and could lead to
        // security issues.
        for (const node of [unserializedNode, ...descendants(unserializedNode)]) {
            if (this.nodeMap.hasNode(node)) {
                continue;
            }
            const id = newNodesMap.get(node);
            if (id) {
                this.nodeMap.set(id, node);
            }
        }
        return unserializedNode;
    }

    /**
     * Unserialize a node and its children.
     * @param { SerializedNode } serializedNode
     * @param { Map<Node, string> } _map
     * @returns { [Node, Map<Node, string>] }
     */
    _unserializeNode(serializedNode, nodeMap = new NodeMap(), _map = new Map()) {
        let node = nodeMap.getNode(serializedNode.nodeId);
        if (node) {
            return [node, _map];
        }
        if (serializedNode.nodeType === Node.TEXT_NODE) {
            node = this.document.createTextNode(serializedNode.textValue);
        } else if (serializedNode.nodeType === Node.ELEMENT_NODE) {
            node = this.document.createElement(serializedNode.tagName);
            for (const key in serializedNode.attributes) {
                node.setAttribute(key, serializedNode.attributes[key]);
            }
            node.append(
                ...serializedNode.children
                    .map((child) => this._unserializeNode(child, nodeMap, _map)[0])
                    .filter(Boolean)
            );
        } else {
            console.warn("unknown node type");
            return [null, _map];
        }
        _map.set(node, serializedNode.nodeId);
        return [node, _map];
    }

    // =================
    // Commit management
    // =================

    /**
     * @returns { EditorCommit<DomMutationCommitData> }
     */
    createCommit(type = "original", metadata = {}) {
        this.currentChanges.updateSelectionAfter(
            this.serializeSelection(this.dependencies.selection.getEditableSelection())
        );
        return this.processThrough(
            "editor_commit_processors",
            new EditorCommit({
                type,
                data: this.currentChanges.data,
                metadata,
            })
        );
    }

    /**
     * @param { CommitType } [type = "original"]
     * @returns { EditorCommit<DomMutationCommitData> }
     */
    createSnapshotCommit(type = "original") {
        const authorTimestamp = this.currentChanges.authorTimestamp || Date.now();
        return this.processThrough(
            "editor_commit_processors",
            new EditorCommit({
                id: this.dependencies.history.getHistoryCommits().at(-1)?.id,
                type,
                data: {
                    authorTimestamp,
                    mutations: childNodes(this.editable)
                        .filter((node) => this.nodeMap.hasNode(node))
                        .map((node) => ({
                            type: "add",
                            parentNodeId: "root",
                            nodeId: this.getNodeId(node),
                            serializedNode: this.serializeNode(node),
                            nextNodeId: null,
                        })),
                    activeElementId: null,
                    selection: {
                        anchorNode: undefined,
                        anchorOffset: undefined,
                        focusNode: undefined,
                        focusOffset: undefined,
                    },
                    selectionAfter: null,
                },
            })
        );
    }

    // NEW: Apply mutations

    applyCommit(commit) {
        this.applyMutations(commit.data.mutations);
        // TODO AGE: shouldn't this also apply other changes?
    }

    revertCommit(commit, { ensureNewMutations = false } = {}) {
        this.revertChanges(commit.data, { ensureNewMutations });
    }

    /**
     * @param {CommitData} param0
     */
    revertChanges(
        { mutations, activeElementId, selection, selectionAfter },
        { ensureNewMutations = false } = {}
    ) {
        this.revertMutations(mutations, { ensureNewMutations });
        this.setSerializedFocus(activeElementId);
        this.stageFocus();
        this.setSerializedSelection(selection);
        this.currentChanges.updateSelection(selectionAfter);
    }

    /**
     * @param { EditorMutation[] } mutations
     */
    revertMutations(mutations, { ensureNewMutations = false } = {}) {
        const revertedMutations = mutations.map((mutation) => {
            switch (mutation.type) {
                case "characterData":
                case "classList":
                case "attributes":
                    return { ...mutation, value: mutation.oldValue, oldValue: mutation.value };
                case "remove":
                    return { ...mutation, type: "add" };
                case "add":
                    return { ...mutation, type: "remove" };
                case "custom":
                    return { ...mutation, apply: mutation.revert, revert: mutation.apply };
                default:
                    throw new Error(`Unknown mutation type: ${mutation.type}`);
            }
        });
        this.applyMutations(revertedMutations.toReversed(), { ensureNewMutations, reverse: true });
    }

    /**
     * @param { EditorMutation[] } mutations
     * @param { Object } options
     * @param { boolean } options.ensureNewMutations whether to ensure new
     *        mutations are generated when applying the mutations
     * @param { boolean } options.reverse whether the mutations are the reverse
     *        of other mutations
     */
    applyMutations(mutations, { ensureNewMutations = false, reverse = false } = {}) {
        if (ensureNewMutations) {
            this.fixClassListMutationsToEnsureNewMutations(mutations);
        }
        for (const mutation of mutations) {
            switch (mutation.type) {
                case "custom": {
                    mutation.apply();
                    break;
                }
                case "characterData": {
                    const node = this.getNodeById(mutation.nodeId);
                    if (node) {
                        node.textContent = mutation.value;
                    }
                    break;
                }
                case "classList": {
                    const node = this.getNodeById(mutation.nodeId);
                    if (node) {
                        toggleClass(node, mutation.className, mutation.value);
                    }
                    break;
                }
                case "attributes": {
                    const node = this.getNodeById(mutation.nodeId);
                    if (node) {
                        const { value } = this.processThrough(
                            "attribute_change_processors",
                            { ...mutation, reverse },
                            { ensureNewMutations }
                        );
                        this.setAttribute(node, mutation.attributeName, value);
                    }
                    break;
                }
                case "remove": {
                    this.applyRemoveMutation(mutation);
                    break;
                }
                case "add": {
                    this.applyAddMutation(mutation);
                    break;
                }
            }
        }
    }

    /**
     * @param { Node } node
     * @param { string } attributeName
     * @param { string } attributeValue
     */
    setAttribute(node, attributeName, attributeValue) {
        if (this.delegateTo("set_attribute_overrides", node, attributeName, attributeValue)) {
            return;
        }

        // if attributeValue is falsy but not null, we still need to apply it
        if (attributeValue !== null) {
            node.setAttribute(attributeName, attributeValue);
        } else {
            node.removeAttribute(attributeName);
        }
    }

    /**
     * @param { EditorMutation<"add"> } mutation
     */
    applyAddMutation(mutation) {
        const { nodeId, serializedNode, parentNodeId, nextNodeId, previousNodeId } = mutation;

        const toAdd = this.getNodeById(nodeId) || this.unserializeNode(serializedNode);
        if (!toAdd) {
            return;
        }

        const parent = this.getNodeById(parentNodeId);
        if (!parent) {
            console.warn("Mutation could not be applied, parent node is missing.", mutation);
            return;
        }
        if (previousNodeId === null) {
            parent.prepend(toAdd);
            return;
        }
        if (nextNodeId === null) {
            parent.append(toAdd);
            return;
        }
        const isValid = (node) => node?.parentNode === parent;
        const previousNode = this.getNodeById(previousNodeId);
        if (isValid(previousNode)) {
            previousNode.after(toAdd);
            return;
        }
        const nextNode = this.getNodeById(nextNodeId);
        if (isValid(nextNode)) {
            nextNode.before(toAdd);
            return;
        }
        console.warn("Mutation could not be applied, reference nodes are invalid.", mutation);
    }

    /**
     * @param { EditorMutation<"remove"> } mutation
     */
    applyRemoveMutation(mutation) {
        const parent = this.getNodeById(mutation.parentNodeId);
        const toRemove = this.getNodeById(mutation.nodeId);
        if (!toRemove) {
            console.warn("Mutation could not be applied, node to remove is unknown.", mutation);
            return;
        }
        if (toRemove.parentElement !== parent) {
            console.warn("Mutation could not be applied, parent node does not match.", mutation);
            return;
        }
        toRemove.remove();
    }

    /**
     * @param { SerializedSelection } selection
     */
    setSerializedSelection(selection) {
        if (!selection.anchorNodeId) {
            return;
        }
        const anchorNode = this.getNodeById(selection.anchorNodeId);
        if (!anchorNode) {
            return;
        }
        const newSelection = {
            anchorNode,
            anchorOffset: selection.anchorOffset,
        };
        const focusNode = this.getNodeById(selection.focusNodeId);
        if (focusNode) {
            newSelection.focusNode = focusNode;
            newSelection.focusOffset = selection.focusOffset;
        }
        this.dependencies.selection.setSelection(newSelection, { normalize: false });
        // @todo @phoenix add this in the selection or table plugin.
        // // If a table must be selected, ensure it's in the same tick.
        // this._handleSelectionInTable();
    }

    /**
     * @param { NodeId } activeElementId
     */
    setSerializedFocus(activeElementId) {
        const elementToFocus =
            activeElementId === "root"
                ? this.editable
                : activeElementId && this.getNodeById(activeElementId);
        if (elementToFocus?.isConnected && elementToFocus !== this.document.activeElement) {
            elementToFocus.focus();
        }
    }

    // Observer stuff

    enableObserver() {
        this.observer.observe(this.editable, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeOldValue: true,
            characterData: true,
            characterDataOldValue: true,
        });
    }

    /**
     * Disable the mutation observer.
     *
     * /!\ This method should be used with extreme caution. Not observing some
     * mutations could lead to mutations that are impossible to undo/redo.
     */
    disableObserver() {
        const enableObserver = () => {
            this.enableObserverCallbacks.delete(enableObserver);
            if (this.enableObserverCallbacks.size > 0) {
                return;
            }
            this.flush();
            this.isObserverDisabled = false;
        };
        this.enableObserverCallbacks.add(enableObserver);
        this.flush();
        this.isObserverDisabled = true;
        return enableObserver;
    }

    /**
     * This is not shared as it is only used internally by the DOM mutation plugin.
     * Other plugins should use {@link ignoreDOMMutations} instead.
     * TODO AGE: why do we need this _and_ disableObserver?
     */
    withObserverOff(callback) {
        this.flush();
        this.observer.disconnect();
        callback();
        this.enableObserver();
    }

    /**
     * Execute {@link callback} while the MutationObserver is disabled.
     *
     * /!\ This method should be used with extreme caution. Not observing some
     * mutations could lead to mutations that are impossible to undo/redo.
     *
     * /!\ Do not re-introduce nodes that had been already added to the DOM in
     * a commit. @see isObservedNode
     *
     * @param { Function } callback
     */
    ignoreDOMMutations(callback) {
        const enableObserver = this.disableObserver();
        try {
            return callback();
        } finally {
            enableObserver();
        }
    }

    /**
     * Any node that was added to the DOM without a mutation record in a commit
     * (typically due to {@link ignoreDOMMutations}) is considered an unobserved
     * node.
     *
     * A known limitation to this approach is when a node that had been present
     * in the editable before (and thus has an entry in the nodeMap) is re-added
     * with {@link ignoreDOMMutations}. Such node will not be flagged as
     * unobserved and history might become inconsistent.
     *
     * @param { Node } node
     * @returns { boolean }
     */
    isObservedNode(node) {
        return this.nodeMap.hasNode(node);
    }

    disableHasStagedMutationsWarning() {
        this.ignoreHasStagedMutations = true;
        return () => {
            this.ignoreHasStagedMutations = false;
        };
    }

    hasStagedMutations() {
        if (this.ignoreHasStagedMutations) {
            return false;
        }
        return !!this.currentChanges.mutations.find((m) =>
            ["characterData", "remove", "add"].includes(m.type)
        );
    }

    /**
     * When applying mutations for a new commit, we expect them to produce
     * observable mutations, which will then be stored in a new commit. However,
     * there are situations where applying a classList mutation would not
     * produce an observable mutation:
     * - adding a class that is already present
     * - removing a class that is already absent
     * These scenarios might happen due to the class having been already added
     * or removed by a previous unobserved mutation. We want, nevertheless to
     * produce the observable mutation of adding/removing this class, as this
     * does correspond to a state change in observable history and should be
     * included in the new commit. In order to produce such observable
     * mutations, we set the dom state to the one that would produce the desired
     * result. This is equivalent to restoring the dom to the observed state in
     * recorded history before applying a mutation, that is, oldValue (as
     * oldValue is always !value for staged classList records).
     *
     * @param { EditorMutation[] } mutations
     */
    fixClassListMutationsToEnsureNewMutations(mutations) {
        const isFirstOcurrence = trackOccurrencesPair();
        // Mutations that when applied would not produce observable classList mutations
        const nonObservableClassMutations = mutations
            .filter((mutation) => mutation.type === "classList")
            .filter(({ nodeId, className }) => isFirstOcurrence(nodeId, className))
            .map((mutation) => ({
                ...mutation,
                node: this.getNodeById(mutation.nodeId),
            }))
            .filter(({ node, className, value }) => value === node?.classList.contains(className));
        if (nonObservableClassMutations.length) {
            const setToOldValue = ({ node, className, oldValue }) =>
                toggleClass(node, className, oldValue);
            this.withObserverOff(() => nonObservableClassMutations.forEach(setToOldValue));
        }
    }

    dispatchContentUpdated() {
        if (this.currentChanges.mutations.length) {
            // @todo @phoenix remove this?
            // @todo @phoenix this includes previous mutations that were already
            // stored in the current commit. Ideally, it should only include the new ones.
            const root = this.getMutationsRoot(this.currentChanges.mutations);
            if (root) {
                this.trigger("on_content_updated_handlers", root);
            }
        }
    }

    // State storage stuff

    /**
     * This function, alongside @see updateOldValue, ensures mutation records
     * have the correct historical "oldValue" by checking against the last
     * observed state.
     *
     * When the observer is disabled, we store the record's `oldValue` for a
     * node's attribute/class/textContent as the last observed value.
     *
     * As multiple mutations to the same node-attribute/class/textContent can
     * happen with the observer disabled, we store only the first value
     * encountered for each node-attribute/class/text. This way, we capture the
     * state as it was before any modifications in the disabled observer
     * sequence began.
     *
     * @see updateOldValue
     *
     * @param { NativeMutation<"attributes"|"characterData"> } record
     */
    storeOldValue(record) {
        /** @type { (NativeMutation<"attributes"|"characterData"> | EditorMutation<"classList">)[] } */
        let mutations = [record];
        if (record.type === "attributes" && record.attributeName === "class") {
            // If the record is a change in a class attribute, first split it so
            // we can handle the old value of each class individually.
            mutations = this.createClassListMutations(record);
        }
        for (const mutation of mutations) {
            const { stateMap, key } = this.getObservedStateStorage(mutation);
            // Only store it if not already stored.
            if (!stateMap.has(key)) {
                stateMap.set(key, mutation.oldValue);
            }
        }
    }

    /**
     * @template { "attributes" | "characterData" } T
     * @param { |
     *        NativeMutation<T>
     *      | EditorMutation<T | "childList">
     * } record
     * @returns { {
     *      stateMap: ObservedState[T | "childList"],
     *      key: string
     * } }
     */
    getObservedStateStorage(record) {
        // Add entry for current target if not already present.
        if (!this.lastObservedState.has(record.target)) {
            this.lastObservedState.set(record.target, {
                attributes: new Map(),
                classList: new Map(),
                characterData: new Map(),
            });
        }
        const stateMap = this.lastObservedState.get(record.target)[record.type];
        switch (record.type) {
            case "attributes":
                return { stateMap, key: record.attributeName };
            case "classList":
                return { stateMap, key: record.className };
            case "characterData":
                return { stateMap, key: "textContent" };
            default:
                throw new Error(`Unsupported mutation type: ${record.type}`);
        }
    }

    /**
     * This function, alongside @see storeOldValue, ensures mutation records
     * have the correct historical "oldValue" by checking against the last
     * observed state.
     *
     * When the observer is enabled, it updates a record's `oldValue` with the
     * last observed state, and removes the entry to prevent reuse. Without
     * removing the entry, the same historical value might be incorrectly
     * applied to future mutation records targeting the same
     * attribute/class of the same element, which would create incorrect
     * history mutations.
     *
     * @template { NativeMutationType } T
     * @param { EditorMutation<T>} record
     * @returns { EditorMutation<T> }
     */
    updateOldValue(record) {
        const { stateMap, key } = this.getObservedStateStorage(record);
        if (!stateMap.has(key)) {
            return record;
        }
        const lastObservedValue = stateMap.get(key);
        // Remove entry, so it won't be used again.
        stateMap.delete(key);
        return { ...record, oldValue: lastObservedValue };
    }

    // Staging stuff

    /**
     * Set the serialized selection of the currentChanges.
     *
     * This method is used to save a serialized selection in the currentChanges.
     * It will be necessary if the commit is reverted at some point because we
     * need to set the selection to where it was before any mutation was made.
     *
     * It means that we should not call this method in the middle of mutations
     * because if a selection is set onto a node that is edited/added/removed
     * within the same commit, it might become impossible to set the selection
     * when reverting the commit.
     */
    stageSelection() {
        this.stageFocus();
        const selection = this.dependencies.selection.getEditableSelection();
        if (this.hasStagedMutations()) {
            console.warn(
                `should not have any "characterData", "remove" or "add" mutations in current changes when you update the selection`
            );
            return;
        }
        this.currentChanges.updateSelection(this.serializeSelection(selection));
    }

    /**
     * Set the serialized focus of the currentChanges.
     */
    stageFocus() {
        let activeElement = this.document.activeElement;
        if (activeElement.contains(this.editable)) {
            activeElement = this.editable;
        }
        if (this.editable.contains(activeElement)) {
            this.currentChanges.updateActiveElement(this.setNodeId(activeElement));
        }
    }

    // Custom mutations

    applyCustomMutation({ apply, revert }) {
        apply();
        this.stageCustomMutation({ apply, revert });
    }

    stageCustomMutation({ apply, revert }) {
        const customMutation = {
            type: "custom",
            // Note AGE: this definitely fails in collaborative since it's not
            // serializable. Do we need it in collaborative?
            apply: () => {
                apply();
                this.stageCustomMutation({ apply, revert });
            },
            revert: () => {
                revert();
                this.stageCustomMutation({ apply: revert, revert: apply });
            },
        };
        this.stage(customMutation);
    }

    // Preview stuff

    /**
     * TODO AGE: review link with history and commits.
     * Restores the editable to the state of a previous commit.
     * It does so by discarding the current draft and reverting reversible commits
     * until the specified commit index, while ensuring that irreversible commits
     * are maintained. This will add a new "restore" commit and set the reverted
     * commits's state to "discarded".
     *
     * @param { Commit } commit
     * @returns { CommitData | undefined }
     */
    restoreToCommit(commit) {
        this.discard();
        if (commit === this.dependencies.history.getHistoryCommits().at(-1)) {
            return;
        }
        let lastRevertedChanges = this.currentChanges.data;
        const commitsToRestore = this.dependencies.history.getCommitsUntil(commit.id);
        const irreversibleCommits = [];
        for (const commitToRestore of commitsToRestore) {
            this.revertMutations(commitToRestore.data.mutations, {
                ensureNewMutations: true,
            });
            // Process and stage mutations so that the attribute comparison for
            // the state change is done with the intermediate attribute value
            // and not with the final value in the DOM after all commits were
            // reverted then applied again.
            this.flush({ dispatch: false });
            if (commitToRestore.discard) {
                commitToRestore.discard();
                lastRevertedChanges = commitToRestore.data;
            } else {
                irreversibleCommits.unshift(commitToRestore);
            }
        }
        // Re-apply every non reversible commit (typically collaborators commits).
        for (const irreversibleCommit of irreversibleCommits) {
            this.applyMutations(irreversibleCommit.data.mutations, {
                ensureNewMutations: true,
            });
            this.flush({ dispatch: false });
        }
        // TODO ABD TODO @phoenix: review selections, this selection could be obsolete
        // depending on the non-reversible commits that were applied.
        this.setSerializedSelection(lastRevertedChanges.selection);
        // Register resulting mutations as a new "restore" commit (prevent undo).
        this.dispatchContentUpdated();
        this._commit({ type: "restore" });
        return lastRevertedChanges;
    }

    /**
     * Returns a function that can be later called to revert history to the
     * current state.
     * @returns { Function }
     */
    makeSavePoint() {
        this.flush();
        const draftMutations = [...this.currentChanges.mutations];
        // TODO ABD TODO @phoenix: selection may become obsolete, it should evolve with mutations.
        const selectionToRestore = this.dependencies.selection.preserveSelection();

        // Preserve any current data not handled by this plugin for a later commit.
        const dataToPreserve = { ...this.currentChanges.external };

        const commit = this.dependencies.history.getHistoryCommits().at(-1);
        let hasBeenRestored = false;
        return () => {
            if (hasBeenRestored) {
                return;
            }
            hasBeenRestored = true;
            const lastRevertedChanges = this.restoreToCommit(commit);

            if (lastRevertedChanges?.selection && !draftMutations.length) {
                selectionToRestore.setCursor((cursor) => {
                    const anchorNode = this.nodeMap.getNode(
                        lastRevertedChanges.selection.anchorNodeId
                    );
                    const focusNode = this.nodeMap.getNode(
                        lastRevertedChanges.selection.focusNodeId
                    );
                    cursor.anchor.node = anchorNode;
                    cursor.anchor.offset = lastRevertedChanges.selection.anchorOffset;

                    cursor.focus.node = focusNode;
                    cursor.focus.offset = lastRevertedChanges.selection.focusOffset;
                });
            }

            // Apply draft mutations to recover the same currentChanges state
            // as before.
            this.applyMutations(draftMutations, { ensureNewMutations: true });
            this.flush();
            // TODO ABD TODO @phoenix: evaluate if the selection is not restorable at the desired position
            selectionToRestore.restore();
            Object.entries(dataToPreserve).forEach(([key, value]) => {
                this.updateExternal(key, value);
            });
            this.trigger("on_savepoint_restored_handlers");
        };
    }

    /**
     * Creates a set of functions to preview, apply, and revert an operation.
     * @param { Function } operation
     * @returns { PreviewableOperation }
     */
    makePreviewableOperation(operation) {
        let revertOperation = () => {};

        return {
            preview: (...args) => {
                revertOperation();
                revertOperation = this.makeSavePoint();
                this.isPreviewing = true;
                this.stageSelection();
                operation(...args);
                // todo: We should not add a commit on preview as it would send
                // unnecessary commits in collaboration and let the other peer
                // see what we preview.
                //
                // The operation should be similar to the 'commit' (normalize
                // etc...) hence the call to 'commit' (but we need to remove it
                // for the collaboration).
                this.commit();
            },
            commit: (...args) => {
                revertOperation();
                this.isPreviewing = false;
                operation(...args);
                this.commit();
            },
            revert: () => {
                revertOperation();
                revertOperation = () => {};
                this.isPreviewing = false;
            },
        };
    }

    /**
     * Creates a set of functions to preview, apply, and revert an async operation.
     * @param { Function } operation
     * @returns { PreviewableOperation }
     */
    makePreviewableAsyncOperation(operation) {
        let revertOperation = async () => {};

        return {
            preview: async (...args) => {
                await revertOperation();
                const { promise, resolve } = Promise.withResolvers();
                const revertSavePoint = this.makeSavePoint();
                revertOperation = async () => {
                    await promise;
                    revertSavePoint();
                };
                this.isPreviewing = true;
                try {
                    await operation(...args);
                } catch (error) {
                    revertSavePoint();
                    throw error;
                } finally {
                    resolve();
                }
                if (this.isDestroyed) {
                    return;
                }
                // todo: We should not add a commit on preview as it would send
                // unnecessary commits in collaboration and let the other peer
                // see what we preview.
                //
                // The operation should be similar to the 'commit' (normalize
                // etc...) hence the call to 'commit' (but we need to remove it
                // for the collaboration).
                this.commit();
            },
            commit: async (...args) => {
                await revertOperation();
                this.isPreviewing = false;
                const revertSavePoint = this.makeSavePoint();
                try {
                    await operation(...args);
                } catch (error) {
                    revertSavePoint();
                    throw error;
                }
                if (this.isDestroyed) {
                    return;
                }
                this.commit();
            },
            revert: async () => {
                await revertOperation();
                revertOperation = () => {};
                this.isPreviewing = false;
            },
        };
    }

    getIsPreviewing() {
        return !!this.isPreviewing;
    }

    /**
     * Returns the deepest common ancestor element of the given mutations.
     * @param { (EditorMutation)[] } mutations - The array of mutations.
     * @returns { HTMLElement | null } - The common ancestor element.
     */
    getMutationsRoot(mutations) {
        const nodes = mutations
            .map((m) => this.getNodeById(m.parentNodeId || m.nodeId))
            .filter((node) => this.editable.contains(node));
        let commonAncestor = getCommonAncestor(nodes, this.editable);
        if (commonAncestor?.nodeType === Node.TEXT_NODE) {
            commonAncestor = commonAncestor.parentElement;
        }
        return commonAncestor;
    }

    /**
     * @returns { NodeId  }
     */
    generateId() {
        // No need for secure random number.
        return Math.floor(Math.random() * Math.pow(2, 52)).toString();
    }
}

class CurrentChanges {
    constructor() {
        /** @type { number } */
        this._authorTimestamp = Date.now();
        /** @type { SerializedMutation[] } */
        this._mutations = [];
        /** @type { NodeId | null } */
        this._activeElementId = null;
        /** @type { SerializedSelection | {} } */
        this._selection = {};
        /** @type { SerializedSelection | null } */
        this._selectionAfter = null;
        /** @type { Object } */
        this._external = {};
    }

    /**
     * @return { DomMutationCommitData }
     */
    get data() {
        return {
            authorTimestamp: this._authorTimestamp,
            mutations: [...this._mutations],
            activeElementId: this._activeElementId,
            selection: { ...this._selection },
            selectionAfter: { ...(this._selectionAfter || {}) },
            external: { ...this._external },
        };
    }

    get authorTimestamp() {
        return this._authorTimestamp;
    }

    get mutations() {
        return [...this._mutations];
    }

    get activeElementId() {
        return this._activeElementId;
    }

    get selection() {
        return this._selection;
    }

    get selectionAfter() {
        return this._selectionAfter;
    }

    get external() {
        return this._external;
    }

    /**
     * @param  { ...SerializedMutation } mutations
     */
    addMutations(...mutations) {
        this._mutations.push(...mutations);
    }

    resetMutations() {
        this._mutations = [];
    }

    /**
     * @param { NodeId } nodeId
     */
    updateActiveElement(nodeId) {
        this._activeElementId = nodeId;
    }

    /**
     * @param { SerializedSelection } serializedSelection
     */
    updateSelection(serializedSelection) {
        this._selection = serializedSelection;
    }

    /**
     * @param { SerializedSelection } serializedSelection
     */
    updateSelectionAfter(serializedSelection) {
        this._selectionAfter = serializedSelection;
    }

    /**
     * Set a key/value pair in the external data.
     *
     * @param { string } key
     * @param { any } value
     */
    updateExternal(key, value) {
        this._external[key] = value;
    }
}
