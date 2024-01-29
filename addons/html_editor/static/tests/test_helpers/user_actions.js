/** @odoo-module */

import { dispatch } from "@odoo/hoot-dom";
import { setSelection } from "./selection";
import { childNodeIndex } from "@html_editor/editor/utils/position";

export async function insertText(editor, text) {
    // Create and dispatch events to mock text insertion. Unfortunatly, the
    // events will be flagged `isTrusted: false` by the browser, requiring
    // the editor to detect them since they would not trigger the default
    // browser behavior otherwise.
    const sel = window.getSelection();
    let range = sel.getRangeAt(0);
    if (!range.collapsed) {
        throw new Error("need to implement something... maybe");
    }
    if (range.startContainer.nodeType !== Node.TEXT_NODE) {
        const txt = document.createTextNode("");
        range.startContainer.appendChild(txt);
        range.insertNode(txt);
        setSelection({ anchorNode: txt, anchorOffset: 0, focusNode: txt, focusOffset: 0 });
        range = sel.getRangeAt(0);
    }
    const node = range.startContainer;
    let offset = range.startOffset;
    const insertChar = (char) => {
        node.textContent =
            node.textContent.slice(0, offset) + char + node.textContent.slice(offset);
        offset++;
        range.setStart(node, offset);
        range.setEnd(node, offset);
    };
    for (const char of text) {
        // KeyDownEvent is required to trigger deleteRange.
        dispatch(editor.editable, "keydown", { key: char });
        // KeyPressEvent is not required but is triggered like in the browser.
        dispatch(editor.editable, "keypress", { key: char });
        // InputEvent is required to simulate the insert text.
        insertChar(char);
        dispatch(editor.editable, "input", {
            inputType: "insertText",
            data: char,
        });
        // KeyUpEvent is not required but is triggered like the browser would.
        dispatch(editor.editable, "keyup", { key: char });
    }
}

export async function deleteForward(editor) {
    editor.dispatch("DELETE_FORWARD");
}

export async function deleteBackward(editor, isMobileTest = false) {
    // TODO phoenix: find a strategy for test mobile and desktop. (check legacy code)

    editor.dispatch("DELETE_BACKWARD");
}

// history
export function undo(editor) {
    throw new Error("Not implemented command to replace historyUndo");
}

export function redo(editor) {
    throw new Error("Not implemented command to replace historyRedo");
}

export function click(el, options) {
    throw new Error("need a proper implementation");
}

// list
export function toggleOrderedList(editor) {
    editor.dispatch("TOGGLE_LIST", { type: "OL" });
}

export function toggleUnorderedList(editor) {
    editor.dispatch("TOGGLE_LIST", { type: "UL" });
}

export function toggleCheckList(editor) {
    editor.dispatch("TOGGLE_LIST", { type: "CL" });
}

export function insertLineBreak(editor) {
    editor.dispatch("INSERT_LINEBREAK");
}

// Format commands
export function bold(editor) {
    editor.dispatch("FORMAT_BOLD");
}

export function italic(editor) {
    editor.dispatch("FORMAT_ITALIC");
}

export function underline(editor) {
    editor.dispatch("FORMAT_UNDERLINE");
}

export function strikeThrough(editor) {
    editor.dispatch("FORMAT_STRIKETHROUGH");
}

export function setFontSize(size) {
    return (editor) => editor.dispatch("FORMAT_FONT_SIZE", size);
}

export function switchDirection(editor) {
    console.log("should dispatch FORMAT_SWITCH_DIRECTION");
    //editor.execCommand('switchDirection')}
}

export async function insertParagraphBreak(editor) {
    editor.dispatch("SPLIT_BLOCK");
}

// TODO @phoenix: we should maybe use it in each test ???
// Simulates placing the cursor at the editable root after an arrow key press
export async function simulateArrowKeyPress(editor, key) {
    const selection = editor.document.getSelection();
    const node = selection.anchorNode;
    let editableChild = node;
    while (editableChild.parentNode !== editor.editable) {
        editableChild = editableChild.parentNode;
    }
    const index =
        key === "ArrowRight" ? childNodeIndex(editableChild) + 1 : childNodeIndex(editableChild);
    const pos = [editor.editable, index];
    dispatch(editor.editable, "keydown", { key });
    selection.setBaseAndExtent(...pos, ...pos);
    // TODO @phoenix to check if we need the nextTick
    // await nextTick();
}

// Simulates placing the cursor at the editable root after a mouse click.
export async function simulateMouseClick(editor, node, after = false) {
    let editableChild = node;
    while (editableChild.parentNode !== editor.editable) {
        editableChild = editableChild.parentNode;
    }
    const index = after ? childNodeIndex(editableChild) + 1 : childNodeIndex(editableChild);
    const pos = [editor.editable, index];
    dispatch(editor.editable, "mousedown");
    const selection = editor.document.getSelection();
    selection.setBaseAndExtent(...pos, ...pos);

    //TODO @phoenix check if this is still needed nextTick
    // await nextTick();
    dispatch(editor.editable, "mouseup");
    dispatch(editor.editable, "click");
}

export function unlink(editor) {
    throw new Error("Not implemented command to replace unlink");
    // editor.dispatch('unlink');
}

export function keydownTab(editor) {
    dispatch(editor.editable, "keydown", { key: "Tab" });
}

export function indentList(editor) {
    editor.dispatch("INDENT_LIST");
}

export function outdentList(editor) {
    editor.dispatch("OUTDENT_LIST");
}

export function keydownShiftTab(editor) {
    dispatch(editor.editable, "keydown", { key: "Tab", shiftKey: true });
}

export function applyColor(color, mode, element) {
    throw new Error("applyColor Not implemented");
    // return (editor) => editor.dispatch("APPLY_COLOR", color, mode, element);
}

export function resetSize(editor) {
    throw new Error("applyColor Not implemented");
    // return editor.execCommand("RESET_SIZE");
}

export function justifyLeft(editor) {
    throw new Error("Not implemented command: justifyLeft");
    // editor.dispatch('xxx');
}

export function justifyCenter(editor) {
    throw new Error("Not implemented command: justifyCenter");
    // editor.dispatch('xxx');
}

export function justifyRight(editor) {
    throw new Error("Not implemented command: justifyRight");
    // editor.dispatch('xxx');
}

export function justifyFull(editor) {
    throw new Error("Not implemented command: justifyFull");
    // editor.dispatch('xxx');
}

export function setColor(color, mode) {
    return async (editor) => {
        editor.dispatch("APPLY_COLOR", { color, mode });
    };
}

// Mock an paste event and send it to the editor.
export async function pasteData(editor, text, type) {
    const mockEvent = {
        dataType: "text/plain",
        data: text,
        clipboardData: {
            getData: (datatype) => (type === datatype ? text : null),
            files: [],
            items: [],
        },
        preventDefault: () => {},
    };
    // TODO @phoenix need to replace _onPaste.
    await editor._onPaste(mockEvent);
}

export function pasteText(editor, text) {
    return pasteData(editor, text, "text/plain");
}

export function pasteHtml(editor, html) {
    return pasteData(editor, html, "text/html");
}

export function pasteOdooEditorHtml(editor, html) {
    return pasteData(editor, html, "text/odoo-editor");
}
