/**
 * @typedef { string } EditorCommitId
 * @typedef { "original" | "undo" | "redo" | "restore" | "reset" } EditorCommitType
 * @typedef { { [key: string]: any } } EditorCommitData
 */

/**
 * @template [T={}]
 */
export class EditorCommit {
    constructor({
        id = this.generateId(),
        type = "original",
        data = {},
        batchable = false,
        batchingTimestamp = null,
        writtenAt = null,
    } = {}) {
        /** @type { EditorCommitId } */
        this.id = id;
        /** @type { EditorCommitType } */
        this.type = type;
        /** @type { EditorCommitData & T } */
        this.data = data;
        /** @type { number | null } */
        this.writtenAt = writtenAt;

        // TODO AGE: more unclear. Maybe for data?
        /** @type { EditorCommitId } */
        this.batchable = batchable;
        /** @type { EditorCommitId } */
        this.batchingTimestamp = batchingTimestamp;
    }

    /**
     * Set the date at which the commit was written (unless written before).
     */
    write() {
        this.writtenAt ??= Date.now();
    }

    /**
     * @param {string} key
     * @param {any} value
     */
    updateData(key, value) {
        this.data[key] = value;
    }

    /**
     * @returns { EditorCommitId }
     */
    generateId() {
        // No need for secure random number.
        return Math.floor(Math.random() * Math.pow(2, 52)).toString();
    }
}
