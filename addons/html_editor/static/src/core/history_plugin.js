import { Plugin } from "../plugin";
import { hasTouch } from "@web/core/browser/feature_detection";
import { withSequence } from "@html_editor/utils/resource";
import { _t } from "@web/core/l10n/translation";

/**
 * @typedef { Object } PreviewableOperation
 * @property { Function } commit
 * @property { Function } preview
 * @property { Function } revert
 */

/**
 * @typedef { Object } HistoryShared
 * @property { HistoryPlugin['commit'] } commit
 * @property { HistoryPlugin['stash'] } stash
 * @property { HistoryPlugin['unstash'] } unstash
 * @property { HistoryPlugin['undo'] } undo
 * @property { HistoryPlugin['redo'] } redo
 * @property { HistoryPlugin['canUndo'] } canUndo
 * @property { HistoryPlugin['canRedo'] } canRedo
 * @property { HistoryPlugin['stage'] } stage
 * @property { HistoryPlugin['getStaged'] } getStaged
 * @property { HistoryPlugin['applyOperation'] } applyOperation
 * @property { HistoryPlugin['getCommits'] } getCommits
 * @property { HistoryPlugin['reset'] } reset
 * @property { HistoryPlugin['createSnapshotCommit'] } createSnapshotCommit
 * @property { HistoryPlugin['insertRemoteCommit'] } insertRemoteCommit
 * @property { HistoryPlugin['getIsPreviewing'] } getIsPreviewing
 * @property { HistoryPlugin['makePreviewableOperation'] } makePreviewableOperation
 * @property { HistoryPlugin['makePreviewableAsyncOperation'] } makePreviewableAsyncOperation
 * @property { HistoryPlugin['makeSavePoint'] } makeSavePoint
 */
/**
 * A field is a named entry of the commit data. Its value is staged in the
 * history draft, then collected into the next commit, after which the draft is
 * cleared. Staged values are immutable: replace them, don't mutate them.
 *
 * - `collect` returns the field's value for the commit being created, from
 *   its staged value (used as is by default). Undefined values are left out
 *   of the commit.
 * - `apply` and `revert` replay the field's value when its commit is applied or
 *   reverted. `ensureNewMutations` is true when what they replay must end up
 *   in the draft, to be collected into a new commit (undo, redo, savepoint
 *   restoration).
 * - `discard` makes the field's draft pending changes: discarding them (stash,
 *   undo, redo, savepoint restoration) calls it, then clears the field. Other
 *   fields keep their draft.
 *
 * Fields are collected, applied, reverted and discarded in resource order.
 *
 * @template [T=any]
 * @typedef {Object} HistoryField
 * @property {string} name
 * @property {(stagedValue: T | undefined, context: { relatedCommit?: HistoryCommit }) => T} [collect]
 * @property {(value: T, options: { ensureNewMutations: boolean }) => void} [apply]
 * @property {(value: T, options: { ensureNewMutations: boolean }) => void} [revert]
 * @property {(stagedValue: T | undefined) => void} [discard]
 */
/** @typedef {HistoryField[]} history_fields */
/**
 * An operation is a change made with `applyOperation`, which applies it and
 * stages it with its data. The history then replays it from that data: `apply`
 * to redo it, `revert` to undo it. Its data must therefore be serializable.
 *
 * @template [T=any]
 * @typedef {Object} HistoryOperation
 * @property {string} id
 * @property {(data: T) => any} apply
 * @property {(data: T) => any} revert
 */
/** @typedef {HistoryOperation[]} history_operations */

/**
 * @typedef { ((commit: HistoryCommit, options: { ensureNewMutations: boolean, restoreSelection: boolean }) => void)[] } on_apply_history_commit_handlers
 * @typedef { ((commit: HistoryCommit) => void)[] } on_committed_to_history_handlers
 * @typedef { (() => void)[] } on_history_commit_restored_handlers
 * @typedef { ((lastCommitUndone: HistoryCommit<"standard" | "redo"> | undefined) => void)[] } on_history_commit_undone_handlers
 * @typedef { ((lastCommitRedone: HistoryCommit<"undo"> | undefined) => void)[] } on_history_commit_redone_handlers
 * @typedef { (() => void)[] } on_history_rebased_handlers
 * @typedef { (() => void)[] } on_history_reset_handlers
 * @typedef { (() => void)[] } on_irreversible_history_commit_applied_handlers
 * @typedef { ((stashedCommit: HistoryCommit<"stash">) => void)[] } on_pending_changes_unstashed_handlers
 * @typedef { ((newCommit: HistoryCommit) => void)[] } on_remote_history_commit_applied_handlers
 * @typedef { ((commit: HistoryCommit, options: { ensureNewMutations: boolean, restoreFocus: boolean }) => void)[] } on_revert_history_commit_handlers
 * @typedef { ((savePoint: HistoryCommit<"savePoint">) => void)[] } on_savepoint_restored_handlers
 * @typedef { (() => void)[] } on_will_preview_handlers
 * @typedef { (() => void)[] } on_will_rebase_history_handlers
 * @typedef { (() => void)[] } on_will_reset_history_handlers
 *
 * @typedef { ((commit: HistoryCommit) => boolean | undefined)[] } has_history_commit_changes_predicates
 * @typedef { ((commit: HistoryCommit) => boolean | undefined)[] } is_history_commit_reversible_predicates
 *
 * @typedef { ((data: HistoryCommitData) => HistoryCommitData)[] } pending_history_commit_data_processors
 * @typedef { ((data: HistoryCommitData<"savePoint">) => HistoryCommitData<"savePoint">)[] } save_point_history_commit_data_processors
 * @typedef { ((data: HistoryCommitData<"standard"> & { authorTimestamp: number }) => HistoryCommitData<"standard">)[] } snapshot_history_commit_data_processors
 */

export const COMMIT_DEBOUNCE_DELAY = 250;
export const HISTORY_COMMIT_TYPES = /** @type {const} */ ({
    STANDARD: "standard",
    UNDO: "undo",
    REDO: "redo",
    RESTORE: "restore",
    SAVEPOINT: "savePoint",
    STASH: "stash",
});

export class HistoryPlugin extends Plugin {
    static id = "history";
    static dependencies = ["domReferenceMap"];
    static shared = [
        "commit",
        "stash",
        "unstash",
        "undo",
        "redo",
        "canUndo",
        "canRedo",
        "stage",
        "getStaged",
        "applyOperation",
        "getCommits",
        "reset",
        "createSnapshotCommit",
        "insertRemoteCommit",

        // Preview
        "getIsPreviewing",
        "makePreviewableOperation",
        "makePreviewableAsyncOperation",
        "makeSavePoint",
    ];
    /** @type {import("plugins").EditorResources} */
    resources = {
        user_commands: [
            {
                id: "historyUndo",
                description: _t("Undo"),
                icon: "undo",
                run: this.undo.bind(this),
            },
            {
                id: "historyRedo",
                description: _t("Redo"),
                icon: "redo",
                run: this.redo.bind(this),
            },
        ],
        ...(hasTouch() && {
            toolbar_groups: withSequence(5, { id: "historyMobile" }),
            toolbar_items: [
                {
                    id: "undo",
                    groupId: "historyMobile",
                    commandId: "historyUndo",
                    isDisabled: () => !this.canUndo(),
                    namespaces: ["compact", "expanded"],
                },
                {
                    id: "redo",
                    groupId: "historyMobile",
                    commandId: "historyRedo",
                    isDisabled: () => !this.canRedo(),
                    namespaces: ["compact", "expanded"],
                },
            ],
        }),
        shortcuts: [
            { hotkey: "control+z", commandId: "historyUndo", global: true },
            { hotkey: "control+y", commandId: "historyRedo", global: true },
            { hotkey: "control+shift+z", commandId: "historyRedo", global: true },
        ],

        on_editor_started_handlers: () => {
            this.reset();
        },
        on_will_reset_history_handlers: this.resetAuthorTimestamp.bind(this),
        on_committed_to_history_handlers: withSequence(0, () => {
            this.resetAuthorTimestamp();
            this.stagedData = {};
        }),

        // Operations

        // Operations can depend on attributes restored by the DOM observer.
        // Replay them after DOM mutations.
        history_fields: withSequence(20, {
            id: "operations",
            apply: (operations, { ensureNewMutations }) =>
                this.replayOperations(operations, { ensureNewMutations }),
            revert: (operations, { ensureNewMutations }) =>
                this.replayOperations(operations, { reverse: true, ensureNewMutations }),
            discard: (operations = []) => this.replayOperations(operations, { reverse: true }),
        }),
        on_pending_changes_unstashed_handlers: (stashedCommit) => {
            if (stashedCommit.data.operations) {
                // Applying the stash did not record its operations.
                this.stage("operations", stashedCommit.data.operations);
            }
        },
        has_history_commit_changes_predicates: (commit) =>
            commit.data.operations?.length ? true : undefined,
    };

    setup() {
        this.stagedData = {};
        this.fields = new Map();
        for (const field of this.getResource("history_fields")) {
            if (this.fields.has(field.id)) {
                throw new Error(`Duplicate history field: ${field.id}`);
            }
            this.fields.set(field.id, field);
        }
        this.operations = new Map();
        for (const operation of this.getResource("history_operations")) {
            if (this.operations.has(operation.id)) {
                throw new Error(`Duplicate history operation: ${operation.id}`);
            }
            this.operations.set(operation.id, operation);
        }
        this.resetAuthorTimestamp();
        this._onKeyupResetContenteditableNodes = [];
        this.addDomListener(this.document, "beforeinput", this.onDocumentBeforeInput.bind(this));
        this.addDomListener(this.document, "input", this.onDocumentInput.bind(this));
        /** @type { HistoryCommit<"stash">[] } */
        this.currentStash = [];
    }

    /**
     * Reset the history. If commits are provided, apply them into the blank DOM
     * of the editor and start the history with these commits.
     *
     * @param { HistoryCommit[] } [commits]
     */
    reset(commits) {
        this.stagedData = {};
        this.trigger("on_will_reset_history_handlers");
        this.commits = commits || [this.createSnapshotCommit()];
        /** @type {Set<HistoryCommitId>} Commits reverted by undo/redo operations */
        this.revertedCommits = new Set();
        /** @type {Set<HistoryCommitId>} Commits reverted by restoring to a save point */
        this.discardedCommits = new Set();
        if (commits) {
            this.trigger("on_will_rebase_history_handlers");
            this.editable.replaceChildren();
            commits.forEach(this.applyCommit.bind(this));
            this.trigger("on_history_rebased_handlers");
        }
        this.trigger("on_history_reset_handlers");
    }

    // ===============
    // Core public API
    // ===============

    /**
     * Create a commit from data and write it to history.
     *
     * @param { HistoryCommitData<"standard"> } [initialData = {}]
     * @returns { HistoryCommit<"standard"> | false }
     */
    commit(initialData = {}) {
        // Set the type of the commit here. That way, the state of undo and redo
        // is truly accessible when executing the `onChange` callback. It is
        // useful for external components if they execute `can(Undo|Redo)`.
        const data = this.processCommitData({
            batchable: false, // possibly overridden by `initialData`
            ...initialData,
            authorTimestamp: this.authorTimestamp,
        });
        const commit = new HistoryCommit({ data });
        return this.appendCommit(commit);
    }

    /**
     * Undo the last undo-able batch of commits.
     */
    undo() {
        this.reverse(HISTORY_COMMIT_TYPES.UNDO);
    }

    /**
     * Redo the last redo-able batch of commits.
     */
    redo() {
        this.reverse(HISTORY_COMMIT_TYPES.REDO);
    }

    /**
     * Gather all staged changes and add them to the stash for later use. Then
     * discard those changes.
     */
    stash() {
        const stashCommit = new HistoryCommit({
            type: HISTORY_COMMIT_TYPES.STASH,
            /** @type { HistoryCommitData<"stash"> }*/
            data: this.processCommitData(),
        });
        this.currentStash.push(stashCommit);
        this.discardStagedChanges();
    }

    /**
     * Take the commit at the given index in the stash (or the last one by
     * default), apply its changes and remove it from the stash.
     *
     * /!\ Conflicts may occur and are not handled so use with care.
     *
     * @param { number } [index = -1]
     */
    unstash(index = -1) {
        if (this.currentStash.length > index) {
            const stashedCommit = this.currentStash.splice(index, 1)[0];
            this.applyCommit(stashedCommit);
            this.trigger("on_pending_changes_unstashed_handlers", stashedCommit);
        }
    }

    /**
     * Stage the value of a field in the draft, to be collected into the next
     * commit. Staged values are immutable: replace them, don't mutate them.
     *
     * @param {string} id The registered field.
     * @param {any} value
     */
    stage(id, value) {
        this.getField(id);
        this.stagedData[id] = value;
    }

    /**
     * Return the value of a field in the draft.
     *
     * @param {string} id The registered field.
     * @returns {any} The staged value, undefined if none.
     */
    getStaged(id) {
        this.getField(id);
        return this.stagedData[id];
    }

    /**
     * Look up a registered history field.
     *
     * @param {string} id
     * @returns {HistoryField}
     * @throws {Error} If the field is not registered.
     */
    getField(id) {
        const field = this.fields.get(id);
        if (!field) {
            throw new Error(`Unknown history field: ${id}`);
        }
        return field;
    }

    /**
     * Discard the pending changes of the draft: fields with a `discard` hook
     * revert them and are cleared. Other fields keep their draft.
     *
     * @returns {void}
     */
    discardStagedChanges() {
        for (const { id, discard } of this.fields.values()) {
            if (discard) {
                const stagedValue = this.stagedData[id];
                delete this.stagedData[id];
                discard(stagedValue);
            }
        }
    }

    /**
     * Bring the draft back to the given copy, after its pending changes were
     * discarded: apply them again so that they are staged anew, and stage the
     * other fields back.
     *
     * @param {Record<string, any>} stagedData
     * @returns {void}
     */
    restoreStagedData(stagedData) {
        for (const { id, apply, discard } of this.fields.values()) {
            if (!discard) {
                this.stagedData[id] = stagedData[id];
            } else if (id in stagedData) {
                apply?.(stagedData[id], { ensureNewMutations: true });
            }
        }
    }

    /**
     * Apply an operation and stage it, to be replayed with the commit it ends
     * up in: applied again on redo, reverted on undo.
     *
     * @param {string} id The registered operation.
     * @param {any} data Serializable data passed to the operation's handlers.
     * @returns {any} The value returned by the operation's `apply` handler.
     */
    applyOperation(id, data) {
        const operation = this.getOperation(id);
        data = structuredClone(data);
        this.stageOperation({ id, data, reversed: false });
        return operation.apply(data);
    }

    /**
     * Look up a registered history operation.
     *
     * @param {string} id
     * @returns {HistoryOperation}
     * @throws {Error} If the operation is not registered.
     */
    getOperation(id) {
        const operation = this.operations.get(id);
        if (!operation) {
            throw new Error(`Unknown history operation: ${id}`);
        }
        return operation;
    }

    /**
     * Add an operation after the staged ones.
     *
     * @param {{ id: string, data: any, reversed: boolean }} operation
     * @returns {void}
     */
    stageOperation(operation) {
        this.stage("operations", [...(this.stagedData.operations ?? []), operation]);
    }

    /**
     * Replay operations through their registered apply/revert handlers.
     *
     * @param {{ id: string, data: any, reversed: boolean }[]} operations
     * @param {Object} [options={}]
     * @param {boolean} [options.reverse=false] Revert the operations, last first.
     * @param {boolean} [options.ensureNewMutations=false] Stage the replayed
     *        operations.
     * @returns {void}
     */
    replayOperations(operations, { reverse = false, ensureNewMutations = false } = {}) {
        for (const { id, data, reversed } of reverse ? operations.toReversed() : operations) {
            const isReversed = reverse ? !reversed : reversed;
            if (ensureNewMutations) {
                // Redo reverts the undo commit. Record what we replay,
                // including its direction, so that commit can be reversed.
                this.stageOperation({ id, data, reversed: isReversed });
            }
            const operation = this.getOperation(id);
            (isReversed ? operation.revert : operation.apply)(data);
        }
    }

    /**
     * Return a copy of the list of commits recorded in history.
     *
     * @returns { HistoryCommit[] }
     */
    getCommits() {
        return [...this.commits];
    }

    // ====================
    // Commit data handling
    // ====================

    /**
     * Return a complete `HistoryCommitData` object made of the collected
     * fields, any pending data in plugins that subscribe to
     * `pending_history_commit_data_processors`, as well as metadata provided by
     * this plugin.
     *
     * @template { WritableHistoryCommitType } [T="standard"]
     * @param { HistoryCommitData<T> } [data = {}]
     * @returns { HistoryCommitData<T> }
     */
    processCommitData(data = {}) {
        // Set the timestamp of the commit or keep the timestamp of the commit
        // it reverts:
        data.commitTimestamp ??= Date.now();
        data.authorTimestamp ??= this.authorTimestamp;
        data.previousCommitId = this.commits?.at(-1)?.id;
        for (const { id, collect } of this.fields.values()) {
            const stagedValue = this.stagedData[id];
            const value = collect
                ? collect(stagedValue, { relatedCommit: data.relatedCommit })
                : stagedValue;
            if (value !== undefined) {
                data[id] = value;
            }
        }
        return this.processThrough("pending_history_commit_data_processors", data);
    }

    /**
     * Reset the staged timestamp.
     */
    resetAuthorTimestamp() {
        this.authorTimestamp = Date.now();
    }

    // =======================
    // Commit creation/writing
    // =======================

    /**
     * Record the given commit in the history, if it contains any changes.
     * Otherwise, return `false`.
     *
     * @template { WritableHistoryCommitType } T
     * @param { HistoryCommit<T> } commit
     * @returns { HistoryCommit<T> | false }
     */
    appendCommit(commit) {
        // @todo @phoenix should we allow to pause the making of a commit?
        // if (!this.commitsActive) {
        //     return;
        // }
        // @todo @phoenix link zws plugin
        // this._resetLinkZws();
        // @todo @phoenix sanitize plugin
        // this.sanitize();
        if (this.checkPredicates("has_history_commit_changes_predicates", commit) ?? false) {
            this.commits.push(commit);
            // @todo @phoenix add this in the linkzws plugin.
            // this._setLinkZws();
            // Notify of changes.
            this.trigger("on_committed_to_history_handlers", commit);
            this.config.onChange?.({ isPreviewing: this.isPreviewing });
            return commit;
        } else {
            return false;
        }
    }

    /**
     * Create and return a "snapshot" commit.
     *
     * @returns { HistoryCommit<"standard"> }
     */
    createSnapshotCommit() {
        /** @type { HistoryCommitData<"standard"> } */
        const data = this.processThrough("snapshot_history_commit_data_processors", {
            authorTimestamp: this.authorTimestamp,
        });
        return new HistoryCommit({ id: this.commits?.at(-1)?.id, data });
    }

    // ===========================
    // Commit application/reversal
    // ===========================

    /**
     * Apply the fields of the given commit, then delegate the application of
     * its other changes to the plugins that subscribe to
     * `on_apply_history_commit_handlers`.
     *
     * @param { HistoryCommit } commit
     * @param { Object } [params = {}]
     * @param { boolean } [params.ensureNewMutations = false]
     * @param { boolean } [params.restoreSelection = false]
     */
    applyCommit(commit, { ensureNewMutations = false, restoreSelection = false } = {}) {
        for (const { id, apply } of this.fields.values()) {
            if (apply && id in commit.data) {
                apply(commit.data[id], { ensureNewMutations });
            }
        }
        this.trigger("on_apply_history_commit_handlers", commit, {
            ensureNewMutations,
            restoreSelection,
        });
    }

    /**
     * Revert the fields of the given commit, then delegate the reversal of its
     * other changes to the plugins that subscribe to
     * `on_revert_history_commit_handlers`.
     *
     * @param { HistoryCommit } commit
     * @param { Object } [params = {}]
     * @param { boolean } [params.ensureNewMutations = false]
     * @param { boolean } [params.restoreFocus = true]
     */
    revertCommit(commit, { ensureNewMutations = false, restoreFocus = true } = {}) {
        for (const { id, revert } of this.fields.values()) {
            if (revert && id in commit.data) {
                revert(commit.data[id], { ensureNewMutations });
            }
        }
        this.trigger("on_revert_history_commit_handlers", commit, {
            ensureNewMutations,
            restoreFocus,
        });
    }

    // ============================
    // Reversal (undo/redo) helpers
    // ============================

    /**
     * Undo or redo the last batch of commits that can be undone or redone.
     *
     * @template { Extract<HistoryCommitType, "undo" | "redo"> } T
     * @param {T} type
     */
    reverse(type) {
        this.discardStagedChanges();
        const commitsToReverse = this.getNextCommitsToReverse(type);
        if (!commitsToReverse.length) {
            return;
        }
        /** @type { type extends "undo" ? HistoryCommit<"standard" | "redo"> : HistoryCommit<"undo"> } */
        let reversedCommit;
        for (reversedCommit of commitsToReverse) {
            this.revertCommit(reversedCommit, { ensureNewMutations: true });
            this.revertedCommits.add(reversedCommit.id);
            /** @type { HistoryCommitData<T> } */
            const commitData = this.processCommitData({
                batchable: reversedCommit.data.batchable,
                commitTimestamp: reversedCommit.data.commitTimestamp,
                relatedCommit: reversedCommit,
            });
            this.appendCommit(
                new HistoryCommit({
                    type,
                    data: commitData,
                })
            );
        }
        this.trigger(
            type === HISTORY_COMMIT_TYPES.UNDO
                ? "on_history_commit_undone_handlers"
                : "on_history_commit_redone_handlers",
            reversedCommit
        );
    }

    /**
     * Return the index in the history of the next commit to undo or redo, or -1
     * if none could be found.
     *
     * @param {Extract<HistoryCommitType, "undo" | "redo">} type
     * @param { number } [fromIndex = this.commits.length] commit index from which to search
     * @returns { number }
     */
    getNextCommitToReverseIndex(type, fromIndex = this.commits.length) {
        // Do not undo/redo the initial commit.
        for (let index = fromIndex - 1; index > 0; index--) {
            const commit = this.commits[index];
            if (this.isCommitReversible(commit) && !this.discardedCommits.has(commit.id)) {
                if (
                    type === HISTORY_COMMIT_TYPES.REDO &&
                    commit.type === HISTORY_COMMIT_TYPES.STANDARD
                ) {
                    return -1;
                } else if (
                    !this.revertedCommits.has(commit.id) &&
                    // Go back to first commit that can be undone.
                    ((type === HISTORY_COMMIT_TYPES.UNDO &&
                        [HISTORY_COMMIT_TYPES.STANDARD, HISTORY_COMMIT_TYPES.REDO].includes(
                            commit.type
                        )) ||
                        // Look for an "undo" commit that has not yet been redone.
                        (type === HISTORY_COMMIT_TYPES.REDO &&
                            commit.type === HISTORY_COMMIT_TYPES.UNDO))
                ) {
                    return index;
                }
            }
        }
        // There are no commits left to be undone/redone, return an index that
        // does not point to any commit
        return -1;
    }

    /**
     * Return the commits to be reverted/redone by a single undo or redo.
     *
     * @template { Extract<HistoryCommitType, "undo" | "redo"> } T
     * @param { T } type
     * @returns { (T extends "undo" ? HistoryCommit<"standard" | "redo"> : HistoryCommit<"undo">)[] }
     */
    getNextCommitsToReverse(type) {
        let referenceCommitIndex = this.getNextCommitToReverseIndex(type);
        // Do not undo/redo the initial commit.
        if (referenceCommitIndex <= 0) {
            return [];
        }
        let nextCommitIndex = this.getNextCommitToReverseIndex(type, referenceCommitIndex);
        const result = [this.commits[referenceCommitIndex]];
        while (
            nextCommitIndex >= 0 &&
            this.canCommitsBeBatched(referenceCommitIndex, nextCommitIndex)
        ) {
            result.push(this.commits[nextCommitIndex]);
            referenceCommitIndex = nextCommitIndex;
            nextCommitIndex = this.getNextCommitToReverseIndex(type, nextCommitIndex);
        }
        return result;
    }

    /**
     * Return true if there is at least one commit in history that can be
     * undone, false otherwise.
     *
     * @returns { boolean }
     */
    canUndo() {
        return this.getNextCommitToReverseIndex(HISTORY_COMMIT_TYPES.UNDO) > 0;
    }

    /**
     * Return true if there is at least one commit in history that can be
     * redone, false otherwise.
     *
     * @returns { boolean }
     */
    canRedo() {
        return this.getNextCommitToReverseIndex(HISTORY_COMMIT_TYPES.REDO) > 0;
    }

    /**
     * Return true if commits can be batched in a single revision (undo/redo),
     * false otherwise.
     * Currrently: commits with a single mutation on the same text node.
     *
     * @param { number } index1
     * @param { number } index2
     * @returns { boolean }
     */
    canCommitsBeBatched(index1, index2) {
        const commit1 = this.commits[index1];
        const commit2 = this.commits[index2];
        if (!commit1.data.batchable || !commit2.data.batchable) {
            return false;
        }
        // Keep only if close enough in time.
        if (
            Math.abs(commit1.data.commitTimestamp - commit2.data.commitTimestamp) >
            COMMIT_DEBOUNCE_DELAY
        ) {
            return false;
        }
        return true;
    }

    // ===========================
    // Collaboration compatibility
    // ===========================

    /**
     * Insert a commit at the given index in the history.
     *
     * @param { HistoryCommit } newCommit
     * @param { number } index
     */
    insertRemoteCommit(newCommit, index) {
        this.trigger("on_will_rebase_history_handlers");
        // The last commit is an uncommited draft, revert it first.
        this.stash();
        const commitsAfterNewCommit = this.commits.slice(index);
        for (const commitToRevert of commitsAfterNewCommit.slice().reverse()) {
            this.revertCommit(commitToRevert);
        }
        this.applyCommit(newCommit);
        this.trigger("on_remote_history_commit_applied_handlers", newCommit);
        this.commits.splice(index, 0, newCommit);
        for (const commitToApply of commitsAfterNewCommit) {
            this.applyCommit(commitToApply);
        }
        // Reapply the uncommitted draft, since this is not an operation that
        // should cancel it.
        this.unstash();
        this.trigger("on_history_rebased_handlers");
    }

    /**
     * Give a chance to other plugins to prevent the reversal of the given
     * commit. Return true if it's reversible, false otherwise.
     *
     * @param { HistoryCommit } commit
     * @returns { boolean }
     */
    isCommitReversible(commit) {
        return this.checkPredicates("is_history_commit_reversible_predicates", commit) ?? true;
    }

    // =======
    // Preview
    // =======

    /**
     * Returns a function that can be later called to revert history to the
     * current state.
     *
     * @returns { Function }
     */
    makeSavePoint() {
        const savePoint = new HistoryCommit({
            type: HISTORY_COMMIT_TYPES.SAVEPOINT,
            data: this.processThrough("save_point_history_commit_data_processors", {
                relatedCommit: this.commits.at(-1),
                hasBeenRestored: false,
            }),
        });
        // Processors can stage pending changes: copy the draft after them.
        savePoint.data.stagedData = { ...this.stagedData };
        return () => {
            if (savePoint.data.hasBeenRestored) {
                return;
            }
            this.discardStagedChanges();
            /** @type { HistoryCommit } */
            const relatedCommit = savePoint.data.relatedCommit;
            const isLastCommit = relatedCommit === this.commits.at(-1);
            const index = this.commits.findLastIndex((commit) => commit?.id === relatedCommit.id);
            const commitsToRestore = this.commits.slice(index === -1 ? 1 : index + 1).reverse();
            /** @type { HistoryCommit[] } */
            const irreversibleCommits = [];
            for (const commitToRestore of commitsToRestore) {
                const isReversible = this.isCommitReversible(commitToRestore);
                // Savepoint restoration is used for previews, so keep focus on the
                // external UI (for example the color picker) while reverting the
                // underlying history commit.
                this.revertCommit(commitToRestore, {
                    ensureNewMutations: true,
                    restoreFocus: false,
                });
                this.trigger("on_history_commit_restored_handlers");
                if (isReversible) {
                    this.discardedCommits.add(commitToRestore.id);
                    savePoint.data.lastRevertedChanges = commitToRestore.data;
                } else {
                    irreversibleCommits.unshift(commitToRestore);
                }
            }
            // Re-apply every non reversible commit (typically collaborators commits).
            for (const irreversibleCommit of irreversibleCommits) {
                this.applyCommit(irreversibleCommit, {
                    ensureNewMutations: true,
                    restoreSelection: true,
                });
                this.trigger("on_irreversible_history_commit_applied_handlers");
            }
            if (!isLastCommit) {
                // Register resulting mutations as a new "restore" commit
                // (prevent undo).
                /** @type { HistoryCommit<"restore"> } */
                const restoreCommit = new HistoryCommit({
                    type: HISTORY_COMMIT_TYPES.RESTORE,
                    data: this.processCommitData({ relatedCommit }),
                });
                this.appendCommit(restoreCommit);
            }
            this.restoreStagedData(savePoint.data.stagedData);
            savePoint.data.hasBeenRestored = true;
            this.trigger("on_savepoint_restored_handlers", savePoint);
        };
    }

    /**
     * Return a object containing functions meant to preview, apply, and revert
     * an operation.
     *
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
                this.trigger("on_will_preview_handlers");
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
     * Return a object containing functions meant to preview, apply, and revert
     * an asynchronous operation.
     *
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
                    this.trigger("on_will_preview_handlers");
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

    /**
     * Return true if a preview is in progress, false otherwise.
     *
     * @returns { boolean }
     */
    getIsPreviewing() {
        return !!this.isPreviewing;
    }

    // =============
    // DOM Listeners
    // =============

    /**
     * @param { InputEvent } ev
     */
    onDocumentBeforeInput(ev) {
        if (this.editable.contains(ev.target)) {
            return;
        }
        if (["historyUndo", "historyRedo"].includes(ev.inputType)) {
            this._onKeyupResetContenteditableNodes.push(
                ...this.editable.querySelectorAll("[contenteditable=true]")
            );
            if (this.editable.getAttribute("contenteditable") === "true") {
                this._onKeyupResetContenteditableNodes.push(this.editable);
            }

            for (const node of this._onKeyupResetContenteditableNodes) {
                node.setAttribute("contenteditable", false);
            }
        }
    }

    /**
     * @param { InputEvent } ev
     */
    onDocumentInput(ev) {
        if (
            ["historyUndo", "historyRedo"].includes(ev.inputType) &&
            this._onKeyupResetContenteditableNodes.length
        ) {
            for (const node of this._onKeyupResetContenteditableNodes) {
                node.setAttribute("contenteditable", true);
            }
            this._onKeyupResetContenteditableNodes = [];
        }
    }
}

/**
 * @typedef { string } HistoryCommitId
 * @typedef { typeof HISTORY_COMMIT_TYPES[keyof typeof HISTORY_COMMIT_TYPES] } HistoryCommitType
 * @typedef { Exclude<HistoryCommitType, "savePoint" | "stash"> } WritableHistoryCommitType
 */
/**
 * @template { HistoryCommitType } [T=WritableHistoryCommitType]
 * @typedef { Record<string, any> & {
 *   authorTimestamp?: number,
 *   commitTimestamp?: number,
 *   previousCommitId?: HistoryCommitId,
 * } & (
 *   T extends "savePoint" | "restore" | "stash"
 *     ? {}
 *     : { batchable: boolean }
 * ) & (
 *   T extends "standard" | "stash"
 *     ? {}
 *     : {
 *         relatedCommit: HistoryCommit<(
 *           T extends "undo"
 *             ? "standard" | "redo"
 *             : ( T extends "redo" ? "undo" : WritableHistoryCommitType )
 *         )>
 *       }
 * ) & (
 *   T extends "savePoint"
 *     ? {
 *         hasBeenRestored: boolean,
 *         lastRevertedChanges?: HistoryCommitData<WritableHistoryCommitType>,
 *         stagedData: Record<string, any>,
 *       }
 *     : {}
 * ) } HistoryCommitData<T>
 */

/**
 * @template { HistoryCommitType } [T=WritableHistoryCommitType]
 */
export class HistoryCommit {
    /**
     * @param { Object } [params = {}]
     * @param { HistoryCommitId } [params.id = this.generateId()]
     * @param { T } [params.type = HISTORY_COMMIT_TYPES.STANDARD]
     * @param { HistoryCommitData<T> } [params.data = {}]
     */
    constructor({ id = this.generateId(), type = HISTORY_COMMIT_TYPES.STANDARD, data = {} } = {}) {
        /** @type { HistoryCommitId } */
        this.id = id;
        /** @type { T } */
        this.type = type;
        /** @type { HistoryCommitData<T> } */
        this.data = data;
    }

    /**
     * @returns { HistoryCommitId }
     */
    generateId() {
        // No need for secure random number.
        return Math.floor(Math.random() * Math.pow(2, 52)).toString();
    }
}
