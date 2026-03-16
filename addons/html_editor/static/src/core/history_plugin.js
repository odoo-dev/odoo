import { Plugin } from "../plugin";
import { hasTouch } from "@web/core/browser/feature_detection";
import { withSequence } from "@html_editor/utils/resource";
import { _t } from "@web/core/l10n/translation";

/**
 * @typedef { import("./selection_plugin").EditorSelection } EditorSelection
 * @typedef { import("../utils/dom_map").SerializedNode } SerializedNode
 * @typedef { import("../utils/dom_map").SerializedSelection } SerializedSelection
 * @typedef { import("../utils/dom_map").NodeId } NodeId
 *
 * @typedef { import("./dom_mutation_plugin").EditorMutation } EditorMutation
 * @typedef { import("./dom_mutation_plugin").EditorMutationRecord } EditorMutationRecord
 *
 * @typedef { import("../utils/commit").EditorCommit } EditorCommit
 * @typedef { import("../utils/commit").EditorCommitId } EditorCommitId
 * @typedef { import("../utils/commit").EditorCommitType } EditorCommitType
 * @typedef { import("../utils/commit").EditorCommitData } EditorCommitData
 */
/**
 * @typedef { Object } HistoryShared
 * @property { HistoryPlugin['write'] } write
 * @property { HistoryPlugin['undo'] } undo
 * @property { HistoryPlugin['redo'] } redo
 * @property { HistoryPlugin['addExternalCommit'] } addExternalCommit
 * @property { HistoryPlugin['canRedo'] } canRedo
 * @property { HistoryPlugin['canUndo'] } canUndo
 * @property { HistoryPlugin['getHistoryCommits'] } getHistoryCommits
 * @property { HistoryPlugin['reset'] } reset
 * @property { HistoryPlugin['resetFromCommits'] } resetFromCommits
 * @property { HistoryPlugin['getCommitsUntil'] } getCommitsUntil
 */
/**
 * @typedef {((record: EditorMutationRecord) => void)[]} on_attribute_changed_handlers
 * @typedef {((records: EditorMutationRecord[]) => void)[]} on_will_filter_mutation_record_handlers
 * @typedef {(() => void)[]} on_external_commit_added_handlers
 * @typedef {(() => void)[]} on_history_cleaned_handlers
 * @typedef {(() => void)[]} on_history_reset_handlers
 * @typedef {(() => void)[]} on_history_reset_from_commits_handlers
 * @typedef {((revertedCommit: EditorCommit) => void)[]} on_redone_handlers
 * @typedef {((revertedCommit: EditorCommit) => void)[]} on_undone_handlers
 * @typedef {((commit: EditorCommit) => void)[]} on_committed_handlers
 *
 * @typedef {((record: EditorMutationRecord) => boolean | undefined)[]} is_mutation_record_savable_predicates
 * @typedef {((commit: EditorCommit) => boolean | undefined)[]} is_commit_reversible_predicates
 *
 * @typedef {((
 *    arg: {
 *      target: Node,
 *      attributeName: string,
 *      oldValue: string,
 *      value: string,
 *      reverse: boolean,
 *    },
 *    options: { ensureNewMutations: boolean }
 *  ) => arg)[]} attribute_change_processors
 * @typedef {((node: Node, attributeName: string, attributeValue: string) => boolean)[]} set_attribute_overrides
 */

export const COMMIT_DEBOUNCE_DELAY = 250;

export class HistoryPlugin extends Plugin {
    static id = "history";
    static dependencies = ["selection"];
    static shared = [
        // Main
        "write",
        "undo",
        "redo",
        // From original
        "addExternalCommit",
        "canRedo",
        "canUndo",
        "getHistoryCommits",
        "reset",
        "resetFromCommits",
        // Had to add
        "getCommitsUntil",
    ];
    /** @type {import("plugins").EditorResources} */
    resources = {
        user_commands: [
            {
                id: "historyUndo",
                description: _t("Undo"),
                icon: "fa-undo",
                run: this.undo.bind(this),
            },
            {
                id: "historyRedo",
                description: _t("Redo"),
                icon: "fa-repeat",
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
            this.reset(this.config.content);
        },
        editor_commit_processors: (commit) => {
            commit.updateData("previousCommitId", this.commits.at(-1)?.id);
            return commit;
        },
    };

    setup() {
        this._onKeyupResetContenteditableNodes = [];
        this.addDomListener(this.document, "beforeinput", this._onDocumentBeforeInput.bind(this));
        this.addDomListener(this.document, "input", this._onDocumentInput.bind(this));
        this.clean();
    }

    /**
     * @param { EditorCommit } commit
     * @returns { EditorCommit }
     */
    write(commit) {
        // Set the timestamp of the commit or keep the timestamp of the commit
        // it reverts (see `DomMutation`: `on_single_commit_(un|re)done_handlers`).
        commit.stamp();
        // @todo @phoenix should we allow to pause the making of a commit?
        // if (!this.commitsActive) {
        //     return;
        // }
        // @todo @phoenix link zws plugin
        // this._resetLinkZws();
        // @todo @phoenix sanitize plugin
        // this.sanitize();
        this.commits.push(commit);
        // @todo @phoenix add this in the linkzws plugin.
        // this._setLinkZws();
        return commit;
    }

    undo() {
        if (this.commits.length === 1) {
            return;
        }
        this.trigger("on_will_undo_handlers");
        let revertedCommit;
        for (revertedCommit of this.getNextUndoCommits()) {
            this.revertCommit(revertedCommit, { ensureNewMutations: true });
            this.revertedCommits.add(revertedCommit.id);
            this.trigger("on_single_commit_undone_handlers", revertedCommit);
        }
        this.trigger("on_undone_handlers", revertedCommit);
    }

    redo() {
        this.trigger("on_will_redo_handlers");
        let revertedCommit;
        for (revertedCommit of this.getNextRedoCommits()) {
            this.revertCommit(revertedCommit, { ensureNewMutations: true });
            this.revertedCommits.add(revertedCommit.id);
            this.trigger("on_single_commit_redone_handlers", revertedCommit);
        }
        this.trigger("on_redone_handlers", revertedCommit);
    }

    // Private

    applyCommit(commit) {
        this.delegateTo("apply_commit_overrides", commit);
    }

    revertCommit(commit, { ensureNewMutations = false } = {}) {
        this.delegateTo("revert_commit_overrides", commit, { ensureNewMutations });
    }

    clean() {
        /** @type { EditorCommit[] } */
        this.commits = [];
        /** @type {Set<EditorCommitId>} Commits reverted by undo/redo operations */
        this.revertedCommits = new Set();
        /** @type {Set<EditorCommitId>} Commits reverted by restoring to a save point */
        this.discardedCommits = new Set();
        this.trigger("on_history_cleaned_handlers");
    }

    /**
     * Reset the history.
     *
     * @param { string } content
     */
    reset(content) {
        this.clean();
        this.trigger("on_history_reset_handlers", content);
    }

    // NEW: process commit

    /**
     * Insert a commit in the history.
     *
     * @param { EditorCommit } newCommit
     * @param { number } index
     */
    addExternalCommit(newCommit, index) {
        this.trigger("on_will_add_external_commit_handlers");
        const commitsAfterNewCommit = this.commits.slice(index);
        for (const commitToRevert of commitsAfterNewCommit.slice().reverse()) {
            this.revertCommit(commitToRevert);
        }
        this.applyCommit(newCommit);
        let root;
        this.getResource("commit_root_providers").find((p) => {
            root = p(newCommit);
            return root;
        });
        this.processThrough("normalize_processors", root);
        this.commits.splice(index, 0, newCommit);
        for (const commitToApply of commitsAfterNewCommit) {
            this.applyCommit(commitToApply);
        }
        this.trigger("on_external_commit_added_handlers");
    }

    getHistoryCommits() {
        return this.commits;
    }

    // Before applying a commit

    canUndo() {
        return this.getNextUndoIndex() > 0;
    }

    canRedo() {
        return this.getNextRedoIndex() > 0;
    }

    /**
     * Get the commit index in the history to undo.
     * Return -1 if no undo index can be found.
     *
     * @param { number } fromIndex commit index from which to search
     */
    getNextUndoIndex(fromIndex = this.commits.length) {
        // Go back to first commit that can be undone ("original", "reset" or "redo").
        // Do not undo the initial commit.
        for (let index = fromIndex - 1; index > 0; index--) {
            const commit = this.commits[index];
            if (!this.isReversibleCommit(commit) || this.discardedCommits.has(commit.id)) {
                continue;
            }
            if (
                ["original", "reset", "redo"].includes(commit.type) &&
                !this.revertedCommits.has(commit.id)
            ) {
                return index;
            }
        }
        // There is no commits left to be undone, return an index that does not
        // point to any commit
        return -1;
    }
    /**
     * Returns the commits to be reverted by a single undo.
     */
    getNextUndoCommits() {
        let referenceCommitIndex = this.getNextUndoIndex();
        // Do not undo the initial commit.
        if (referenceCommitIndex <= 0) {
            return [];
        }
        let nextCommitIndex = this.getNextUndoIndex(referenceCommitIndex);
        const result = [this.commits[referenceCommitIndex]];
        while (
            nextCommitIndex >= 0 &&
            this.canCommitsBeBatched(referenceCommitIndex, nextCommitIndex)
        ) {
            result.push(this.commits[nextCommitIndex]);
            referenceCommitIndex = nextCommitIndex;
            nextCommitIndex = this.getNextUndoIndex(nextCommitIndex);
        }
        return result;
    }
    /**
     * Returns true if commits can be batched in a single undo/redo.
     * Currrently: commits with a single mutation on the same text node.
     * @param { number } index1
     * @param { number } index2
     */
    canCommitsBeBatched(index1, index2) {
        const commit1 = this.commits[index1];
        const commit2 = this.commits[index2];
        if (!commit1.metadata.batchable || !commit2.metadata.batchable) {
            return false;
        }
        // Keep only if close enough in time.
        if (
            Math.abs(commit1.metadata.commitTimestamp - commit2.metadata.commitTimestamp) >
            COMMIT_DEBOUNCE_DELAY
        ) {
            return false;
        }
        return true;
    }
    /**
     * Get the commit index in the history to redo.
     * Return -1 if no redo index can be found.
     *
     * @param { number } fromIndex commit index from which to search
     */
    getNextRedoIndex(fromIndex = this.commits.length) {
        // Look for an "undo" commit that has not yet been redone. Stop search if
        // a "original" commit is found.
        // Do not undo the initial commit.
        for (let index = fromIndex - 1; index > 0; index--) {
            const commit = this.commits[index];
            if (!this.isReversibleCommit(commit) || this.discardedCommits.has(commit.id)) {
                continue;
            }
            if (["original", "reset"].includes(commit.type)) {
                return -1;
            }
            if (commit.type === "undo" && !this.revertedCommits.has(commit.id)) {
                return index;
            }
        }
        return -1;
    }
    /**
     * Returns the commits to be redone by a single redo.
     */
    getNextRedoCommits() {
        let referenceCommitIndex = this.getNextRedoIndex();
        // Do not revert the initial commit.
        if (referenceCommitIndex <= 0) {
            return [];
        }
        let nextCommitIndex = this.getNextRedoIndex(referenceCommitIndex);
        const result = [this.commits[referenceCommitIndex]];
        while (
            nextCommitIndex >= 0 &&
            this.canCommitsBeBatched(referenceCommitIndex, nextCommitIndex)
        ) {
            result.push(this.commits[nextCommitIndex]);
            referenceCommitIndex = nextCommitIndex;
            nextCommitIndex = this.getNextRedoIndex(nextCommitIndex);
        }
        return result;
    }

    // Applying a commit

    /**
     * Get the commits saved in commits between the commit of given id (not
     * included) and the most recent one. If no commit id is given, return all
     * commits but the first.
     *
     * @param {EditorCommitId} [commitId]
     * @returns { { ...EditorCommit, discard: false | () => void }[] }
     */
    getCommitsUntil(commitId) {
        const commitIndex = this.commits.findLastIndex((commit) => commit?.id === commitId);
        return this.commits
            .slice(commitIndex === -1 ? 1 : commitIndex + 1)
            .map((commit) => {
                if (commit && this.isReversibleCommit(commit)) {
                    commit.discard = () => {
                        this.discardedCommits.add(commit.id);
                    };
                }
                return commit;
            })
            .filter(Boolean)
            .reverse();
    }

    /**
     * Meant to be overriden.
     *
     * @param { EditorCommit } commit
     */
    isReversibleCommit(commit) {
        return this.checkPredicates("is_commit_reversible_predicates", commit) ?? true;
    }

    /**
     * @param { EditorCommit[] } commits
     */
    resetFromCommits(commits) {
        this.trigger("on_will_reset_history_from_commits_handlers");
        this.editable.replaceChildren();
        this.clean();
        commits.forEach(this.applyCommit.bind(this));
        this.commits = commits;
        // todo: to test
        this.trigger("on_history_reset_from_commits_handlers");
        // TODO AGE: all this was wrapped in a `domMutations.withObserverOff`,
        // and there was a dispatch to on_history_reset_from_commits_handlers at the
        // end of the callback _and_ after the call to `withObserverOff`. I
        // replaced the `withObserverOff` with disabling/enabling the observer
        // in the resources dispatched here. So I wasn't able to put this second
        // dispatch again. Why was it needed?
    }

    // Listeners to handle contenteditable stuff

    _onDocumentBeforeInput(ev) {
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

    _onDocumentInput(ev) {
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
