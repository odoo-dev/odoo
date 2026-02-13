import { removeClass } from "@html_editor/utils/dom";

function processThrough(editor, resourceId, item, ...args) {
    editor.getResource(resourceId).forEach((processor) => {
        item = processor(item, ...args) || item;
    });
    return item;
}

export function processThroughNormalize(editor) {
    processThrough(editor, "normalize_processors", editor.editable);
}

export function cleanHints(editor) {
    for (const element of editor.editable.querySelectorAll(".o-we-hint")) {
        removeClass(element, "o-we-hint");
        element.removeAttribute("o-we-hint-text");
    }
}

export function processThroughCleanForSave(editor, payload) {
    processThrough(editor, "clean_for_save_processors", payload);
}
