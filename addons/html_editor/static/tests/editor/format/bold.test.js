/** @odoo-module */

import { isSelectionFormat } from "@html_editor/editor/utils/formatting";
import { describe, expect, test } from "@odoo/hoot";
import { testEditor } from "../../helpers";
import { unformat } from "../../utils";
import { BOLD_TAGS, bold, notStrong, span, strong } from "./utils";

test("should make a few characters bold", async () => {
    await testEditor({
        contentBefore: "<p>ab[cde]fg</p>",
        stepFunction: bold,
        contentAfter: `<p>ab${strong(`[cde]`)}fg</p>`,
    });
});
test("should make a few characters not bold", async () => {
    await testEditor({
        contentBefore: `<p>${strong(`ab[cde]fg`)}</p>`,
        stepFunction: bold,
        contentAfter: `<p>${strong(`ab`)}[cde]${strong(`fg`)}</p>`,
    });
});
test("should make two paragraphs bold", async () => {
    await testEditor({
        contentBefore: "<p>[abc</p><p>def]</p>",
        stepFunction: bold,
        contentAfter: `<p>${strong(`[abc`)}</p><p>${strong(`def]`)}</p>`,
    });
});
test("should make two paragraphs not bold", async () => {
    await testEditor({
        contentBefore: `<p>${strong(`[abc`)}</p><p>${strong(`def]`)}</p>`,
        stepFunction: bold,
        contentAfter: `<p>[abc</p><p>def]</p>`,
    });
});
test("should make qweb tag bold", async () => {
    await testEditor({
        contentBefore: `<div><p t-esc="'Test'" contenteditable="false">[Test]</p></div>`,
        stepFunction: bold,
        contentAfter: `<div><p t-esc="'Test'" contenteditable="false" style="font-weight: bolder;">[Test]</p></div>`,
    });
    await testEditor({
        contentBefore: `<div><p t-field="record.name" contenteditable="false">[Test]</p></div>`,
        stepFunction: bold,
        contentAfter: `<div><p t-field="record.name" contenteditable="false" style="font-weight: bolder;">[Test]</p></div>`,
    });
});
test("should make qweb tag bold even with partial selection", async () => {
    await testEditor({
        contentBefore: `<div><p t-esc="'Test'" contenteditable="false">T[e]st</p></div>`,
        stepFunction: bold,
        contentAfter: `<div><p t-esc="'Test'" contenteditable="false" style="font-weight: bolder;">T[e]st</p></div>`,
    });
});
test.todo("should make a whole heading bold after a triple click", async () => {
    await testEditor({
        contentBefore: `<h1>${notStrong(`[ab`)}</h1><p>]cd</p>`,
        stepFunction: bold,
        contentAfter: `<h1>[ab]</h1><p>cd</p>`,
    });
});
test.todo(
    "should make a whole heading not bold after a triple click (heading is considered bold)",
    async () => {
        await testEditor({
            contentBefore: "<h1>[ab</h1><p>]cd</p>",
            stepFunction: bold,
            contentAfter: `<h1>${notStrong(`[ab]`)}</h1><p>cd</p>`,
        });
    }
);
test("should make a selection starting with bold text fully bold", async () => {
    await testEditor({
        contentBefore: `<p>${strong(`[ab`)}</p><p>c]d</p>`,
        stepFunction: bold,
        contentAfter: `<p>${strong(`[ab`)}</p><p>${strong(`c]`)}d</p>`,
    });
});
test.todo("should make a selection with bold text in the middle fully bold", async () => {
    await testEditor({
        contentBefore: `<p>[a${strong(`b`)}</p><p>${strong(`c`)}d]e</p>`,
        stepFunction: bold,
        contentAfter: `<p>${strong(`[ab`)}</p><p>${strong(`cd]`)}e</p>`,
    });
});
test.todo("should make a selection ending with bold text fully bold", async () => {
    await testEditor({
        contentBefore: `<h1>${notStrong(`[ab`)}</h1><p>${strong(`c]d`)}</p>`,
        stepFunction: bold,
        contentAfter: `<h1>[ab</h1><p>${strong(`c]d`)}</p>`,
    });
});
test.todo("should get ready to type in bold", async () => {
    await testEditor({
        contentBefore: "<p>ab[]cd</p>",
        stepFunction: bold,
        contentAfterEdit: `<p>ab${strong(`[]\u200B`, "first")}cd</p>`,
        contentAfter: `<p>ab[]cd</p>`,
    });
});

test.todo("should get ready to type in not bold", async () => {
    await testEditor({
        contentBefore: `<p>${strong(`ab[]cd`)}</p>`,
        stepFunction: bold,
        contentAfterEdit: `<p>${strong(`ab`)}${span(`[]\u200B`, "first")}${strong(`cd`)}</p>`,
        contentAfter: `<p>${strong(`ab[]cd`)}</p>`,
    });
});

test("should remove a bold tag that was redondant while performing the command", async () => {
    for (const tag of BOLD_TAGS) {
        await testEditor({
            contentBefore: `<p>a${tag(`b${tag(`[c]`)}d`)}e</p>`,
            stepFunction: bold,
            contentAfter: `<p>a${tag("b")}[c]${tag("d")}e</p>`,
        });
    }
});
test("should remove a bold tag that was redondant with different tags while performing the command", async () => {
    await testEditor({
        contentBefore: unformat(`<p>
                a
                <span style="font-weight: bolder;">
                    b
                    <strong>c<b>[d]</b>e</strong>
                    f
                </span>
                g
            </p>`),
        stepFunction: bold,
        contentAfter: unformat(`<p>
                a
                <span style="font-weight: bolder;">b<strong>c</strong></span>
                [d]
                <span style="font-weight: bolder;"><strong>e</strong>f</span>
                g
            </p>`),
    });
});
test("should not format non-editable text (bold)", async () => {
    await testEditor({
        contentBefore: '<p>[a</p><p contenteditable="false">b</p><p>c]</p>',
        stepFunction: bold,
        contentAfter: `<p>${strong("[a")}</p><p contenteditable="false">b</p><p>${strong(
            "c]"
        )}</p>`,
    });
});
test.todo("should insert a span zws when toggling a formatting command twice", () => {
    return testEditor({
        contentBefore: `<p>[]<br></p>`,
        stepFunction: async (editor) => {
            await bold(editor);
            await bold(editor);
        },
        // todo: It would be better to remove the zws entirely so that
        // the P could have the "/" hint but that behavior might be
        // complex with the current implementation.
        contentAfterEdit: `<p>${strong(`[]\u200B`, "first")}</p>`,
    });
});

describe("inside container or inline with class already bold", () => {
    test.todo("should force the font-weight to normal with an inline with class", async () => {
        await testEditor({
            styleContent: `.boldClass { font-weight: bold; }`,
            contentBefore: `<div>a<span class="boldClass">[b]</span>c</div>`,
            stepFunction: bold,
            contentAfter: `<div>a<span class="boldClass"><span style="font-weight: normal;">[b]</span></span>c</div>`,
        });
    });

    test.todo("should force the font-weight to normal", async () => {
        await testEditor({
            contentBefore: `<h1>a[b]c</h1>`,
            stepFunction: bold,
            contentAfter: `<h1>a<span style="font-weight: normal;">[b]</span>c</h1>`,
        });
    });

    test.todo("should force the font-weight to normal while removing redundant tag", async () => {
        for (const tag of BOLD_TAGS) {
            await testEditor({
                contentBefore: `<h1>a${tag("[b]")}c</h1>`,
                stepFunction: bold,
                contentAfter: `<h1>a<span style="font-weight: normal;">[b]</span>c</h1>`,
            });
        }
    });
});

describe("inside container font-weight: 500 and strong being strong-weight: 500", () => {
    test.todo(
        "should remove the redundant strong style and add span with a bolder font-weight",
        async () => {
            await testEditor({
                styleContent: `h1, strong {font-weight: 500;}`,
                contentBefore: `<h1>a${strong(`[b]`)}c</h1>`,
                stepFunction: bold,
                contentAfter: `<h1>a<span style="font-weight: bolder;">[b]</span>c</h1>`,
            });
        }
    );
});

describe("isSelectionFormat", () => {
    test("return false for isSelectionFormat when partially selecting 2 text node, the anchor is formated and focus is not formated", async () => {
        await testEditor({
            contentBefore: `<p>${strong(`a[b`)}</p><p>c]d</p>`,
            stepFunction: (editor) => {
                expect(isSelectionFormat(editor.editable, "bold")).toBe(false);
            },
        });
    });
    test("return false for isSelectionFormat when partially selecting 2 text node, the anchor is not formated and focus is formated", async () => {
        await testEditor({
            contentBefore: `<p>${strong(`a]b`)}</p><p>c[d</p>`,
            stepFunction: (editor) => {
                expect(isSelectionFormat(editor.editable, "bold")).toBe(false);
            },
        });
    });
    test("return false for isSelectionFormat when selecting 3 text node, the anchor and focus not formated and the text node in between formated", async () => {
        await testEditor({
            contentBefore: `<p>a[b</p><p>${strong(`c`)}</p><p>d]e</p>`,
            stepFunction: (editor) => {
                expect(isSelectionFormat(editor.editable, "bold")).toBe(false);
            },
        });
    });
});
