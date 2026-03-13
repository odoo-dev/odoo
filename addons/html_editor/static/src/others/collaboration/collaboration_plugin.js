import { Plugin } from "@html_editor/plugin";

// 60 seconds
export const HISTORY_SNAPSHOT_INTERVAL = 1000 * 60;
// 10 seconds
const HISTORY_SNAPSHOT_BUFFER_TIME = 1000 * 10;

/**
 * @typedef { Object } CollaborationPluginConfig
 * @property { string } peerId
 *
 * @typedef { import("../../utils/commit").EditorCommit } EditorCommit
 */

/**
 * @typedef { Object } CollaborationShared
 * @property { CollaborationPlugin['getBranchIds'] } getBranchIds
 * @property { CollaborationPlugin['getSnapshotCommits'] } getSnapshotCommits
 * @property { CollaborationPlugin['historyGetMissingCommits'] } historyGetMissingCommits
 * @property { CollaborationPlugin['onExternalHistoryCommits'] } onExternalHistoryCommits
 * @property { CollaborationPlugin['resetFromCommits'] } resetFromCommits
 * @property { CollaborationPlugin['setInitialBranchCommitId'] } setInitialBranchCommitId
 */

/**
 * @typedef {(() => void)[]} on_external_history_commit_added_handlers
 */

export class CollaborationPlugin extends Plugin {
    static id = "collaboration";
    static dependencies = ["history", "domMutation", "selection", "sanitize"];
    /** @type {import("plugins").EditorResources} */
    resources = {
        /** Handlers */
        on_history_cleaned_handlers: this.onHistoryClean.bind(this),
        on_history_reset_handlers: this.onHistoryReset.bind(this),
        on_committed_handlers: (commit) => this.onMutationsCommitted(commit),

        /** Overrides */
        set_attribute_overrides: this.setAttribute.bind(this),

        editor_commit_processors: this.processEditorCommit.bind(this),
        is_commit_reversible_predicates: (commit) => {
            if (commit.data.peerId !== this.peerId) {
                return false;
            }
        },
    };
    static shared = [
        "getBranchIds",
        "getSnapshotCommits",
        "historyGetMissingCommits",
        "onExternalHistoryCommits",
        "resetFromCommits",
        "setInitialBranchCommitId",
    ];

    /** @type { CollaborationPluginConfig['peerId'] } */
    peerId = null;

    setup() {
        this.peerId = this.config.collaboration.peerId;
        if (!this.peerId) {
            throw new Error("The collaboration plugin requires a peerId");
        }
        this._snapshotInterval = setInterval(() => {
            this.makeSnapshot();
        }, HISTORY_SNAPSHOT_INTERVAL);
    }

    destroy() {
        super.destroy();
        clearInterval(this._snapshotInterval);
        this._snapshotInterval = false;
    }

    onHistoryClean() {
        this.branchCommitIds = [];
    }
    onHistoryReset() {
        const firstCommit = this.dependencies.history.getHistoryCommits()[0];
        this.snapshots = [{ commit: firstCommit }];
    }
    /**
     * @param {Node} node
     * @param {string} attributeName
     * @param {string} attributeValue
     */
    setAttribute(node, attributeName, attributeValue) {
        if (attributeValue) {
            this.safeSetAttribute(node, attributeName, attributeValue);
            return true;
        }
    }

    /**
     * Get all the history ids for the current history branch.
     */
    getBranchIds() {
        const commits = this.dependencies.history.getHistoryCommits();
        return (this.initialBranchCommitId || "")
            .split(",")
            .concat(this.branchCommitIds)
            .concat(commits.map((s) => s.id));
    }
    /**
     * Safely set an attribute on a node.
     * @param {HTMLElement} node
     * @param {string} attributeName
     * @param {string} attributeValue
     */
    safeSetAttribute(node, attributeName, attributeValue) {
        const clone = this.document.createElement(node.tagName);
        clone.setAttribute(attributeName, attributeValue);
        this.dependencies.sanitize.sanitize(clone);
        if (clone.hasAttribute(attributeName)) {
            node.setAttribute(attributeName, clone.getAttribute(attributeName));
        } else {
            node.removeAttribute(attributeName);
        }
    }

    /**
     * Apply external commits coming from the collaboration.
     *
     * @param {Object} newCommits External commits to be applied
     */
    onExternalHistoryCommits(newCommits) {
        let commitIndex = 0;
        const selectionData = this.dependencies.selection.getSelectionData();

        const commits = this.dependencies.history.getHistoryCommits();
        for (const newCommit of newCommits) {
            // todo: add a test that no 2 on_history_missing_parent_commit_handlers
            // are called in same stack.
            const insertIndex = this.getInsertCommitIndex(commits, newCommit);
            if (typeof insertIndex === "undefined") {
                continue;
            }
            // TODO AGE: should `ignoreDomMutations` be done manually in
            // `on_will_add_external_commit_handlers` and `on_external_commit_added_handlers`?
            this.dependencies.domMutation.ignoreDOMMutations(() => {
                this.dependencies.history.addExternalCommit(newCommit, insertIndex);
            });
            commitIndex++;
        }
        if (selectionData.documentSelectionIsInEditable) {
            this.dependencies.selection.rectifySelection(selectionData.editableSelection);
        }

        this.trigger("on_external_history_commit_added_handlers");

        // todo: ensure that if the selection was not in the editable before the
        // reset, it remains where it was after applying the snapshot.

        if (commitIndex) {
            this.config.onChange?.();
        }
    }

    /**
     * @param {EditorCommit[]} commits
     * @param {EditorCommit} newCommit
     */
    getInsertCommitIndex(commits, newCommit) {
        let index = commits.length - 1;
        while (index >= 0 && commits[index].id !== newCommit.data.previousCommitId) {
            // Skip commits that are already in the list.
            if (commits[index].id === newCommit.id) {
                return;
            }
            index--;
        }

        // When the previousCommitId is not present in the commits it
        // could be either:
        // - the previousCommitId is before a snapshot of the same history
        // - the previousCommitId has not been received because peers were
        //   disconnected at that time
        // - the previousCommitId is in another history (in case two totally
        //   differents `commits` (but it should not arise)).
        if (index < 0) {
            const historyCommits = commits;
            let index = historyCommits.length - 1;
            // Get the last known commit that we are sure the missing commit
            // peer has. It could either be a commit that has the same
            // peerId or the first commit.
            while (index !== 0) {
                if (historyCommits[index].data.peerId === newCommit.data.peerId) {
                    break;
                }
                index--;
            }
            const fromCommitId = historyCommits[index].id;
            this.trigger("on_history_missing_parent_commit_handlers", {
                commit: newCommit,
                fromCommitId,
            });
            return;
        }

        let concurentCommits = [];
        index++;
        while (index < commits.length) {
            if (commits[index].data.previousCommitId === newCommit.data.previousCommitId) {
                if (commits[index].data.authorTimestamp > newCommit.data.authorTimestamp) {
                    break;
                } else {
                    concurentCommits = [commits[index].id];
                }
            } else {
                if (concurentCommits.includes(commits[index].data.previousCommitId)) {
                    concurentCommits.push(commits[index].id);
                } else {
                    break;
                }
            }
            index++;
        }

        return index;
    }

    /**
     * @param {Object} params
     * @param {string} params.fromCommitId
     * @param {string} [params.toCommitId]
     */
    historyGetMissingCommits({ fromCommitId, toCommitId }) {
        const commits = this.dependencies.history.getHistoryCommits();
        const fromIndex = commits.findIndex((x) => x.id === fromCommitId);
        const toIndex = toCommitId ? commits.findIndex((x) => x.id === toCommitId) : commits.length;
        if (fromIndex === -1 || toIndex === -1) {
            return -1;
        }
        return commits.slice(fromIndex + 1, toIndex);
    }

    getSnapshotCommits() {
        const historyCommits = this.dependencies.history.getHistoryCommits();
        // If the current snapshot has no time, it means that there is the no
        // other snapshot that have been made (either it is the one created upon
        // initialization or reseted by history's resetFromCommits).
        if (!this.snapshots[0].time) {
            return { commits: historyCommits, historyIds: this.getBranchIds() };
        }
        const snapshotCommits = [];
        let snapshot;
        if (this.snapshots[0].time + HISTORY_SNAPSHOT_BUFFER_TIME < Date.now()) {
            snapshot = this.snapshots[0];
        } else {
            // this.snapshots[1] has being created at least 1 minute ago
            // (HISTORY_SNAPSHOT_INTERVAL) or it is the first commit.
            snapshot = this.snapshots[1];
        }
        let index = historyCommits.length - 1;
        while (historyCommits[index].id !== snapshot.commit.id) {
            snapshotCommits.push(historyCommits[index]);
            index--;
        }
        snapshotCommits.push(snapshot.commit);
        snapshotCommits.reverse();

        return { commits: snapshotCommits, historyIds: this.getBranchIds() };
    }
    setInitialBranchCommitId(commitId) {
        this.initialBranchCommitId = commitId;
    }
    resetFromCommits(commits, branchCommitIds) {
        this.dependencies.selection.resetSelection();
        this.dependencies.history.resetFromCommits(commits);
        this.snapshots = [{ commit: commits[0] }];
        this.branchCommitIds = branchCommitIds;

        // @todo @phoenix: test that the hint are proprely handeled
        // this._handleCommandHint();
        // @todo @phoenix: make the multiselection
        // this.multiselectionRefresh();
        // @todo @phoenix: check it is still relevant
        // this.dispatchEvent(new Event("resetFromCommits"));
    }

    makeSnapshot() {
        const historyLength = this.dependencies.history.getHistoryCommits().length;
        if (!this.lastSnapshotLength || this.lastSnapshotLength < historyLength) {
            this.lastSnapshotLength = historyLength;
            const commit = this.dependencies.domMutation.createSnapshotCommit();
            const snapshot = {
                time: Date.now(),
                commit,
            };
            this.snapshots = [snapshot, this.snapshots[0]];
            // TODO AGE: is it ok to return it? It's just for tests.
            return snapshot;
        }
    }

    /**
     * @param {EditorCommit} commit
     */
    onMutationsCommitted(commit) {
        commit.updateData("peerId", this.peerId);
        this.trigger("on_collaboration_commit_added_handlers", commit);
    }
    /**
     * @param {EditorCommit} commit
     */
    processEditorCommit(commit) {
        commit.updateData("peerId", this.peerId);
        return commit;
    }
}
