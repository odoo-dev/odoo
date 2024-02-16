import { registry } from "@web/core/registry";
import { Plugin } from "../plugin";
import { getCommonAncestor } from "../utils/dom_traversal";

export class HistoryPlugin extends Plugin {
    static name = "history";
    static dependencies = ["dom", "selection"];
    static shared = [
        "getCurrentMutations",
        "revertCurrentMutationsUntil",
        "handleObserverRecords",
        "makeSavePoint",
    ];
    static resources = () => ({
        shortcuts: [
            { hotkey: "control+z", command: "HISTORY_UNDO" },
            { hotkey: "control+y", command: "HISTORY_REDO" },
        ],
    });

    // @todo @phoenix usefull for the collaboration plugin. See if we still want
    // to handle the serialization through that property later.
    isSerializable = false;

    setup() {
        this.addDomListener(this.editable, "input", this.addStep);
        this.addDomListener(this.editable, "keydown", this.stageSelection);
        this.addDomListener(this.editable, "beforeinput", this.stageSelection);
        this.observer = new MutationObserver(this.handleNewRecords.bind(this));
        this._cleanups.push(() => this.observer.disconnect());
        this.enableObserver();
        this.reset();

        const firstStep = this.makeSnapshotStep();
        // @todo @phoenix add this in the collaboration plugin.
        // this.historySnapshots = [{ step: firstStep }];
        this.steps.push(firstStep);
        // @todo @phoenix add in collaboration plugin?
        // The historyIds carry the ids of the steps that were dropped when
        // doing a snapshot.
        // Those historyIds are used to compare if the last step saved in the
        // server is present in the current historySteps or historyIds to
        // ensure it is the same history branch.
        // this.branchStepIds = [];

        this.renderingClasses = new Set(this.resources["history_rendering_classes"]);
    }
    handleCommand(command, payload) {
        switch (command) {
            case "HISTORY_UNDO":
                this.undo();
                break;
            case "HISTORY_REDO":
                this.redo();
                break;
            case "ADD_STEP":
                this.addStep();
                break;
            case "HISTORY_STAGE_SELECTION":
                this.stageSelection();
                break;
        }
    }

    reset() {
        this.steps = [];
        this.currentStep = {
            selection: {
                anchorNodeOid: undefined,
                anchorOffset: undefined,
                focusNodeOid: undefined,
                focusOffset: undefined,
            },
            mutations: [],
            id: this.generateId(),
            clientId: undefined,
        };
        this.stepsStates = new Map();
        this.nodeToIdMap = new WeakMap();
        this.idToNodeMap = new Map();
        // @todo @phoenix add in collaboration plugin? previously _historyIds
        this.branchStepIds = [];
        this.setNodeId(this.editable);
    }

    makeSnapshotStep() {
        return {
            selection: {
                anchorNode: undefined,
                anchorOffset: undefined,
                focusNode: undefined,
                focusOffset: undefined,
            },
            mutations: Array.from(this.editable.childNodes).map((node) => ({
                type: "add",
                append: 1,
                id: this.nodeToIdMap.get(node),
                node: this.serializeNode(node),
            })),
            id: this.generateId(),
            clientId: this.clientId,
            previousStepId: undefined,
        };
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
    disableObserver() {
        // @todo @phoenix do we still want to unobserve sometimes?
        this.handleObserverRecords();
        this.observer.disconnect();
    }

    handleObserverRecords() {
        this.handleNewRecords(this.observer.takeRecords());
    }
    handleNewRecords(records) {
        this.setIdOnRecords(records);
        records = this.filterMutationRecords(records);
        if (!records.length) {
            return;
        }
        this.stageRecords(records);
        // @todo @phoenix remove this?
        // @todo @phoenix this includes previous mutations that were already
        // stored in the current step. Ideally, it should only include the new ones.
        this.dispatch("CONTENT_UPDATED", this.getMutationsRoot(this.currentStep.mutations));
    }

    setIdOnRecords(records) {
        for (const record of records) {
            if (record.type === "childList") {
                this.setNodeId(record.target);
            }
        }
    }
    filterMutationRecords(records) {
        for (const callback of this.resources["filter_mutation_record"]) {
            records = callback(records);
        }

        // Save the first attribute in a cache to compare only the first
        // attribute record of node to its latest state.
        const attributeCache = new Map();
        const filteredRecords = [];

        for (const record of records) {
            if (record.type === "attributes") {
                // Skip the attributes change on the dom.
                if (record.target === this.editable) {
                    continue;
                }
                if (record.attributeName === "contenteditable") {
                    continue;
                }

                // @todo @phoenix test attributeCache
                attributeCache.set(record.target, attributeCache.get(record.target) || {});
                // @todo @phoenix add test for renderingClasses.
                if (record.attributeName === "class") {
                    const classBefore = (record.oldValue && record.oldValue.split(" ")) || [];
                    const classAfter =
                        (record.target.className &&
                            record.target.className.split &&
                            record.target.className.split(" ")) ||
                        [];
                    const excludedClasses = [];
                    for (const klass of classBefore) {
                        if (!classAfter.includes(klass)) {
                            excludedClasses.push(klass);
                        }
                    }
                    for (const klass of classAfter) {
                        if (!classBefore.includes(klass)) {
                            excludedClasses.push(klass);
                        }
                    }
                    if (
                        excludedClasses.length &&
                        excludedClasses.every((c) => this.renderingClasses.has(c))
                    ) {
                        continue;
                    }
                }
                if (
                    typeof attributeCache.get(record.target)[record.attributeName] === "undefined"
                ) {
                    const oldValue = record.oldValue === undefined ? null : record.oldValue;
                    attributeCache.get(record.target)[record.attributeName] =
                        oldValue !== record.target.getAttribute(record.attributeName);
                }
                if (!attributeCache.get(record.target)[record.attributeName]) {
                    continue;
                }
            }
            // @todo @phoenix add this in a "protected" plugin ?
            // const closestProtectedCandidate = closestElement(record.target, "[data-oe-protected]");
            // if (closestProtectedCandidate) {
            //     const protectedValue = closestProtectedCandidate.dataset.oeProtected;
            //     switch (protectedValue) {
            //         case "true":
            //         case "":
            //             if (
            //                 record.type !== "attributes" ||
            //                 record.target !== closestProtectedCandidate ||
            //                 isProtected(closestProtectedCandidate.parentElement)
            //             ) {
            //                 continue;
            //             }
            //             break;
            //         case "false":
            //             if (
            //                 record.type === "attributes" &&
            //                 record.target === closestProtectedCandidate &&
            //                 isProtected(closestProtectedCandidate.parentElement)
            //             ) {
            //                 continue;
            //             }
            //             break;
            //     }
            // }
            filteredRecords.push(record);
        }
        // @todo @phoenix allow an option to filter mutation records.
        // return this.options.filterMutationRecords(filteredRecords);
        return filteredRecords;
    }
    stageSelection() {
        const selection = this.shared.getEditableSelection();
        this.currentStep.selection = this.serializeSelection(selection, this.nodeToIdMap);
    }
    stageRecords(records) {
        // @todo @phoenix test this feature.
        // There is a case where node A is added and node B is a descendant of
        // node A where node B was not in the observed tree) then node B is
        // added into another node. In that case, we need to keep track of node
        // B so when serializing node A, we strip node B from the node A tree to
        // avoid the duplication of node A.
        const mutatedNodes = new Set();
        for (const record of records) {
            if (record.type === "childList") {
                for (const node of record.addedNodes) {
                    const id = this.setNodeId(node);
                    mutatedNodes.add(id);
                }
                for (const node of record.removedNodes) {
                    const id = this.setNodeId(node);
                    mutatedNodes.delete(id);
                }
            }
        }
        for (const record of records) {
            switch (record.type) {
                case "characterData": {
                    this.currentStep.mutations.push({
                        type: "characterData",
                        id: this.nodeToIdMap.get(record.target),
                        text: record.target.textContent,
                        oldValue: record.oldValue,
                    });
                    break;
                }
                case "attributes": {
                    this.currentStep.mutations.push({
                        type: "attributes",
                        id: this.nodeToIdMap.get(record.target),
                        attributeName: record.attributeName,
                        value: record.target.getAttribute(record.attributeName),
                        oldValue: record.oldValue,
                    });
                    break;
                }
                case "childList": {
                    record.addedNodes.forEach((added) => {
                        const mutation = {
                            type: "add",
                        };
                        if (!record.nextSibling && this.nodeToIdMap.get(record.target)) {
                            mutation.append = this.nodeToIdMap.get(record.target);
                        } else if (record.nextSibling && this.nodeToIdMap.get(record.nextSibling)) {
                            mutation.before = this.nodeToIdMap.get(record.nextSibling);
                        } else if (!record.previousSibling && this.nodeToIdMap.get(record.target)) {
                            mutation.prepend = this.nodeToIdMap.get(record.target);
                        } else if (
                            record.previousSibling &&
                            this.nodeToIdMap.get(record.previousSibling)
                        ) {
                            mutation.after = this.nodeToIdMap.get(record.previousSibling);
                        } else {
                            return false;
                        }
                        mutation.id = this.nodeToIdMap.get(added);
                        mutation.node = this.serializeNode(added, mutatedNodes);
                        this.currentStep.mutations.push(mutation);
                    });
                    record.removedNodes.forEach((removed) => {
                        this.currentStep.mutations.push({
                            type: "remove",
                            id: this.nodeToIdMap.get(removed),
                            parentId: this.nodeToIdMap.get(record.target),
                            node: this.serializeNode(removed),
                            nextId: record.nextSibling
                                ? this.nodeToIdMap.get(record.nextSibling)
                                : undefined,
                            previousId: record.previousSibling
                                ? this.nodeToIdMap.get(record.previousSibling)
                                : undefined,
                        });
                    });
                    break;
                }
            }
        }
    }
    getCurrentMutations() {
        return [...this.currentStep.mutations];
    }

    setNodeId(node) {
        let id = this.nodeToIdMap.get(node);
        if (!id) {
            id = this.generateId();
            this.nodeToIdMap.set(node, id);
            this.idToNodeMap.set(id, node);
        }
        for (const child of node.childNodes) {
            this.setNodeId(child);
        }
        return id;
    }
    generateId() {
        // No need for secure random number.
        return Math.floor(Math.random() * Math.pow(2, 52)).toString();
    }

    serializeNode(node, mutatedNodes) {
        // @todo @phoenix usefull for the collaboration plugin. See if we still want
        // to handle the serialization through that property later.
        // return this.isSerializable ? serializeNode(node, mutatedNodes) : node;
        return node;
    }
    unserializeNode(node) {
        // @todo @phoenix usefull for the collaboration plugin. See if we still want
        // to handle the serialization through that property later.
        // return this.isSerializable ? unserializeNode(node) : node;
        return node;
    }

    addStep() {
        // @todo @phoenix should we allow to pause the making of a step?
        // if (!this.stepsActive) {
        //     return;
        // }
        // @todo @phoenix link zws plugin
        // this._resetLinkZws();
        // @todo @phoenix sanitize plugin
        // this.sanitize();

        this.handleObserverRecords();
        const currentStep = this.currentStep;
        if (!currentStep.mutations.length) {
            return false;
        }
        this.dispatch("NORMALIZE", this.getMutationsRoot(currentStep.mutations));
        this.handleObserverRecords();

        // @todo @phoenix add this in the collaboration plugin.
        // currentStep.clientId = this._collabClientId;
        currentStep.previousStepId = this.steps.at(-1)?.id;

        this.steps.push(currentStep);
        // @todo @phoenix add this in the linkzws plugin.
        // this._setLinkZws();
        this.currentStep = {
            id: this.generateId(),
            selection: {},
            mutations: [],
        };
        this.stageSelection();
        return currentStep;
        // @todo @phoenix add this in the collaboration plugin.
        // this.multiselectionRefresh();
    }
    undo() {
        // The last step is considered an uncommited draft so always revert it.
        const lastStep = this.currentStep;
        this.revertMutations(lastStep.mutations);
        // Clean the last step otherwise if no other step is created after, the
        // mutations of the revert itself will be added to the same step and
        // grow exponentially at each undo.
        lastStep.mutations = [];

        const pos = this.getNextUndoIndex();
        if (pos > 0) {
            // Consider the position consumed.
            this.stepsStates.set(this.steps[pos].id, "consumed");
            this.revertMutations(this.steps[pos].mutations);
            this.setSerializedSelection(this.steps[pos].selection);
            const step = this.addStep();
            // Consider the last position of the history as an undo.
            this.stepsStates.set(step.id, "undo");
        }
    }
    redo() {
        // Current step is considered an uncommitted draft, so revert it,
        // otherwise a redo would not be possible.
        this.revertMutations(this.currentStep.mutations);
        // At this point, _currentStep.mutations contains the current step's
        // mutations plus the ones that revert it, with net effect zero.
        this.currentStep.mutations = [];

        const pos = this.getNextRedoIndex();
        if (pos > 0) {
            this.stepsStates.set(this.steps[pos].id, "consumed");
            this.revertMutations(this.steps[pos].mutations);
            this.setSerializedSelection(this.steps[pos].selection);
            const step = this.addStep();
            this.stepsStates.set(step.id, "redo");
        }
    }
    setSerializedSelection(selection) {
        if (!selection.anchorNodeOid) {
            return;
        }
        const anchorNode = this.idToNodeMap.get(selection.anchorNodeOid);
        if (!anchorNode) {
            return;
        }
        const newSelection = {
            anchorNode,
            anchorOffset: selection.anchorOffset,
        };
        const focusNode = this.idToNodeMap.get(selection.focusNodeOid);
        if (focusNode) {
            newSelection.focusNode = focusNode;
            newSelection.focusOffset = selection.focusOffset;
        }
        this.shared.setSelection(newSelection, false);
        // @todo @phoenix add this in the selection or table plugin.
        // // If a table must be selected, ensure it's in the same tick.
        // this._handleSelectionInTable();
    }
    /**
     * Get the step index in the history to undo.
     * Return -1 if no undo index can be found.
     */
    getNextUndoIndex() {
        // Go back to first step that can be undone ("redo" or undefined).
        for (let index = this.steps.length - 1; index >= 0; index--) {
            if (
                this.steps[index]
                // @todo @phoenix add this in the collaboration plugin.
                // && this.steps[index].clientId === this._collabClientId
            ) {
                const state = this.stepsStates.get(this.steps[index].id);
                if (state === "redo" || !state) {
                    return index;
                }
            }
        }
        // There is no steps left to be undone, return an index that does not
        // point to any step
        return -1;
    }
    /**
     * Get the step index in the history to redo.
     * Return -1 if no redo index can be found.
     */
    getNextRedoIndex() {
        // We cannot redo more than what is consumed.
        // Check if we have no more "consumed" than "redo" until we get to an
        // "undo"
        let totalConsumed = 0;
        for (let index = this.steps.length - 1; index >= 0; index--) {
            if (
                this.steps[index] &&
                // @todo @phoenix add this in the collaboration plugin.
                this.steps[index].clientId === this._collabClientId
            ) {
                const state = this.stepsStates.get(this.steps[index].id);
                switch (state) {
                    case "undo":
                        return totalConsumed <= 0 ? index : -1;
                    case "redo":
                        totalConsumed -= 1;
                        break;
                    case "consumed":
                        totalConsumed += 1;
                        break;
                    default:
                        return -1;
                }
            }
        }
        return -1;
    }
    revertMutations(mutations) {
        for (const mutation of mutations.toReversed()) {
            switch (mutation.type) {
                case "characterData": {
                    const node = this.idToNodeMap.get(mutation.id);
                    if (node) {
                        node.textContent = mutation.oldValue;
                    }
                    break;
                }
                case "attributes": {
                    const node = this.idToNodeMap.get(mutation.id);
                    if (node) {
                        if (mutation.oldValue) {
                            let value = mutation.oldValue;
                            if (typeof value === "string" && mutation.attributeName === "class") {
                                value = value
                                    .split(" ")
                                    .filter((c) => !this.renderingClasses.has(c))
                                    .join(" ");
                            }
                            // @todo @phoenix add this in the collaboration plugin.
                            // if (this._collabClientId) {
                            //     this._safeSetAttribute(node, mutation.attributeName, value);
                            // } else {
                            node.setAttribute(mutation.attributeName, value);
                            // }
                        } else {
                            node.removeAttribute(mutation.attributeName);
                        }
                    }
                    break;
                }
                case "remove": {
                    let nodeToRemove = this.idToNodeMap.get(mutation.id);
                    if (!nodeToRemove) {
                        nodeToRemove = this.unserializeNode(mutation.node);

                        // @todo @phoenix add this in the collaboration plugin.
                        // const fakeNode = document.createElement("fake-el");
                        // fakeNode.appendChild(nodeToRemove);
                        // DOMPurify.sanitize(fakeNode, { IN_PLACE: true });
                        // nodeToRemove = fakeNode.childNodes[0];
                        // if (!nodeToRemove) {
                        //     continue;
                        // }

                        this.setNodeId(nodeToRemove);
                    }
                    if (mutation.nextId && this.idToNodeMap.get(mutation.nextId)?.isConnected) {
                        const node = this.idToNodeMap.get(mutation.nextId);
                        node && node.before(nodeToRemove);
                    } else if (
                        mutation.previousId &&
                        this.idToNodeMap.get(mutation.previousId)?.isConnected
                    ) {
                        const node = this.idToNodeMap.get(mutation.previousId);
                        node && node.after(nodeToRemove);
                    } else {
                        const node = this.idToNodeMap.get(mutation.parentId);
                        node && node.append(nodeToRemove);
                    }
                    break;
                }
                case "add": {
                    const node = this.idToNodeMap.get(mutation.id);
                    if (node) {
                        node.remove();
                    }
                }
            }
        }
    }
    revertCurrentMutationsUntil(index) {
        const mutationToRevert = this.currentStep.mutations.splice(index);
        this.revertMutations(mutationToRevert);
    }

    serializeSelection(selection, nodeToIdMap) {
        if (
            selection &&
            selection.anchorNode &&
            nodeToIdMap.get(selection.anchorNode) &&
            typeof selection.anchorOffset !== "undefined" &&
            selection.focusNode &&
            nodeToIdMap.get(selection.anchorNode) &&
            typeof selection.focusOffset !== "undefined"
        ) {
            return {
                anchorNodeOid: nodeToIdMap.get(selection.anchorNode),
                anchorOffset: selection.anchorOffset,
                focusNodeOid: nodeToIdMap.get(selection.focusNode),
                focusOffset: selection.focusOffset,
            };
        } else {
            return {
                anchorNodeOid: undefined,
                anchorOffset: undefined,
                focusNodeOid: undefined,
                focusOffset: undefined,
            };
        }
    }
    /**
     * Returns the deepest common ancestor element of the given mutations.
     * @param {[]} mutations - The array of mutations.
     * @returns {HTMLElement|null} - The common ancestor element.
     */
    getMutationsRoot(mutations) {
        const nodes = mutations
            .map((m) => this.idToNodeMap.get(m.parentId || m.id))
            .filter((node) => this.editable.contains(node));
        let commonAncestor = getCommonAncestor(nodes, this.editable);
        if (commonAncestor?.nodeType === Node.TEXT_NODE) {
            commonAncestor = commonAncestor.parentElement;
        }
        return commonAncestor;
    }
    /**
     * Returns a function that can be later called to revert history to the
     * current state.
     * @returns {Function}
     */
    makeSavePoint() {
        const savePointIndex = this.steps.length - 1;
        return () => this.revertStepsUntil(savePointIndex);
    }
    /**
     * Reverts the history steps until the specified step index.
     * @param {number} stepIndex
     */
    revertStepsUntil(stepIndex) {
        // Discard current step's mutations
        this.revertMutations(this.currentStep.mutations);
        this.currentStep.mutations = [];

        // Revert each step that is not "consumed" until stepIndex (not inclusive).
        const stepsToRevert = this.steps
            .slice(stepIndex + 1)
            .filter((step) => this.stepsStates.get(step.id) !== "consumed");

        for (const step of stepsToRevert.toReversed()) {
            this.revertMutations(step.mutations);
            this.stepsStates.set(step.id, "consumed");
        }

        // Restore selection to last reverted step's selection.
        const lastRevertedStep = stepsToRevert[0] || this.currentStep;
        this.setSerializedSelection(lastRevertedStep.selection);

        // Register resulting mutations as a new step.
        const addedStep = this.addStep();
        if (addedStep) {
            this.stepsStates.set(addedStep.id, "consumed");
        }
    }
}

registry.category("phoenix_plugins").add(HistoryPlugin.name, HistoryPlugin);
