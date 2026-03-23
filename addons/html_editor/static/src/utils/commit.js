/**
 * @typedef { string } EditorCommitId
 * @typedef { "original" | "undo" | "redo" | "restore" | "reset" } EditorCommitType
 * @typedef { { [key: string]: any } } EditorCommitData
 *
 * @typedef { Object } EditorCommitMetadata
 * @property { boolean } [batchable = false]
 * @property { number | null } [commitTimestamp = null]
 */

/**
 * @template { Object } [T=EditorCommitData]
 */
export class EditorCommit {
    /**
     * @param { Object } [param0 = {}]
     * @param { EditorCommitId } [param0.id = this.generateId()]
     * @param { EditorCommitType } [param0.type = "original"]
     * @param { T } [param0.data = {}]
     * @param { EditorCommitMetadata } [param0.metadata = {}]
     */
    constructor({ id = this.generateId(), type = "original", data = {}, metadata = {} } = {}) {
        /** @type { EditorCommitId } */
        this.id = id;
        /** @type { EditorCommitType } */
        this.type = type;
        /** @type { EditorCommitData & T } */
        this.data = data;
        /** @type { EditorCommitMetadata } */
        this.metadata = {
            batchable: metadata.batchable || false,
            commitTimestamp: metadata.commitTimestamp ?? null,
        };
    }

    /**
     * Set the date at which the commit was written (unless written before).
     */
    stamp() {
        this.metadata.commitTimestamp ??= Date.now();
    }

    /**
     * @param {keyof (EditorCommitData & T)} key
     * @param {any} value
     */
    updateData(key, value) {
        this.data[key] = value;
    }

    /**
     * @param {keyof (EditorCommitMetadata & U)} key
     * @param {any} value
     */
    updateMetadata(key, value) {
        this.metadata[key] = value;
    }

    /**
     * @returns { EditorCommitId }
     */
    generateId() {
        // No need for secure random number.
        return Math.floor(Math.random() * Math.pow(2, 52)).toString();
    }
}
