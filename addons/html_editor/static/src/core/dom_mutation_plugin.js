import { Plugin } from "../plugin";
import { trackOccurrences, trackOccurrencesPair } from "@html_editor/utils/tracking";

export class DomMutationPlugin extends Plugin {
    static id = "domMutation";
    static dependencies = ["selection", "history"];
    static shared = [
        "commitChanges",
        "setAutoStage",
        "stageSelection", // todo : to remove/reimplement
        "makeSavePoint", // todo : to remove/reimplement
        "ignoreDOMMutations", // todo : to remove/reimplement
        "makePreviewableOperation", // todo : to remove/reimplement
        "serializeSelection", // todo : to remove/reimplement
        "handleNewRecords", // todo : to remove/reimplement
        "getHistorySteps", // todo : to remove/reimplement
    ];

    autoStageMutation = true;
    /** @type {import("plugins").EditorResources} */
    resources = {
        start_edition_handlers: () => {
            this.enableObserver();
        },
    };

    setup() {
        this.mutationFilteredClasses = new Set(this.getResource("system_classes"));
        this.mutationFilteredAttributes = new Set(this.getResource("system_attributes"));
        this._onKeyupResetContenteditableNodes = []; // todo: what's this ??
        this.observer = new MutationObserver((records) => this.handleNewRecords(records));
        this.enableObserverCallbacks = new Set();
        this._cleanups.push(() => this.observer.disconnect());
        this.clean();
    }

    clean() {
        // this.handleObserverRecords();
        // /** @type { HistoryStep[] } */
        // this.steps = [];
        // /** @type { HistoryStep } */
        // this.currentStep = this.processHistoryStep({
        //     selection: {},
        //     mutations: [],
        //     id: this.generateId(),
        //     previousStepId: undefined,
        //     extraStepInfos: {},
        // });
        // /** @type {Set<string>} Steps reverted by undo/redo operations */
        // this.revertedSteps = new Set();
        // /** @type {Set<string>} Steps reverted by restoring to a save point */
        // this.discardedSteps = new Set();
        // this.nodeMap = new NodeMap();
        // /** @type { WeakMap<Node, { attributes: Map<string, string>, classList: Map<string, boolean>, characterData: Map<string, string> }> } */
        // this.lastObservedState = new WeakMap();
        // this.setNodeId(this.editable);
        // this.dispatchTo("history_cleaned_handlers");
    }

    setAutoStage(value) {
        this.autoStageMutation = value;
    }

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

    // ----------------------------------------
    // Mutation records Handling
    // ----------------------------------------

    /**
     * @param { MutationRecord[] } records
     * @param { boolean } [dispatch]
     */
    handleNewRecords(records, dispatch) {
        console.warn(" handleNewRecords called ", [...records]);
        // TODO (SGE) rework processNewRecords double call to make it less convoluted ?
        const processedRecords = this.processNewRecords(records);
        if (processedRecords.length) {
            // TODO modify `handleMutations` of web_studio to handle
            // `undoOperation`
            if (dispatch) {
                const stepType = this.currentStep.type;
                this.dispatchTo("handleNewRecords", processedRecords, stepType);
            }
            // Process potential new records adds by handleNewRecords.
            this.processNewRecords(this.observer.takeRecords());
            this.dispatchContentUpdated();
        }
    }

    /**
     * @param { MutationRecord[] } mutationRecords
     * @returns { HistoryMutationRecord[] }
     */
    processNewRecords(mutationRecords) {
        if (this.observer.takeRecords().length) {
            throw new Error("MutationObserver has pending records");
        }
        mutationRecords = this.filterMutationRecords(mutationRecords);
        /** @type {HistoryMutationRecord[]} */
        let records = this.transformToHistoryMutationRecords(mutationRecords);
        records = records.filter((record) => !this.isSystemMutationRecord(record));
        records = this.filterAndAdjustHistoryMutationRecords(records);
        this.stageRecords(records);
        records
            .filter(({ type }) => type === "attributes")
            .forEach((record) => this.dispatchTo("attribute_change_handlers", record));
        return records;
    }

    /**
     * @param { MutationRecord[] } records
     * @returns { MutationRecord[] }
     */
    filterMutationRecords(records) {
        records = this.filterAttributeMutationRecords(records);
        records = this.filterSameTextContentMutationRecords(records);
        records = this.filterOutIntermediateStateMutationRecords(records);
        return records;
    }

    /**
     * @param { MutationRecord[] } records
     */
    filterAttributeMutationRecords(records) {
        return records.filter((record) => {
            if (record.type !== "attributes") {
                return true;
            }
            // Skip the attributes change on the dom.
            if (record.target === this.editable) {
                return false;
            }
            if (record.attributeName === "contenteditable") {
                return false;
            }
            return true;
        });
    }

    /**
     * @param { MutationRecord[] } records
     * @returns { MutationRecord[] }
     */
    filterSameTextContentMutationRecords(records) {
        const filteredRecords = [];
        for (const record of records) {
            if (record.type === "childList" && this.isSameTextContentMutation(record)) {
                const { addedNodes, removedNodes } = record;
                const oldId = this.nodeMap.getId(removedNodes[0]);
                if (oldId) {
                    this.nodeMap.set(oldId, addedNodes[0]);
                    continue;
                }
            }
            filteredRecords.push(record);
        }
        return filteredRecords;
    }

    /**
     * Mutation records of type "attribute" and "characterData" provide the old
     * value, but not the new value. When multiple mutations occur in the same
     * batch for an element's attribute or characterData, we only know the final
     * value of the accumulated changes, which is the DOM's current state.
     *
     *  The oldValue provided by mutations after the first one are intermediate
     *  states that we do not care about. Discarding them allows us to store a
     *  single record representing the accumulated changes, instead of
     *  reconstructing the new value introduced by each mutation.
     *
     * @param { MutationRecord[] } records
     */
    filterOutIntermediateStateMutationRecords(records) {
        // Keep track of visited attributes per each node
        const isFirstAttributeOccurrence = trackOccurrencesPair();
        // Keep track of visited nodes for characterData mutations
        const isFirstCharDataOccurence = trackOccurrences();
        const filteredRecords = [];
        for (const record of records) {
            if (record.type === "attributes") {
                // Keep only the first mutation record for each (node, attribute) pair.
                if (isFirstAttributeOccurrence(record.target, record.attributeName)) {
                    filteredRecords.push(record);
                }
            } else if (record.type === "characterData") {
                // Keep only the first charData mutation record for each node.
                if (isFirstCharDataOccurence(record.target)) {
                    filteredRecords.push(record);
                }
            } else {
                filteredRecords.push(record);
            }
        }
        return filteredRecords;
    }

    /**
     * Transforms MutationRecords into HistoryMutationRecords.
     *
     * ChildList record have added/removed trees added to them.
     * Class attribute records are expanded into multiple classList records.
     * Attribute records have their oldValue normalized and new value added to it.
     * CharacterData records have the new value added to it.
     *
     * @param {MutationRecord[]} records
     * @returns {HistoryMutationRecord[]}
     */
    transformToHistoryMutationRecords(records) {
        //TODO : Refactor with the new crdt implementation here ?
        records = this.transformChildListRecords(records);
        return records.flatMap((record) => {
            if (record.type === "attributes") {
                if (record.attributeName === "class") {
                    return this.splitClassMutationRecord(record);
                }
                const oldValue = record.oldValue === undefined ? null : record.oldValue;
                const value = record.target.getAttribute(record.attributeName);
                return { ...pick(record, "type", "target", "attributeName"), oldValue, value };
            }
            if (record.type === "characterData") {
                const value = record.target.textContent;
                return { ...pick(record, "type", "target", "oldValue"), value };
            }
            return record;
        });
    }

    // ----------------------------------------
    // Sharded methods to be implemented
    // ----------------------------------------

    commitChanges() {
        console.log("commit called - to be implemented");
    }

    stageSelection() {
        console.log("stageSelection called - to be implemented");
    }

    makeSavePoint() {
        console.log("makeSavePoint called - to be implemented");
    }

    ignoreDOMMutations() {
        console.log("ignoreDOMMutations called - to be implemented");
    }

    makePreviewableOperation() {
        console.log("makePreviewableOperation called - to be implemented");
    }

    serializeSelection() {
        console.log("serializeSelection called - to be implemented");
    }

    getHistorySteps() {
        console.log("getHistorySteps called - to be implemented");
    }
}
