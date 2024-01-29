/** @odoo-module */

import { describe, test } from "@odoo/hoot";
import { dispatch } from "@odoo/hoot-dom";
import { testEditor } from "../test_helpers/editor";
import { TAB_WIDTH, getCharWidth, oeTab, testTabulation } from "../test_helpers/tabs";
import {
    deleteBackward,
    deleteForward,
    insertText,
    keydownShiftTab,
    keydownTab,
} from "../test_helpers/user_actions";

describe("insert tabulation", () => {
    test("should insert a tab character", async () => {
        const expectedTabWidth = TAB_WIDTH - getCharWidth("p", "a");
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
        const expectedTabWidth = TAB_WIDTH - getCharWidth("p", "a");
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
        const expectedTabWidth = TAB_WIDTH - getCharWidth("p", "a");
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
        const tabAfterA = TAB_WIDTH - getCharWidth("p", "a");
        const tabAfterB = TAB_WIDTH - getCharWidth("p", "b");
        const tabAfterC = TAB_WIDTH - getCharWidth("p", "c");
        const tabAfterD = TAB_WIDTH - getCharWidth("p", "d");
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
            const tabAfterA = TAB_WIDTH - getCharWidth("p", "a");
            const tabAfterB = TAB_WIDTH - getCharWidth("p", "b");
            const tabAfterCinH1 = TAB_WIDTH - getCharWidth("h1", "c");
            const tabAfterDinH1 = TAB_WIDTH - getCharWidth("h1", "d");
            // @todo: account for the blockquote border + padding
            const tabAfterEinBlockquote = TAB_WIDTH - getCharWidth("blockquote", "e");

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
    test("should remove one tab character", async () => {
        const tabAfterA = TAB_WIDTH - getCharWidth("p", "a");
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
        const tabAfterA = TAB_WIDTH - getCharWidth("p", "a");
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
    test("should remove one tab character", async () => {
        const tabAfterA = TAB_WIDTH - getCharWidth("p", "a");
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
        const tabAfterA = TAB_WIDTH - getCharWidth("p", "a");
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
    test.todo("should remove all tab characters", async () => {
        const tabAfterA = TAB_WIDTH - getCharWidth("p", "a");
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
    test("should not remove a non-leading tab character", async () => {
        const tabAfterA = TAB_WIDTH - getCharWidth("p", "a");
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
        const tabAfterA = TAB_WIDTH - getCharWidth("p", "a");
        const tabAfterB = TAB_WIDTH - getCharWidth("p", "b");
        const tabAfterC = TAB_WIDTH - getCharWidth("p", "c");
        const tabAfterD = TAB_WIDTH - getCharWidth("p", "d");
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
