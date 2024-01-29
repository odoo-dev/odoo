/** @odoo-module */
import { expect } from "@odoo/hoot";

export const TAB_WIDTH = 40;

let charWidths = undefined;

// Callback for "before"
function setCharWidths() {
    // charWidths is a global variable that needs to be set only once.
    if (charWidths) {
        return;
    }
    charWidths = {};

    const rootDiv = document.createElement("div");
    rootDiv.classList.add("odoo-editor-editable");
    rootDiv.contentEditable = true;
    document.body.append(rootDiv);

    const range = new Range();
    const tags = ["p", "h1", "blockquote"];
    const letters = ["a", "b", "c", "d", "e"];
    for (const tag of tags) {
        const element = document.createElement(tag);
        rootDiv.append(element);
        charWidths[tag] = {};
        for (const letter of letters) {
            element.textContent = letter;
            range.selectNodeContents(element);
            const width = range.getBoundingClientRect().width;
            charWidths[tag][letter] = width.toFixed(1);
        }
    }
    rootDiv.remove();
}

export function getCharWidth(tag, letter) {
    if (!charWidths) {
        setCharWidths();
    }
    return charWidths[tag][letter];
}

export function oeTab(size, contenteditable = true) {
    return (
        `<span class="oe-tabs"` +
        (contenteditable ? "" : ' contenteditable="false"') +
        (size ? ` style="width: ${size}px;"` : "") +
        `>\u0009</span>\u200B`
    );
}

/**
 * Extracts the style.width values from the given content and replaces them with a placeholder.
 * @param {string} content
 * @returns {Object} - { text: string, widths: number[] }
 */
function extractWidth(content) {
    const regex = /width: ([\d.]+)px;/g;
    const widths = [];
    const text = content.replaceAll(regex, (_, w) => {
        widths.push(parseFloat(w));
        return `width: _px;`;
    });
    return { text, widths };
}

/**
 * Compares the two contents with hoot expect.
 * Style.width values are allowed to differ by a margin of tolerance.
 *
 * @param {string} contentEl
 * @param {string} contentSpec
 * @param {"contentAfterEdit"|"contentAfter"} mode
 */
export function compare(contentEl, contentSpec, mode) {
    const maxDiff = 0.5;
    const { text: receivedContent, widths: receivedWidths } = extractWidth(contentEl);
    const { text: expectedContent, widths: expectedWidths } = extractWidth(contentSpec);

    expect(receivedContent).toBe(expectedContent, {
        message: `(testEditor) ${mode} is strictly equal to %actual%`,
    });

    const diffs = expectedWidths.map((width, i) => Math.abs(width - receivedWidths[i]));
    expect(Math.max(...diffs)).toBeLessThan(maxDiff, {
        message:
            `(testEditor) (${mode}) tab widths differ by less than ${maxDiff} pixel\n` +
            diffs
                .map(
                    (diff, i) =>
                        `tab[${i}] ` +
                        `received: ${receivedWidths[i]}, ` +
                        `expected: ${expectedWidths[i]}, ` +
                        `diff: ${diff}`
                )
                .join("\n"),
    });
}
