/** @odoo-module */

import { describe, test, expect } from "@odoo/hoot";
import { Deferred } from "@web/core/utils/concurrency";
import { CollaborationPlugin } from "../../src/editor/core/collaboration_plugin";
import { createDOMPathGenerator } from "../../src/editor/utils/dom_traversal";
import { DIRECTIONS } from "../../src/editor/utils/position";
import { setupEditor } from "../test_helpers/editor";
import { unformat } from "../test_helpers/format";
import { parseHTML } from "../../src/editor/utils/html";
import { Plugin } from "../../src/editor/plugin";
import { addStep, undo } from "../test_helpers/user_actions";
import { registry } from "@web/core/registry";
import { HistoryPlugin } from "../../src/editor/core/history_plugin";

/**
 *
 * @typedef { import("../../src/editor/editor").Editor } Editor
 *
 * @typedef { Object } PeerInfo
 * @property { string } peerId
 * @property { import("../../src/editor/core/history_plugin").HistoryStep[] } steps
 * @property { Editor } editor
 * @property { import("../../src/editor/core/collaboration_plugin").CollaborationPlugin } collaborationPlugin
 * @property { import("../../src/editor/plugin").HistoryPlugin } historyPlugin
 *
 * @typedef { Object } MultiEditorSpec
 * @property { string[] } peerIds
 * @property { string } contentBefore
 * @property { string } contentAfter
 * @property { Plugin[] } Plugins
 * @property { (peerInfos: Record<string, PeerInfo>) => Promise<void> } afterCreate
 * @property { (peerInfos: Record<string, PeerInfo>) => Promise<void> } afterCursorInserted
 *
 * @typedef { Object } EditorSelection
 * @property { Node } anchorNode
 * @property { number } anchorOffset
 * @property { Node } focusNode
 * @property { number } focusOffset
 */

function historyMissingParentSteps(peerInfos, peerInfo, { step, fromStepId }) {
    const missingSteps = peerInfos[step.peerId].collaborationPlugin.historyGetMissingSteps({
        fromStepId,
        toStepId: step.id,
    });
    if (missingSteps === -1 || !missingSteps.length) {
        throw new Error("Impossible to get the missing steps.");
    }
    peerInfo.collaborationPlugin.onExternalHistorySteps(missingSteps.concat([step]));
}

/**
 * @param { MultiEditorSpec } spec
 * @returns { Promise<void> }
 */
const testMultiEditor = async (spec) => {
    /** @type { Record<string, PeerInfo> } */
    const peerInfos = {};
    const peerIds = spec.peerIds;
    const initialHystoryPluginGenerateId = CollaborationPlugin.prototype.generateId;

    for (const peerId of peerIds) {
        const peerInfo = {
            peerId,
            steps: [],
        };
        peerInfos[peerId] = peerInfo;
        let n = 0;
        HistoryPlugin.prototype.generateId = () => `fake_id_${n++}`;
        let selection;
        const defaultPlugins = registry.category("phoenix_plugins").getAll();
        const base = await setupEditor(spec.contentBefore, {
            inIFrame: true,
            onMounted: (editable) => {
                selection = parseMultipleTextualSelection(editable, peerId);
            },
            config: {
                Plugins: [
                    ...defaultPlugins,
                    CollaborationPlugin,
                    class TestHistoryAdapterPlugin extends Plugin {
                        static name = "test-history-adapter";
                        handleCommand(commandId, payload) {
                            switch (commandId) {
                                case "COLLABORATION_STEP_ADDED":
                                    peerInfo.steps.push(payload);
                                    break;
                                case "HISTORY_MISSING_PARENT_STEP":
                                    historyMissingParentSteps(peerInfos, peerInfo, payload);
                                    break;
                            }
                        }
                    },
                    ...(spec.Plugins || []),
                ],
                peerId,
            },
        });
        peerInfo.editor = base.editor;
        if (selection && selection.anchorNode) {
            base.editor.shared.setSelection(selection);
        } else {
            base.editor.document.getSelection().removeAllRanges();
        }
        const getPlugin = (name) => base.editor.plugins.find((x) => x.constructor.name === name);
        peerInfo.collaborationPlugin = getPlugin("collaboration");
        peerInfo.historyPlugin = getPlugin("history");
    }

    const peerInfosList = Object.values(peerInfos);

    // Init the editors

    // From now, any any step from a peer must have a different ID.
    let concurentNextId = 1;
    for (const { historyPlugin } of peerInfosList) {
        historyPlugin.generateId = () => "fake_concurent_id_" + concurentNextId++;
        historyPlugin.currentStep.id = historyPlugin.generateId();
    }

    if (spec.afterCreate) {
        await spec.afterCreate(peerInfos);
    }

    renderTextualSelection(peerInfosList);

    for (const peerInfo of peerInfosList) {
        // todo: should probably use only one method (like clean)
        const el = peerInfo.editor.editable;
        peerInfo.editor.dispatch("NORMALIZE", { node: el });
        peerInfo.editor.dispatch("CLEAN", el);
        peerInfo.editor.dispatch("MERGE_ADJACENT_NODE", { node: el });
    }

    if (spec.contentAfter) {
        for (const peerInfo of peerInfosList) {
            const value = peerInfo.editor.editable.innerHTML;
            expect(value).toBe(spec.contentAfter, {
                message: `error with peer ${peerInfo.peerId}`,
            });
        }
    }
    if (spec.afterCursorInserted) {
        await spec.afterCursorInserted(peerInfos);
    }
    for (const peerInfo of peerInfosList) {
        peerInfo.editor.destroy();
    }

    HistoryPlugin.prototype.generateId = initialHystoryPluginGenerateId;
};

const applyConcurentActions = (peerInfos, concurentActions) => {
    const peerInfosList = Object.values(peerInfos);
    for (const peerInfo of peerInfosList) {
        if (typeof concurentActions[peerInfo.peerId] === "function") {
            concurentActions[peerInfo.peerId](peerInfo.editor);
        }
    }
};

const mergePeersSteps = (peerInfos) => {
    const peerInfosList = Object.values(peerInfos);
    for (const peerInfoA of peerInfosList) {
        for (const peerInfoB of peerInfosList) {
            if (peerInfoA === peerInfoB) {
                continue;
            }
            for (const step of peerInfoB.steps) {
                peerInfoA.collaborationPlugin.onExternalHistorySteps([
                    JSON.parse(JSON.stringify(step)),
                ]);
            }
        }
    }
};

/**
 * @param {Record<string, PeerInfo>} peerInfos
 */
const testSameHistory = (peerInfos) => {
    const peerInfosList = Object.values(peerInfos);

    const PeerInfo = peerInfosList[0];
    const historyLength = PeerInfo.historyPlugin.steps.length;

    for (const peerInfo of peerInfosList.slice(1)) {
        expect(peerInfo.historyPlugin.steps.length).toBe(historyLength, {
            message: "The history size should be the same.",
        });
        for (let i = 0; i < historyLength; i++) {
            expect(PeerInfo.historyPlugin.steps[i].id).toBe(peerInfo.historyPlugin.steps[i].id, {
                message: `History steps are not consistent accross peers.`,
            });
        }
    }
};

/**
 * @param {Record<string, PeerInfo>[]} peerInfosList
 */
function renderTextualSelection(peerInfosList) {
    const cursorNodes = {};
    for (const peerInfo of peerInfosList) {
        const iframeDocument = peerInfo.editor.document;
        const historyPlugin = peerInfo.historyPlugin;
        const peerSelection = iframeDocument.getSelection();
        if (peerSelection.anchorNode === null) {
            continue;
        }

        const { anchorNode, anchorOffset, focusNode, focusOffset } = peerSelection;

        const peerId = peerInfo.peerId;
        const focusNodeId = historyPlugin.nodeToIdMap.get(focusNode);
        const anchorNodeId = historyPlugin.nodeToIdMap.get(anchorNode);
        cursorNodes[focusNodeId] = cursorNodes[focusNodeId] || [];
        cursorNodes[focusNodeId].push({ type: "focus", peerId, offset: focusOffset });
        cursorNodes[anchorNodeId] = cursorNodes[anchorNodeId] || [];
        cursorNodes[anchorNodeId].push({ type: "anchor", peerId, offset: anchorOffset });
    }

    for (const nodeId of Object.keys(cursorNodes)) {
        cursorNodes[nodeId] = cursorNodes[nodeId].sort((a, b) => {
            return b.offset - a.offset || b.peerId.localeCompare(a.peerId);
        });
    }

    for (const peerInfo of peerInfosList) {
        const historyPlugin = peerInfo.historyPlugin;
        for (const [nodeId, cursorsData] of Object.entries(cursorNodes)) {
            const node = historyPlugin.idToNodeMap.get(nodeId);
            for (const cursorData of cursorsData) {
                const cursorString =
                    cursorData.type === "anchor"
                        ? `[${cursorData.peerId}}`
                        : `{${cursorData.peerId}]`;
                insertCharsAt(cursorString, node, cursorData.offset);
            }
        }
    }
}

/**
 * Inserts the given characters at the given offset of the given node.
 *
 * @param {string} chars
 * @param {Node} node
 * @param {number} offset
 */
export function insertCharsAt(chars, node, offset) {
    const document = node.ownerDocument;
    if (node.nodeType === Node.TEXT_NODE) {
        const startValue = node.nodeValue;
        if (offset < 0 || offset > startValue.length) {
            throw new Error(`Invalid ${chars} insertion in text node`);
        }
        node.nodeValue = startValue.slice(0, offset) + chars + startValue.slice(offset);
    } else {
        if (offset < 0 || offset > node.childNodes.length) {
            throw new Error(`Invalid ${chars} insertion in non-text node`);
        }
        const textNode = document.createTextNode(chars);
        if (offset < node.childNodes.length) {
            node.insertBefore(textNode, node.childNodes[offset]);
        } else {
            node.appendChild(textNode);
        }
    }
}

const inScopeTraversal = createDOMPathGenerator(DIRECTIONS.RIGHT, { inScope: true });

/**
 * @param {Node} rootElement
 * @returns {Record<string, EditorSelection>}
 */
function parseMultipleTextualSelection(rootElement, peerId) {
    /** @type { EditorSelection } */
    const selection = {
        anchorNode: null,
        anchorOffset: null,
        focusNode: null,
        focusOffset: null,
    };
    for (const currentNode of [rootElement, ...inScopeTraversal(rootElement, 0)]) {
        if (currentNode.nodeType === Node.TEXT_NODE) {
            // Look for special characters in the text content and remove them.
            let match;
            const regex = new RegExp(/(?:\[(\w+)\})|(?:\{(\w+)])/, "gd");
            while ((match = regex.exec(currentNode.textContent))) {
                regex.lastIndex = 0;
                const indexes = match.indices[0];

                if (match[0].includes("}")) {
                    const selectionPeerId = match[1];
                    if (selectionPeerId === peerId) {
                        selection.anchorNode = currentNode;
                        selection.anchorOffset = indexes[0];
                    }
                } else {
                    const selectionPeerId = match[2];
                    if (selectionPeerId === peerId) {
                        selection.focusNode = currentNode;
                        selection.focusOffset = indexes[0];
                    }
                }
                currentNode.textContent =
                    currentNode.textContent.slice(0, indexes[0]) +
                    currentNode.textContent.slice(indexes[1]);
            }
        }
    }

    return selection;
}

/**
 * @param {Editor} editor
 * @param {string} value
 */
function insert(editor, value) {
    editor.shared.domInsert(value);
    editor.dispatch("ADD_STEP");
}
/**
 * @param {Editor} editor
 */
function deleteBackward(editor) {
    editor.dispatch("DELETE_BACKWARD");
}

describe("Conflict resolution", () => {
    test("all peer steps should be on the same order", async () => {
        await testMultiEditor({
            peerIds: ["c1", "c2", "c3"],
            contentBefore: "<p><x>a[c1}{c1]</x><y>e[c2}{c2]</y><z>i[c3}{c3]</z></p>",
            afterCreate: (peerInfos) => {
                applyConcurentActions(peerInfos, {
                    c1: (editor) => {
                        insert(editor, "b");
                        insert(editor, "c");
                        insert(editor, "d");
                    },
                    c2: (editor) => {
                        insert(editor, "f");
                        insert(editor, "g");
                        insert(editor, "h");
                    },
                    c3: (editor) => {
                        insert(editor, "j");
                        insert(editor, "k");
                        insert(editor, "l");
                    },
                });
                mergePeersSteps(peerInfos);
                testSameHistory(peerInfos);
            },
            contentAfter: "<p><x>abcd[c1}{c1]</x><y>efgh[c2}{c2]</y><z>ijkl[c3}{c3]</z></p>",
        });
    });
    test("should 2 peer insertText in 2 different paragraph", async () => {
        await testMultiEditor({
            peerIds: ["c1", "c2"],
            contentBefore: "<p>ab[c1}{c1]</p><p>cd[c2}{c2]</p>",
            afterCreate: (peerInfos) => {
                applyConcurentActions(peerInfos, {
                    c1: (editor) => {
                        insert(editor, "e");
                    },
                    c2: (editor) => {
                        insert(editor, "f");
                    },
                });
                mergePeersSteps(peerInfos);
                testSameHistory(peerInfos);
            },
            contentAfter: "<p>abe[c1}{c1]</p><p>cdf[c2}{c2]</p>",
        });
    });
    test("should 2 peer insertText twice in 2 different paragraph", async () => {
        await testMultiEditor({
            peerIds: ["c1", "c2"],
            contentBefore: "<p>ab[c1}{c1]</p><p>cd[c2}{c2]</p>",
            afterCreate: (peerInfos) => {
                applyConcurentActions(peerInfos, {
                    c1: (editor) => {
                        insert(editor, "e");
                        insert(editor, "f");
                    },
                    c2: (editor) => {
                        insert(editor, "g");
                        insert(editor, "h");
                    },
                });
                mergePeersSteps(peerInfos);
                testSameHistory(peerInfos);
            },
            contentAfter: "<p>abef[c1}{c1]</p><p>cdgh[c2}{c2]</p>",
        });
    });
    test("should insertText with peer 1 and deleteBackward with peer 2", async () => {
        await testMultiEditor({
            peerIds: ["c1", "c2"],
            contentBefore: "<p>ab[c1}{c1][c2}{c2]c</p>",
            afterCreate: (peerInfos) => {
                applyConcurentActions(peerInfos, {
                    c1: (editor) => {
                        insert(editor, "d");
                    },
                    c2: (editor) => {
                        deleteBackward(editor);
                    },
                });
                mergePeersSteps(peerInfos);
                testSameHistory(peerInfos);
            },
            contentAfter: "<p>a[c2}{c2]d[c1}{c1]cc</p>",
        });
    });
    test("should insertText twice with peer 1 and deleteBackward twice with peer 2", async () => {
        await testMultiEditor({
            peerIds: ["c1", "c2"],
            contentBefore: "<p>ab[c1}{c1][c2}{c2]c</p>",
            afterCreate: (peerInfos) => {
                applyConcurentActions(peerInfos, {
                    c1: (editor) => {
                        insert(editor, "d");
                        insert(editor, "e");
                    },
                    c2: (editor) => {
                        deleteBackward(editor);
                        deleteBackward(editor);
                    },
                });
                mergePeersSteps(peerInfos);
                testSameHistory(peerInfos);
            },
            contentAfter: "<p>de[c1}{c1]c[c2}{c2]c</p>",
        });
    });
});
test("should not revert the step of another peer", async () => {
    await testMultiEditor({
        peerIds: ["c1", "c2"],
        contentBefore: "<p><x>a[c1}{c1]</x><y>b[c2}{c2]</y></p>",
        afterCreate: (peerInfos) => {
            applyConcurentActions(peerInfos, {
                c1: (editor) => {
                    insert(editor, "c");
                },
                c2: (editor) => {
                    insert(editor, "d");
                },
            });
            mergePeersSteps(peerInfos);
            undo(peerInfos.c1.editor);
            undo(peerInfos.c2.editor);
            expect(peerInfos.c1.editor.editable.innerHTML).toBe("<p><x>a</x><y>bd</y></p>", {
                message: "error with peer c1",
            });
            expect(peerInfos.c2.editor.editable.innerHTML).toBe("<p><x>ac</x><y>b</y></p>", {
                message: "error with peer c2",
            });
        },
    });
});
test("should reset from snapshot", async () => {
    await testMultiEditor({
        peerIds: ["c1", "c2"],
        contentBefore: "<p>a[c1}{c1]</p>",
        afterCreate: (peerInfos) => {
            insert(peerInfos.c1.editor, "b");
            peerInfos.c1.collaborationPlugin.makeSnapshot();
            // Insure the snapshot is considered to be older than 30 seconds.
            peerInfos.c1.collaborationPlugin.snapshots[0].time = 1;
            const { steps } = peerInfos.c1.collaborationPlugin.getSnapshotSteps();
            peerInfos.c2.collaborationPlugin.resetFromSteps(steps);

            expect(peerInfos.c2.historyPlugin.steps.map((x) => x.id)).toEqual([
                "fake_concurent_id_1",
            ]);
            expect(peerInfos.c2.historyPlugin.steps[0].mutations.map((x) => x.id)).toEqual([
                "fake_id_1",
            ]);
        },
        contentAfter: "<p>ab[c1}{c1]</p>",
    });
});
describe("steps whith no parent in history", () => {
    test("should be able to retreive steps when disconnected from peers that has send step", async () => {
        await testMultiEditor({
            peerIds: ["c1", "c2", "c3"],
            contentBefore: "<p><x>a[c1}{c1]</x><y>b[c2}{c2]</y><z>c[c3}{c3]</z></p>",
            afterCreate: (peerInfos) => {
                insert(peerInfos.c1.editor, "d");
                peerInfos.c2.collaborationPlugin.onExternalHistorySteps([
                    peerInfos.c1.historyPlugin.steps[1],
                ]);
                insert(peerInfos.c2.editor, "e");
                peerInfos.c1.collaborationPlugin.onExternalHistorySteps([
                    peerInfos.c2.historyPlugin.steps[2],
                ]);
                peerInfos.c3.collaborationPlugin.onExternalHistorySteps([
                    peerInfos.c2.historyPlugin.steps[2],
                ]);
                // receive step 1 after step 2
                peerInfos.c3.collaborationPlugin.onExternalHistorySteps([
                    peerInfos.c1.historyPlugin.steps[1],
                ]);
                testSameHistory(peerInfos);
            },
            contentAfter: "<p><x>ad[c1}{c1]</x><y>be[c2}{c2]</y><z>c[c3}{c3]</z></p>",
        });
    });
    test("should receive steps where parent was not received", async () => {
        await testMultiEditor({
            peerIds: ["c1", "c2", "c3"],
            contentBefore: "<p><i>a[c1}{c1]</i><b>b[c2}{c2]</b></p>",
            afterCreate: (peerInfos) => {
                insert(peerInfos.c1.editor, "c");
                peerInfos.c2.collaborationPlugin.onExternalHistorySteps([
                    peerInfos.c1.historyPlugin.steps[1],
                ]);

                // Peer 3 connect firt to peer 1 that made a snapshot.

                peerInfos.c1.collaborationPlugin.makeSnapshot();
                // Fake the time of the snapshot so it is considered to be
                // older than 30 seconds.
                peerInfos.c1.collaborationPlugin.snapshots[0].time = 1;
                const { steps } = peerInfos.c1.collaborationPlugin.getSnapshotSteps();
                peerInfos.c3.collaborationPlugin.resetFromSteps(steps);

                // In the meantime peer 2 send the step to peer 1
                insert(peerInfos.c2.editor, "d");
                insert(peerInfos.c2.editor, "e");
                peerInfos.c1.collaborationPlugin.onExternalHistorySteps([
                    peerInfos.c2.historyPlugin.steps[2],
                ]);
                peerInfos.c1.collaborationPlugin.onExternalHistorySteps([
                    peerInfos.c2.historyPlugin.steps[3],
                ]);

                // Now peer 2 is connected to peer 3 and peer 2 make a new step.
                insert(peerInfos.c2.editor, "f");
                peerInfos.c1.collaborationPlugin.onExternalHistorySteps([
                    peerInfos.c2.historyPlugin.steps[4],
                ]);
                peerInfos.c3.collaborationPlugin.onExternalHistorySteps([
                    peerInfos.c2.historyPlugin.steps[4],
                ]);
            },
            contentAfter: "<p><i>ac[c1}{c1]</i><b>bdef[c2}{c2]</b></p>",
        });
    });
});
describe("sanitize", () => {
    test("should sanitize when adding a node", async () => {
        await testMultiEditor({
            peerIds: ["c1", "c2"],
            contentBefore: "<p><x>a</x></p>",
            afterCreate: (peerInfos) => {
                const script = document.createElement("script");
                script.innerHTML = 'console.log("xss")';
                peerInfos.c1.editor.editable.append(script);
                addStep(peerInfos.c1.editor);
                expect(peerInfos.c1.historyPlugin.steps[1]).not.toBe(undefined);
                peerInfos.c2.collaborationPlugin.onExternalHistorySteps([
                    peerInfos.c1.historyPlugin.steps[1],
                ]);
                expect(peerInfos.c2.editor.editable.innerHTML).toBe("<p><x>a</x></p>");
            },
        });
    });
    test("should sanitize when adding a script as descendant", async () => {
        await testMultiEditor({
            peerIds: ["c1", "c2"],
            contentBefore: "<p>a[c1}{c1][c2}{c2]</p>",
            afterCreate: (peerInfos) => {
                const document = peerInfos.c1.editor.document;
                const i = document.createElement("i");
                i.innerHTML = '<b>b</b><script>alert("c");</script>';
                peerInfos.c1.editor.editable.append(i);
                addStep(peerInfos.c1.editor);
                peerInfos.c2.collaborationPlugin.onExternalHistorySteps([
                    peerInfos.c1.historyPlugin.steps[1],
                ]);
            },
            afterCursorInserted: (peerInfos) => {
                expect(peerInfos.c2.editor.editable.innerHTML).toBe(
                    "<p>a[c1}{c1][c2}{c2]</p><i><b>b</b></i>"
                );
            },
        });
    });
    test("should sanitize when changing an attribute", async () => {
        await testMultiEditor({
            peerIds: ["c1", "c2"],
            contentBefore: "<p>a<img></p>",
            afterCreate: (peerInfos) => {
                const img = peerInfos.c1.editor.editable.childNodes[0].childNodes[1];
                img.setAttribute("class", "b");
                img.setAttribute("onerror", 'console.log("xss")');
                addStep(peerInfos.c1.editor);
                peerInfos.c2.collaborationPlugin.onExternalHistorySteps([
                    peerInfos.c1.historyPlugin.steps[1],
                ]);
                expect(peerInfos.c1.editor.editable.innerHTML).toBe(
                    '<p>a<img class="b" onerror="console.log(&quot;xss&quot;)"></p>'
                );
                expect(peerInfos.c2.editor.editable.innerHTML).toBe('<p>a<img class="b"></p>');
            },
        });
    });

    test("should sanitize when undo is adding a script node", async () => {
        await testMultiEditor({
            peerIds: ["c1", "c2"],
            contentBefore: "<p>a</p>",
            afterCreate: (peerInfos) => {
                const script = document.createElement("script");
                script.innerHTML = 'console.log("xss")';
                peerInfos.c1.editor.editable.append(script);
                addStep(peerInfos.c1.editor);
                script.remove();
                addStep(peerInfos.c1.editor);
                peerInfos.c2.collaborationPlugin.onExternalHistorySteps([
                    peerInfos.c1.historyPlugin.steps[1],
                ]);
                // Change the peer in order to be undone from peer 2
                peerInfos.c1.historyPlugin.steps[2].peerId = "c2";
                peerInfos.c2.collaborationPlugin.onExternalHistorySteps([
                    peerInfos.c1.historyPlugin.steps[2],
                ]);
                peerInfos.c2.editor.dispatch("HISTORY_UNDO");
                expect(peerInfos.c2.editor.editable.innerHTML).toBe("<p>a</p>");
            },
        });
    });
    test("should sanitize when undo is adding a descendant script node", async () => {
        await testMultiEditor({
            peerIds: ["c1", "c2"],
            contentBefore: "<p>a</p>",
            afterCreate: (peerInfos) => {
                const div = document.createElement("div");
                div.innerHTML = '<i>b</i><script>console.log("xss")</script>';
                peerInfos.c1.editor.editable.append(div);
                addStep(peerInfos.c1.editor);
                div.remove();
                addStep(peerInfos.c1.editor);
                peerInfos.c2.collaborationPlugin.onExternalHistorySteps([
                    peerInfos.c1.historyPlugin.steps[1],
                ]);
                // Change the peer in order to be undone from peer 2
                peerInfos.c1.historyPlugin.steps[2].peerId = "c2";
                peerInfos.c2.collaborationPlugin.onExternalHistorySteps([
                    peerInfos.c1.historyPlugin.steps[2],
                ]);
                peerInfos.c2.editor.dispatch("HISTORY_UNDO");
                expect(peerInfos.c2.editor.editable.innerHTML).toBe("<p>a</p><div><i>b</i></div>");
            },
        });
    });
    test("should sanitize when undo is changing an attribute", async () => {
        await testMultiEditor({
            peerIds: ["c1", "c2"],
            contentBefore: "<p>a<img></p>",
            afterCreate: (peerInfos) => {
                const img = peerInfos.c1.editor.editable.childNodes[0].childNodes[1];
                img.setAttribute("class", "b");
                img.setAttribute("onerror", 'console.log("xss")');
                addStep(peerInfos.c1.editor);
                img.setAttribute("class", "");
                img.setAttribute("onerror", "");
                addStep(peerInfos.c1.editor);
                peerInfos.c2.collaborationPlugin.onExternalHistorySteps([
                    peerInfos.c1.historyPlugin.steps[1],
                ]);
                // Change the peer in order to be undone from peer 2
                peerInfos.c1.historyPlugin.steps[2].peerId = "c2";
                peerInfos.c2.collaborationPlugin.onExternalHistorySteps([
                    peerInfos.c1.historyPlugin.steps[2],
                ]);
                peerInfos.c2.editor.dispatch("HISTORY_UNDO");
                expect(peerInfos.c2.editor.editable.innerHTML).toBe('<p>a<img class="b"></p>');
            },
        });
    });
    test("should not sanitize contenteditable attribute (check DOMPurify DEFAULT_ALLOWED_ATTR)", async () => {
        await testMultiEditor({
            peerIds: ["c1"],
            contentBefore: '<div class="remove-me" contenteditable="true">[c1}{c1]<br></div>',
            afterCreate: (peerInfos) => {
                const editor = peerInfos.c1.editor;
                const target = editor.editable.querySelector(".remove-me");
                target.classList.remove("remove-me");
                addStep(editor);
                editor.dispatch("HISTORY_UNDO");
                editor.dispatch("HISTORY_REDO");
            },
            contentAfter: '<div contenteditable="true">[c1}{c1]<br></div>',
        });
    });
});
describe("data-oe-protected", () => {
    test("should not share protected mutations and share unprotected ones", async () => {
        await testMultiEditor({
            peerIds: ["c1", "c2"],
            contentBefore: "<p>[c1}{c1][c2}{c2]</p>",
            afterCreate: (peerInfos) => {
                peerInfos.c1.editor.editable.prepend(
                    ...parseHTML(
                        peerInfos.c1.editor.document,
                        unformat(`
                        <div data-oe-protected="true">
                            <p id="true"><br></p>
                            <div data-oe-protected="false">
                                <p id="false"><br></p>
                            </div>
                        </div>
                    `)
                    ).children
                );
                addStep(peerInfos.c1.editor);
                const pTrue = peerInfos.c1.editor.editable.querySelector("#true");
                peerInfos.c1.editor.shared.setSelection({
                    anchorNode: pTrue,
                    anchorOffset: 0,
                });
                pTrue.prepend(peerInfos.c1.editor.document.createTextNode("a"));
                addStep(peerInfos.c1.editor);
                const pFalse = peerInfos.c1.editor.editable.querySelector("#false");
                peerInfos.c1.editor.shared.setSelection({
                    anchorNode: pFalse,
                    anchorOffset: 0,
                });
                insert(peerInfos.c1.editor, "a");
                peerInfos.c2.collaborationPlugin.onExternalHistorySteps(
                    peerInfos.c1.historyPlugin.steps
                );
                testSameHistory(peerInfos);
            },
            afterCursorInserted: (peerInfos) => {
                expect(peerInfos.c1.editor.editable.innerHTML).toBe(
                    unformat(`
                        <div data-oe-protected="true">
                            <p id="true">a<br></p>
                            <div data-oe-protected="false">
                                <p id="false">a[c1}{c1]<br></p>
                            </div>
                        </div>
                        <p>[c2}{c2]</p>
                    `)
                );
                expect(peerInfos.c2.editor.editable.innerHTML).toBe(
                    unformat(`
                        <div data-oe-protected="true">
                            <p id="true"><br></p>
                            <div data-oe-protected="false">
                                <p id="false">a[c1}{c1]<br></p>
                            </div>
                        </div>
                        <p>[c2}{c2]</p>
                    `)
                );
            },
        });
    });
});
describe("data-oe-transient-content", () => {
    test("should send an empty transient-content element", async () => {
        await testMultiEditor({
            peerIds: ["c1", "c2"],
            contentBefore: "<p>[c1}{c1][c2}{c2]</p>",
            afterCreate: (peerInfos) => {
                peerInfos.c1.editor.editable.prepend(
                    ...parseHTML(
                        peerInfos.c1.editor.document,
                        unformat(`
                        <div data-oe-transient-content="true">
                            <p>secret</p>
                        </div>
                    `)
                    ).children
                );
                addStep(peerInfos.c1.editor);
                peerInfos.c2.collaborationPlugin.onExternalHistorySteps(
                    peerInfos.c1.historyPlugin.steps
                );
                testSameHistory(peerInfos);
            },
            afterCursorInserted: (peerInfos) => {
                expect(peerInfos.c1.editor.editable.innerHTML).toBe(
                    unformat(`
                        <div data-oe-transient-content="true">
                            <p>secret</p>
                        </div>
                        <p>[c1}{c1][c2}{c2]</p>
                    `)
                );
                expect(peerInfos.c2.editor.editable.innerHTML).toBe(
                    unformat(`
                        <div data-oe-transient-content="true"></div>
                        <p>[c1}{c1][c2}{c2]</p>
                    `)
                );
            },
        });
    });
});
describe("post process external steps", () => {
    test("should properly await a processing promise before accepting new external steps.", async () => {
        const deferredPromise = new Deferred();
        const postProcessExternalSteps = (element) => {
            if (element.querySelector(".process")) {
                setTimeout(() => {
                    deferredPromise.resolve();
                });
                return deferredPromise;
            }
            return null;
        };
        class ConfigPlugin extends Plugin {
            static name = "collab-test-config";
            static resources = () => ({
                post_process_external_steps: postProcessExternalSteps,
            });
        }
        await testMultiEditor({
            Plugins: [ConfigPlugin],
            peerIds: ["c1", "c2"],
            contentBefore: "<p>a[c1}{c1][c2}{c2]</p>",
            afterCreate: async (peerInfos) => {
                peerInfos.c1.editor.editable.append(
                    ...parseHTML(
                        peerInfos.c1.editor.document,
                        unformat(`
                        <div class="process">
                            <p>secret</p>
                        </div>
                    `)
                    ).children
                );
                addStep(peerInfos.c1.editor);
                peerInfos.c1.editor.editable.append(
                    ...parseHTML(
                        peerInfos.c1.editor.document,
                        unformat(`
                        <p>post-process</p>
                    `)
                    ).children
                );
                addStep(peerInfos.c1.editor);
                peerInfos.c2.collaborationPlugin.onExternalHistorySteps(
                    peerInfos.c1.historyPlugin.steps
                );
                expect(peerInfos.c1.editor.editable.innerHTML).toBe(
                    unformat(`
                        <p>a</p>
                        <div class="process">
                            <p>secret</p>
                        </div>
                        <p>post-process</p>
                    `)
                );
                expect(peerInfos.c2.editor.editable.innerHTML).toBe(
                    unformat(`
                        <p>a</p>
                        <div class="process">
                            <p>secret</p>
                        </div>
                    `)
                );
                await peerInfos.c2.collaborationPlugin.postProcessExternalStepsPromise;
                expect(peerInfos.c2.editor.editable.innerHTML).toBe(
                    unformat(`
                        <p>a</p>
                        <div class="process">
                            <p>secret</p>
                        </div>
                        <p>post-process</p>
                    `)
                );
                testSameHistory(peerInfos);
            },
        });
    });
});
