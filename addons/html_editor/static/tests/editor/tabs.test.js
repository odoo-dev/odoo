/** @odoo-module */

import { test, describe, getFixture, expect, before } from "@odoo/hoot";
import { testEditor, setupEditor } from "../test_helpers/editor";
import { dispatch } from "@odoo/hoot-dom";
import { getContent } from "../test_helpers/selection";
import { deleteBackward, deleteForward, insertText } from "../test_helpers/user_actions";

const TAB_WIDTH = 40;
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
    getFixture().append(rootDiv);

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

function oeTab(size, contenteditable = true) {
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
function compare(contentEl, contentSpec, mode) {
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

async function testTabulation({ contentBefore, stepFunction, contentAfterEdit, contentAfter }) {
    const { el, editor } = await setupEditor(contentBefore);

    await stepFunction(editor);

    if (contentAfterEdit) {
        compare(getContent(el), contentAfterEdit, "contentAfterEdit");
    }
    editor.dispatch("CLEAN", el);
    if (contentAfter) {
        compare(getContent(el), contentAfter, "contentAfter");
    }
}

function keydownTab(editor) {
    return dispatch(editor.editable, "keydown", { key: "Tab" });
}

function keydownShiftTab(editor) {
    return dispatch(editor.editable, "keydown", { key: "Tab", shiftKey: true });
}

describe("insert tabulation", () => {
    before(setCharWidths);

    test("should insert a tab character", async () => {
        const expectedTabWidth = TAB_WIDTH - charWidths.p.a;
        await testTabulation({
            contentBefore: `<p>a[]b</p>`,
            stepFunction: keydownTab,
            contentAfterEdit: `<p>a${oeTab(expectedTabWidth, false)}[]b</p>`,
            contentAfter: `<p>a${oeTab(expectedTabWidth)}[]b</p>`,
        });
    });

    test("should keep selection and insert a tab character at the beginning of the paragraph", async () => {
        await testEditor({
            contentBefore: `<p>a[xxx]b</p>`,
            stepFunction: keydownTab,
            contentAfterEdit: `<p>${oeTab(TAB_WIDTH, false)}a[xxx]b</p>`,
            contentAfter: `<p>${oeTab(TAB_WIDTH)}a[xxx]b</p>`,
        });
    });

    test("should insert two tab characters", async () => {
        const expectedTabWidth = TAB_WIDTH - charWidths.p.a;
        await testTabulation({
            contentBefore: `<p>a[]b</p>`,
            stepFunction: async (editor) => {
                keydownTab(editor);
                keydownTab(editor);
            },
            contentAfterEdit: `<p>a${oeTab(expectedTabWidth, false)}${oeTab(
                TAB_WIDTH,
                false
            )}[]b</p>`,
            contentAfter: `<p>a${oeTab(expectedTabWidth)}${oeTab(TAB_WIDTH)}[]b</p>`,
        });
    });

    test("should insert two tab characters with one char between them", async () => {
        const expectedTabWidth = TAB_WIDTH - charWidths.p.a;
        await testTabulation({
            contentBefore: `<p>a[]b</p>`,
            stepFunction: async (editor) => {
                keydownTab(editor);
                insertText(editor, "a");
                keydownTab(editor);
            },
            contentAfterEdit: `<p>a${oeTab(expectedTabWidth, false)}a${oeTab(
                expectedTabWidth,
                false
            )}[]b</p>`,
            contentAfter: `<p>a${oeTab(expectedTabWidth)}a${oeTab(expectedTabWidth)}[]b</p>`,
        });
    });

    test("should insert tab characters at the beginning of two separate paragraphs", async () => {
        await testEditor({
            contentBefore: `<p>a[b</p>` + `<p>c]d</p>`,
            stepFunction: keydownTab,
            contentAfterEdit:
                `<p>${oeTab(TAB_WIDTH, false)}a[b</p>` + `<p>${oeTab(TAB_WIDTH, false)}c]d</p>`,
            contentAfter: `<p>${oeTab(TAB_WIDTH)}a[b</p>` + `<p>${oeTab(TAB_WIDTH)}c]d</p>`,
        });
    });

    test("should insert tab characters at the beginning of two separate indented paragraphs", async () => {
        await testEditor({
            contentBefore: `<p>${oeTab()}a[b</p>` + `<p>${oeTab()}c]d</p>`,
            // @todo: add contentBeforeEdit in some test cases to test the addition
            // of the contenteditable="false" attribute by setup.
            stepFunction: keydownTab,
            contentAfterEdit:
                `<p>${oeTab(TAB_WIDTH, false)}${oeTab(TAB_WIDTH, false)}a[b</p>` +
                `<p>${oeTab(TAB_WIDTH, false)}${oeTab(TAB_WIDTH, false)}c]d</p>`,
            contentAfter:
                `<p>${oeTab(TAB_WIDTH)}${oeTab(TAB_WIDTH)}a[b</p>` +
                `<p>${oeTab(TAB_WIDTH)}${oeTab(TAB_WIDTH)}c]d</p>`,
        });
    });

    test("should insert tab characters at the beginning of two separate paragraphs (one indented, the other not)", async () => {
        await testEditor({
            contentBefore: `<p>${oeTab()}a[b</p>` + `<p>c]d</p>`,
            stepFunction: (editor) => dispatch(editor.editable, "keydown", { key: "Tab" }),
            contentAfterEdit:
                `<p>${oeTab(TAB_WIDTH, false)}${oeTab(TAB_WIDTH, false)}a[b</p>` +
                `<p>${oeTab(TAB_WIDTH, false)}c]d</p>`,
            contentAfter:
                `<p>${oeTab(TAB_WIDTH)}${oeTab(TAB_WIDTH)}a[b</p>` +
                `<p>${oeTab(TAB_WIDTH)}c]d</p>`,
        });
        await testEditor({
            contentBefore: `<p>a[b</p>` + `<p>${oeTab()}c]d</p>`,
            stepFunction: (editor) => dispatch(editor.editable, "keydown", { key: "Tab" }),
            contentAfterEdit:
                `<p>${oeTab(TAB_WIDTH, false)}a[b</p>` +
                `<p>${oeTab(TAB_WIDTH, false)}${oeTab(TAB_WIDTH, false)}c]d</p>`,
            contentAfter:
                `<p>${oeTab(TAB_WIDTH)}a[b</p>` +
                `<p>${oeTab(TAB_WIDTH)}${oeTab(TAB_WIDTH)}c]d</p>`,
        });
    });

    test("should insert tab characters at the beginning of two separate paragraphs with tabs in them", async () => {
        const tabAfterA = TAB_WIDTH - charWidths.p.a;
        const tabAfterB = TAB_WIDTH - charWidths.p.b;
        const tabAfterC = TAB_WIDTH - charWidths.p.c;
        const tabAfterD = TAB_WIDTH - charWidths.p.d;
        await testTabulation({
            contentBefore:
                `<p>${oeTab()}a[${oeTab()}b${oeTab()}</p>` + `<p>c${oeTab()}]d${oeTab()}</p>`,
            stepFunction: (editor) => dispatch(editor.editable, "keydown", { key: "Tab" }),
            contentAfter:
                `<p>${oeTab(TAB_WIDTH)}${oeTab(TAB_WIDTH)}a[${oeTab(tabAfterA)}b${oeTab(
                    tabAfterB
                )}</p>` + `<p>${oeTab(TAB_WIDTH)}c${oeTab(tabAfterC)}]d${oeTab(tabAfterD)}</p>`,
        });
    });

    test.todo(
        "should insert tab characters at the beginning of three separate blocks",
        async () => {
            await testEditor({
                contentBefore:
                    `<p>xxx</p>` +
                    `<p>a[b</p>` +
                    `<h1>cd</h1>` +
                    `<blockquote>e]f</blockquote>` +
                    `<h4>zzz</h4>`,
                stepFunction: (editor) => dispatch(editor.editable, "keydown", { key: "Tab" }),
                contentAfterEdit:
                    `<p>xxx</p>` +
                    `<p>${oeTab(TAB_WIDTH, false)}a[b</p>` +
                    `<h1>${oeTab(TAB_WIDTH, false)}cd</h1>` +
                    `<blockquote>${oeTab(TAB_WIDTH, false)}e]f</blockquote>` +
                    `<h4>zzz</h4>`,
                contentAfter:
                    `<p>xxx</p>` +
                    `<p>${oeTab(TAB_WIDTH)}a[b</p>` +
                    `<h1>${oeTab(TAB_WIDTH)}cd</h1>` +
                    `<blockquote>${oeTab(TAB_WIDTH)}e]f</blockquote>` +
                    `<h4>zzz</h4>`,
            });
        }
    );

    test.todo(
        "should insert tab characters at the beginning of three separate indented blocks",
        async () => {
            await testEditor({
                contentBefore:
                    `<p>${oeTab()}xxx</p>` +
                    `<p>${oeTab()}a[b</p>` +
                    `<h1>${oeTab()}cd</h1>` +
                    `<blockquote>${oeTab()}e]f</blockquote>` +
                    `<h4>${oeTab()}zzz</h4>`,
                stepFunction: (editor) => dispatch(editor.editable, "keydown", { key: "Tab" }),
                contentAfterEdit:
                    `<p>${oeTab(TAB_WIDTH, false)}xxx</p>` +
                    `<p>${oeTab(TAB_WIDTH, false)}${oeTab(TAB_WIDTH, false)}a[b</p>` +
                    `<h1>${oeTab(TAB_WIDTH, false)}${oeTab(TAB_WIDTH, false)}cd</h1>` +
                    `<blockquote>${oeTab(TAB_WIDTH, false)}${oeTab(
                        TAB_WIDTH,
                        false
                    )}e]f</blockquote>` +
                    `<h4>${oeTab(TAB_WIDTH, false)}zzz</h4>`,
                contentAfter:
                    `<p>${oeTab(TAB_WIDTH)}xxx</p>` +
                    `<p>${oeTab(TAB_WIDTH)}${oeTab(TAB_WIDTH)}a[b</p>` +
                    `<h1>${oeTab(TAB_WIDTH)}${oeTab(TAB_WIDTH)}cd</h1>` +
                    `<blockquote>${oeTab(TAB_WIDTH)}${oeTab(TAB_WIDTH)}e]f</blockquote>` +
                    `<h4>${oeTab(TAB_WIDTH)}zzz</h4>`,
            });
        }
    );

    test.todo(
        "should insert tab characters at the beginning of three separate blocks of mixed indentation",
        async () => {
            await testEditor({
                contentBefore:
                    `<p>xxx</p>` +
                    `<p>${oeTab()}${oeTab()}a[b</p>` +
                    `<h1>${oeTab()}cd</h1>` +
                    `<blockquote>e]f</blockquote>` +
                    `<h4>zzz</h4>`,
                stepFunction: (editor) => dispatch(editor.editable, "keydown", { key: "Tab" }),
                contentAfterEdit:
                    `<p>xxx</p>` +
                    `<p>${oeTab(TAB_WIDTH, false)}${oeTab(TAB_WIDTH, false)}${oeTab(
                        TAB_WIDTH,
                        false
                    )}a[b</p>` +
                    `<h1>${oeTab(TAB_WIDTH, false)}${oeTab(TAB_WIDTH, false)}cd</h1>` +
                    `<blockquote>${oeTab(TAB_WIDTH, false)}e]f</blockquote>` +
                    `<h4>zzz</h4>`,
                contentAfter:
                    `<p>xxx</p>` +
                    `<p>${oeTab(TAB_WIDTH)}${oeTab(TAB_WIDTH)}${oeTab(TAB_WIDTH)}a[b</p>` +
                    `<h1>${oeTab(TAB_WIDTH)}${oeTab(TAB_WIDTH)}cd</h1>` +
                    `<blockquote>${oeTab(TAB_WIDTH)}e]f</blockquote>` +
                    `<h4>zzz</h4>`,
            });
        }
    );

    test.todo(
        "should insert tab characters at the beginning of three separate blocks with tabs in them",
        async () => {
            const tabAfterA = TAB_WIDTH - charWidths.p.a;
            const tabAfterB = TAB_WIDTH - charWidths.p.b;
            const tabAfterCinH1 = TAB_WIDTH - charWidths.h1.c;
            const tabAfterDinH1 = TAB_WIDTH - charWidths.h1.d;
            // @todo: account for the blockquote border + padding
            const tabAfterEinBlockquote = TAB_WIDTH - charWidths.blockquote.e;

            await testTabulation({
                contentBefore:
                    `<p>xxx</p>` +
                    `<p>${oeTab()}a[${oeTab()}b${oeTab()}</p>` +
                    `<h1>c${oeTab()}d${oeTab()}</h1>` +
                    `<blockquote>e${oeTab()}]f</blockquote>` +
                    `<h4>zzz</h4>`,
                stepFunction: (editor) => dispatch(editor.editable, "keydown", { key: "Tab" }),
                contentAfterEdit:
                    `<p>xxx</p>` +
                    `<p>${oeTab(TAB_WIDTH, false)}${oeTab(TAB_WIDTH, false)}a[${oeTab(
                        tabAfterA,
                        false
                    )}b${oeTab(tabAfterB, false)}</p>` +
                    `<h1>${oeTab(TAB_WIDTH, false)}c${oeTab(tabAfterCinH1, false)}d${oeTab(
                        tabAfterDinH1,
                        false
                    )}</h1>` +
                    `<blockquote>${oeTab(TAB_WIDTH, false)}e${oeTab(
                        tabAfterEinBlockquote,
                        false
                    )}]f</blockquote>` +
                    `<h4>zzz</h4>`,
                contentAfter:
                    `<p>xxx</p>` +
                    `<p>${oeTab(TAB_WIDTH)}${oeTab(TAB_WIDTH)}a[${oeTab(tabAfterA)}b${oeTab(
                        tabAfterB
                    )}</p>` +
                    `<h1>${oeTab(TAB_WIDTH)}c${oeTab(tabAfterCinH1)}d${oeTab(tabAfterDinH1)}</h1>` +
                    `<blockquote>${oeTab(TAB_WIDTH)}e${oeTab(
                        tabAfterEinBlockquote
                    )}]f</blockquote>` +
                    `<h4>zzz</h4>`,
            });
        }
    );

    test.todo("should insert tab characters in blocks and indent lists", async () => {
        await testEditor({
            contentBefore:
                `<p>${oeTab()}a[${oeTab()}b${oeTab()}</p>` +
                `<ul>` +
                `<li>c${oeTab()}d${oeTab()}</li>` +
                `<li class="oe-nested"><ul><li>${oeTab()}e${oeTab()}</li></ul></li>` +
                `</ul>` +
                `<blockquote>f${oeTab()}]g</blockquote>`,
            stepFunction: (editor) => dispatch(editor.editable, "keydown", { key: "Tab" }),
            contentAfterEdit:
                `<p>${oeTab(TAB_WIDTH, false)}${oeTab(TAB_WIDTH, false)}a[${oeTab(
                    32.8906,
                    false
                )}b${oeTab(32, false)}</p>` +
                `<ul>` +
                `<li class="oe-nested"><ul><li>c${oeTab(32.8906, false)}d${oeTab(32, false)}</li>` +
                `<li class="oe-nested"><ul><li>${oeTab(TAB_WIDTH, false)}e${oeTab(
                    32.8906,
                    false
                )}</li></ul></li></ul></li>` +
                `</ul>` +
                `<blockquote>${oeTab(TAB_WIDTH, false)}f${oeTab(34.6719, false)}]g</blockquote>`,
            contentAfter:
                `<p>${oeTab(TAB_WIDTH)}${oeTab(TAB_WIDTH)}a[${oeTab(32.8906)}b${oeTab(32)}</p>` +
                `<ul>` +
                `<li class="oe-nested"><ul><li>c${oeTab(32.8906)}d${oeTab(32)}</li>` +
                `<li class="oe-nested"><ul><li>${oeTab(TAB_WIDTH)}e${oeTab(
                    32.8906
                )}</li></ul></li></ul></li>` +
                `</ul>` +
                `<blockquote>${oeTab(TAB_WIDTH)}f${oeTab(34.6719)}]g</blockquote>`,
        });
    });
});

describe("delete backward tabulation", () => {
    before(setCharWidths);

    test("should remove one tab character", async () => {
        const tabAfterA = TAB_WIDTH - charWidths.p.a;
        await testEditor({
            contentBefore: `<p>a${oeTab(tabAfterA)}[]b</p>`,
            stepFunction: async (editor) => {
                await deleteBackward(editor);
            },
            contentAfter: `<p>a[]b</p>`,
        });
        await testEditor({
            contentBefore: `<p>a${oeTab(tabAfterA)}[]${oeTab()}b</p>`,
            stepFunction: async (editor) => {
                await deleteBackward(editor);
            },
            contentAfter: `<p>a[]${oeTab(tabAfterA)}b</p>`,
        });
    });

    test.todo("should remove two tab characters", async () => {
        const tabAfterA = TAB_WIDTH - charWidths.p.a;
        await testEditor({
            contentBefore: `<p>a${oeTab(tabAfterA)}${oeTab()}[]b</p>`,
            stepFunction: async (editor) => {
                await deleteBackward(editor);
                await deleteBackward(editor);
            },
            contentAfter: `<p>a[]b</p>`,
        });
        await testEditor({
            contentBefore: `<p>a${oeTab(tabAfterA)}${oeTab()}[]${oeTab()}b</p>`,
            stepFunction: async (editor) => {
                await deleteBackward(editor);
                await deleteBackward(editor);
            },
            contentAfter: `<p>a[]${oeTab(tabAfterA)}b</p>`,
        });
    });

    test("should remove three tab characters", async () => {
        await testEditor({
            contentBefore: `<p>a${oeTab()}${oeTab()}${oeTab()}[]b</p>`,
            stepFunction: async (editor) => {
                await deleteBackward(editor);
                await deleteBackward(editor);
                await deleteBackward(editor);
            },
            contentAfter: `<p>a[]b</p>`,
        });
    });
});

describe("delete forward tabulation", () => {
    before(setCharWidths);

    test("should remove one tab character", async () => {
        const tabAfterA = TAB_WIDTH - charWidths.p.a;
        await testTabulation({
            contentBefore: `<p>a[]${oeTab(tabAfterA)}b1</p>`,
            stepFunction: async (editor) => {
                await deleteForward(editor);
            },
            contentAfter: `<p>a[]b1</p>`,
        });
        await testTabulation({
            contentBefore: `<p>a${oeTab(tabAfterA)}[]${oeTab()}b2</p>`,
            stepFunction: async (editor) => {
                await deleteForward(editor);
            },
            contentAfter: `<p>a${oeTab(tabAfterA)}[]b2</p>`,
        });
        await testTabulation({
            contentBefore: `<p>a[]${oeTab(tabAfterA)}${oeTab()}b3</p>`,
            stepFunction: async (editor) => {
                await deleteForward(editor);
            },
            contentAfter: `<p>a[]${oeTab(tabAfterA)}b3</p>`,
        });
    });

    test("should remove two tab characters", async () => {
        const tabAfterA = TAB_WIDTH - charWidths.p.a;
        await testEditor({
            contentBefore: `<p>a[]${oeTab(tabAfterA)}${oeTab()}b1</p>`,
            stepFunction: async (editor) => {
                await deleteForward(editor);
                await deleteForward(editor);
            },
            contentAfter: `<p>a[]b1</p>`,
        });
        await testEditor({
            contentBefore: `<p>a[]${oeTab(tabAfterA)}${oeTab()}${oeTab()}b2</p>`,
            stepFunction: async (editor) => {
                await deleteForward(editor);
                await deleteForward(editor);
            },
            contentAfter: `<p>a[]${oeTab(tabAfterA)}b2</p>`,
        });
        await testEditor({
            contentBefore: `<p>a${oeTab(tabAfterA)}[]${oeTab()}${oeTab()}b3</p>`,
            stepFunction: async (editor) => {
                await deleteForward(editor);
                await deleteForward(editor);
            },
            contentAfter: `<p>a${oeTab(tabAfterA)}[]b3</p>`,
        });
    });

    test("should remove three tab characters", async () => {
        await testEditor({
            contentBefore: `<p>a[]${oeTab()}${oeTab()}${oeTab()}b</p>`,
            stepFunction: async (editor) => {
                await deleteForward(editor);
                await deleteForward(editor);
                await deleteForward(editor);
            },
            contentAfter: `<p>a[]b</p>`,
        });
    });
});

describe("delete mixed tabulation", () => {
    before(setCharWidths);

    test.todo("should remove all tab characters", async () => {
        const tabAfterA = TAB_WIDTH - charWidths.p.a;
        await testEditor({
            contentBefore: `<p>a${oeTab(tabAfterA)}[]${oeTab()}b1</p>`,
            stepFunction: async (editor) => {
                await deleteForward(editor);
                await deleteBackward(editor);
            },
            contentAfter: `<p>a[]b1</p>`,
        });
        await testEditor({
            contentBefore: `<p>a${oeTab(tabAfterA)}[]${oeTab()}b2</p>`,
            stepFunction: async (editor) => {
                await deleteBackward(editor);
                await deleteForward(editor);
            },
            contentAfter: `<p>a[]b2</p>`,
        });
        await testEditor({
            contentBefore: `<p>a${oeTab(tabAfterA)}${oeTab()}[]${oeTab()}b3</p>`,
            stepFunction: async (editor) => {
                await deleteBackward(editor);
                await deleteForward(editor);
                await deleteBackward(editor);
            },
            contentAfter: `<p>a[]b3</p>`,
        });
        await testEditor({
            contentBefore: `<p>a${oeTab(tabAfterA)}[]${oeTab()}${oeTab()}b4</p>`,
            stepFunction: async (editor) => {
                await deleteForward(editor);
                await deleteBackward(editor);
                await deleteForward(editor);
            },
            contentAfter: `<p>a[]b4</p>`,
        });
    });
});

describe("remove tabulation with shift+tab", () => {
    before(setCharWidths);

    test("should not remove a non-leading tab character", async () => {
        const tabAfterA = TAB_WIDTH - charWidths.p.a;
        await testEditor({
            contentBefore: `<p>a${oeTab()}[]b</p>`,
            stepFunction: keydownShiftTab,
            contentAfterEdit: `<p>a${oeTab(tabAfterA, false)}[]b</p>`,
            contentAfter: `<p>a${oeTab(tabAfterA)}[]b</p>`,
        });
    });

    test("should remove a tab character", async () => {
        await testEditor({
            contentBefore: `<p>${oeTab()}a[]b</p>`,
            stepFunction: keydownShiftTab,
            contentAfter: `<p>a[]b</p>`,
        });
    });

    test("should keep selection and remove a tab character from the beginning of the paragraph", async () => {
        await testEditor({
            contentBefore: `<p>${oeTab()}a[xxx]b</p>`,
            stepFunction: keydownShiftTab,
            contentAfter: `<p>a[xxx]b</p>`,
        });
    });

    test("should remove two tab characters", async () => {
        await testEditor({
            contentBefore: `<p>${oeTab()}${oeTab()}a[]b</p>`,
            stepFunction: async (editor) => {
                keydownShiftTab(editor);
                keydownShiftTab(editor);
            },
            contentAfter: `<p>a[]b</p>`,
        });
    });

    test("should remove tab characters from the beginning of two separate paragraphs", async () => {
        await testEditor({
            contentBefore: `<p>${oeTab()}a[b</p>` + `<p>${oeTab()}c]d</p>`,
            stepFunction: keydownShiftTab,
            contentAfter: `<p>a[b</p>` + `<p>c]d</p>`,
        });
    });

    test("should remove tab characters from the beginning of two separate double-indented paragraphs", async () => {
        await testEditor({
            contentBefore: `<p>${oeTab()}${oeTab()}a[b</p>` + `<p>${oeTab()}${oeTab()}c]d</p>`,
            stepFunction: keydownShiftTab,
            contentAfterEdit:
                `<p>${oeTab(TAB_WIDTH, false)}a[b</p>` + `<p>${oeTab(TAB_WIDTH, false)}c]d</p>`,
            contentAfter: `<p>${oeTab(TAB_WIDTH)}a[b</p>` + `<p>${oeTab(TAB_WIDTH)}c]d</p>`,
        });
    });

    test("should remove tab characters from the beginning of two separate paragraphs of mixed indentations", async () => {
        await testEditor({
            contentBefore: `<p>${oeTab()}${oeTab()}a[b</p>` + `<p>${oeTab()}c]d</p>`,
            stepFunction: keydownShiftTab,
            contentAfterEdit: `<p>${oeTab(TAB_WIDTH, false)}a[b</p>` + `<p>c]d</p>`,
            contentAfter: `<p>${oeTab(TAB_WIDTH)}a[b</p>` + `<p>c]d</p>`,
        });
        await testEditor({
            contentBefore: `<p>a[b</p>` + `<p>${oeTab()}c]d</p>`,
            stepFunction: keydownShiftTab,
            contentAfter: `<p>a[b</p>` + `<p>c]d</p>`,
        });
    });

    test("should remove tab characters from the beginning of two separate paragraphs with tabs in them", async () => {
        const tabAfterA = TAB_WIDTH - charWidths.p.a;
        const tabAfterB = TAB_WIDTH - charWidths.p.b;
        const tabAfterC = TAB_WIDTH - charWidths.p.c;
        const tabAfterD = TAB_WIDTH - charWidths.p.d;
        await testTabulation({
            contentBefore:
                `<p>${oeTab()}a[${oeTab()}b${oeTab()}</p>` + `<p>c${oeTab()}]d${oeTab()}</p>`,
            stepFunction: keydownShiftTab,
            contentAfterEdit:
                `<p>a[${oeTab(tabAfterA, false)}b${oeTab(tabAfterB, false)}</p>` +
                `<p>c${oeTab(tabAfterC, false)}]d${oeTab(tabAfterD, false)}</p>`,
            contentAfter:
                `<p>a[${oeTab(tabAfterA)}b${oeTab(tabAfterB)}</p>` +
                `<p>c${oeTab(tabAfterC)}]d${oeTab(tabAfterD)}</p>`,
        });
    });

    test("should remove tab characters from the beginning of three separate blocks", async () => {
        await testEditor({
            contentBefore:
                `<p>xxx</p>` +
                `<p>${oeTab()}a[b</p>` +
                `<h1>${oeTab()}cd</h1>` +
                `<blockquote>${oeTab()}e]f</blockquote>` +
                `<h4>zzz</h4>`,
            stepFunction: keydownShiftTab,
            contentAfter:
                `<p>xxx</p>` +
                `<p>a[b</p>` +
                `<h1>cd</h1>` +
                `<blockquote>e]f</blockquote>` +
                `<h4>zzz</h4>`,
        });
    });

    test("should remove tab characters from the beginning of three separate blocks of mixed indentation", async () => {
        await testEditor({
            contentBefore:
                `<p>xxx</p>` +
                `<p>${oeTab()}${oeTab()}a[b</p>` +
                `<h1>${oeTab()}cd</h1>` +
                `<blockquote>e]f</blockquote>` +
                `<h4>zzz</h4>`,
            stepFunction: keydownShiftTab,
            contentAfterEdit:
                `<p>xxx</p>` +
                `<p>${oeTab(TAB_WIDTH, false)}a[b</p>` +
                `<h1>cd</h1>` +
                `<blockquote>e]f</blockquote>` +
                `<h4>zzz</h4>`,
            contentAfter:
                `<p>xxx</p>` +
                `<p>${oeTab(TAB_WIDTH)}a[b</p>` +
                `<h1>cd</h1>` +
                `<blockquote>e]f</blockquote>` +
                `<h4>zzz</h4>`,
        });
    });

    test.todo(
        "should remove tab characters from the beginning of three separate blocks with tabs in them",
        async () => {
            await testEditor({
                contentBefore:
                    `<p>xxx</p>` +
                    `<p>${oeTab()}a[${oeTab()}b${oeTab()}</p>` +
                    `<h1>${oeTab()}c${oeTab()}d${oeTab()}</h1>` +
                    `<blockquote>${oeTab()}e${oeTab()}]f</blockquote>` +
                    `<h4>zzz</h4>`,
                stepFunction: (editor) =>
                    dispatch(editor.editable, "keydown", { key: "Tab", shiftKey: true }),
                contentAfterEdit:
                    `<p>xxx</p>` +
                    `<p>a[${oeTab(32.8906, false)}b${oeTab(32, false)}</p>` +
                    `<h1>c${oeTab(25.7969, false)}d${oeTab(22.2031, false)}</h1>` +
                    `<blockquote>e${oeTab(32.8906, false)}]f</blockquote>` +
                    `<h4>zzz</h4>`,
                contentAfter:
                    `<p>xxx</p>` +
                    `<p>a[${oeTab(32.8906)}b${oeTab(32)}</p>` +
                    `<h1>c${oeTab(25.7969)}d${oeTab(22.2031)}</h1>` +
                    `<blockquote>e${oeTab(32.8906)}]f</blockquote>` +
                    `<h4>zzz</h4>`,
            });
        }
    );

    test.todo(
        "should remove tab characters from the beginning of blocks and outdent lists",
        async () => {
            await testEditor({
                contentBefore:
                    `<p>${oeTab()}${oeTab()}a[${oeTab()}b${oeTab()}</p>` +
                    `<ul>` +
                    `<li class="oe-nested"><ul><li>c${oeTab()}d${oeTab()}</li>` +
                    `<li class="oe-nested"><ul><li>${oeTab()}e${oeTab()}</li></ul></li></ul></li>` +
                    `</ul>` +
                    `<blockquote>${oeTab()}f${oeTab()}]g</blockquote>`,
                stepFunction: (editor) =>
                    dispatch(editor.editable, "keydown", { key: "Tab", shiftKey: true }),
                contentAfterEdit:
                    `<p>${oeTab(TAB_WIDTH, false)}a[${oeTab(32.8906, false)}b${oeTab(
                        32,
                        false
                    )}</p>` +
                    `<ul>` +
                    `<li>c${oeTab(32.8906, false)}d${oeTab(32, false)}</li>` +
                    `<li class="oe-nested"><ul><li>${oeTab(TAB_WIDTH, false)}e${oeTab(
                        32.8906,
                        false
                    )}</li></ul></li>` +
                    `</ul>` +
                    `<blockquote>f${oeTab(34.6719, false)}]g</blockquote>`,
                contentAfter:
                    `<p>${oeTab(TAB_WIDTH)}a[${oeTab(32.8906)}b${oeTab(32)}</p>` +
                    `<ul>` +
                    `<li>c${oeTab(32.8906)}d${oeTab(32)}</li>` +
                    `<li class="oe-nested"><ul><li>${oeTab(TAB_WIDTH)}e${oeTab(
                        32.8906
                    )}</li></ul></li>` +
                    `</ul>` +
                    `<blockquote>f${oeTab(34.6719)}]g</blockquote>`,
            });
        }
    );

    test("should remove a tab character from formatted text", async () => {
        await testEditor({
            contentBefore: `<p><strong>${oeTab()}a[]b</strong></p>`,
            stepFunction: keydownShiftTab,
            contentAfter: `<p><strong>a[]b</strong></p>`,
        });
    });

    test("should remove tab characters from the beginning of two separate formatted paragraphs", async () => {
        await testEditor({
            contentBefore:
                `<p>${oeTab()}<strong>a[b</strong></p>` + `<p>${oeTab()}<strong>c]d</strong></p>`,
            stepFunction: keydownShiftTab,
            contentAfter: `<p><strong>a[b</strong></p>` + `<p><strong>c]d</strong></p>`,
        });
    });

    test("should remove a tab character from styled text", async () => {
        await testEditor({
            contentBefore: `<p><font style="background-color: rgb(255,255,0);">${oeTab()}a[]b</font></p>`,
            stepFunction: keydownShiftTab,
            contentAfter: `<p><font style="background-color: rgb(255,255,0);">a[]b</font></p>`,
        });
    });
});
