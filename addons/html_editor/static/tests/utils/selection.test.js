import { DIRECTIONS } from "@html_editor/editor/utils/position";
import {
    ensureFocus,
    getCursorDirection,
    getDeepRange,
    getNormalizedCursorPosition,
    getSelectedNodes,
    getTraversedNodes,
    setCursorEnd,
    setCursorStart,
    setSelection,
} from "@html_editor/editor/utils/selection";
import { describe, expect, test } from "@odoo/hoot";
import { dispatch } from "@odoo/hoot-dom";
import { insertTestHtml, insertText, setupEditor, testEditor } from "../test_helpers/editor";
import { unformat } from "../test_helpers/format";

describe("getTraversedNodes", () => {
    test("should return the anchor node of a collapsed selection", async () => {
        const { el } = await setupEditor("<div><p>a[]bc</p><div>def</div></div>");
        expect(
            getTraversedNodes(el).map((node) =>
                node.nodeType === Node.TEXT_NODE ? node.textContent : node.nodeName
            )
        ).toEqual(["abc"]);
    });

    test("should return the nodes traversed in a cross-blocks selection", async () => {
        const { el } = await setupEditor("<div><p>a[bc</p><div>d]ef</div></div>");
        expect(
            getTraversedNodes(el).map((node) =>
                node.nodeType === Node.TEXT_NODE ? node.textContent : node.nodeName
            )
        ).toEqual(["abc", "DIV", "def"]);
    });

    test("should return the nodes traversed in a cross-blocks selection with hybrid nesting", async () => {
        const { el } = await setupEditor(
            "<div><section><p>a[bc</p></section><div>d]ef</div></div>"
        );
        expect(
            getTraversedNodes(el).map((node) =>
                node.nodeType === Node.TEXT_NODE ? node.textContent : node.nodeName
            )
        ).toEqual(["abc", "DIV", "def"]);
    });

    test("should return an image in a parent selection", async () => {
        const { el, editor } = await setupEditor(`<div id="parent-element-to-select"><img></div>`);
        const sel = editor.document.getSelection();
        const range = editor.document.createRange();
        const parent = editor.document.querySelector("div#parent-element-to-select");
        range.setStart(parent, 0);
        range.setEnd(parent, 1);
        sel.removeAllRanges();
        sel.addRange(range);
        expect(
            getTraversedNodes(el).map((node) =>
                node.nodeType === Node.TEXT_NODE ? node.textContent : node.nodeName
            )
        ).toEqual(["DIV", "IMG"]);
    });

    test("should return the text node in which the range is collapsed", async () => {
        const { el: editable } = await setupEditor("<p>ab[]cd</p>");
        const abcd = editable.firstChild.firstChild;
        const result = getTraversedNodes(editable);
        expect(result).toEqual([abcd]);
    });

    test("should find that a the range traverses the next paragraph as well", async () => {
        const { el: editable } = await setupEditor("<p>ab[cd</p><p>ef]gh</p>");
        const abcd = editable.firstChild.firstChild;
        const p2 = editable.childNodes[1];
        const efgh = p2.firstChild;
        const result = getTraversedNodes(editable);
        expect(result).toEqual([abcd, p2, efgh]);
    });

    test("should find all traversed nodes in nested range", async () => {
        const { el: editable } = await setupEditor(
            '<p><span class="a">ab[</span>cd</p><div><p><span class="b"><b>e</b><i>f]g</i>h</span></p></div>'
        );
        const ab = editable.firstChild.firstChild.firstChild;
        const cd = editable.firstChild.lastChild;
        const div = editable.lastChild;
        const p2 = div.firstChild;
        const span2 = p2.firstChild;
        const b = span2.firstChild;
        const e = b.firstChild;
        const i = b.nextSibling;
        const fg = i.firstChild;
        const result = getTraversedNodes(editable);
        expect(result).toEqual([ab, cd, div, p2, span2, b, e, i, fg]);
    });
});

describe("ensureFocus", () => {
    // TODO @phoenix: unskipped when ensureFocus is add in the code base
    test.todo(
        "should preserve the focus on the child of this.editable when executing a powerbox command even if it is enclosed in a contenteditable=false",
        async () => {
            await testEditor({
                contentBefore: unformat(`
                <div contenteditable="false"><div contenteditable="true">
                    <p>[]<br></p>
                </div></div>
                <p><br></p>`),
                stepFunction: async (editor) => {
                    const sel = document.getSelection();
                    const element = sel.anchorNode;
                    await dispatch(editor.editable, "keydown", { key: "/" });
                    await insertText(editor, "/");
                    await dispatch(editor.editable, "keyup", { key: "/" });
                    await insertText(editor, "h2");
                    await dispatch(element, "keyup", { key: "2" });
                    await dispatch(editor.editable, "keydown", { key: "Enter" });
                    const activeElement = document.activeElement;
                    setCursorStart(activeElement.lastElementChild);
                    // TODO @phoenix still need it ?
                    // await nextTickFrame();
                },
                contentAfter: unformat(`
                <div contenteditable="false"><div contenteditable="true">
                    <h2>[]<br></h2>
                </div></div>
                <p><br></p>`),
            });
        }
    );

    test.todo(
        "should preserve the focus on the child of this.editable even if it is enclosed in a contenteditable=false",
        async () => {
            await testEditor({
                contentBefore: unformat(`
                <div contenteditable="false"><div contenteditable="true">
                    <p>[]<br></p>
                </div></div>
                <p><br></p>`),
                stepFunction: async (editor) => {
                    ensureFocus(editor.editable);
                    // TODO @phoenix still need it ?
                    // await nextTickFrame();
                    let activeElement = document.activeElement;
                    setCursorStart(activeElement.lastElementChild);
                    await insertText(editor, "focusWasConserved");
                    // Proof that a simple call to Element.focus would change
                    // the focus in this case.
                    editor.editable.focus();
                    // TODO @phoenix still need it ?
                    // await nextTickFrame();
                    activeElement = document.activeElement;
                    setCursorStart(activeElement.lastElementChild);
                    // TODO @phoenix still need it ?
                    // await nextTickFrame();
                },
                contentAfter: unformat(`
                <div contenteditable="false"><div contenteditable="true">
                    <p>focusWasConserved</p>
                </div></div>
                <p>[]<br></p>`),
            });
        }
    );

    test.todo(
        "should update the focus when the active element is not the focus target",
        async () => {
            await testEditor({
                contentBefore: unformat(`
                <div contenteditable="false"><div contenteditable="true">
                    <p>[]<br></p>
                </div></div>
                <div contenteditable="false"><div id="target" contenteditable="true">
                    <p><br></p>
                </div></div>`),
                stepFunction: async (editor) => {
                    const element = editor.editable.querySelector("#target");
                    ensureFocus(element);
                    // TODO @phoenix still need it ?
                    // await nextTickFrame();
                    const activeElement = document.activeElement;
                    setCursorStart(activeElement.lastElementChild);
                    // TODO @phoenix still need it ?
                    // await nextTickFrame();
                },
                contentAfter: unformat(`
                <div contenteditable="false"><div contenteditable="true">
                    <p><br></p>
                </div></div>
                <div contenteditable="false"><div id="target" contenteditable="true">
                    <p>[]<br></p>
                </div></div>`),
            });
        }
    );
});

describe("getNormalizedCursorPosition", () => {
    test("should move the cursor from after a <b> to within it", () => {
        const [p] = insertTestHtml("<p><b>abc</b>def</p>");
        const result = getNormalizedCursorPosition(p.lastChild, 0);
        expect(result).toEqual([p.firstChild.firstChild, 3]);
    });

    test("should move the cursor before a non-editable element with offset === 0", () => {
        const [p] = insertTestHtml('<p><span contenteditable="false">leavemealone</span></p>');
        const result = getNormalizedCursorPosition(p.lastChild, 0);
        expect(result).toEqual([p, 0]);
    });

    test("should move the cursor after a non-editable element with offset > 0", () => {
        const [p] = insertTestHtml('<p><span contenteditable="false">leavemealone</span></p>');
        const result = getNormalizedCursorPosition(p.lastChild, 1);
        expect(result).toEqual([p, 1]);
    });

    test('should move the cursor after a "visibleEmpty" element', () => {
        const [p] = insertTestHtml("<p>ab<br>cd</p>");
        const result = getNormalizedCursorPosition(p.lastElementChild, 0);
        expect(result).toEqual([p.lastChild, 0]);
    });

    test('should move the cursor before a "fake line break element"', () => {
        const [p] = insertTestHtml("<p><br></p>");
        const result = getNormalizedCursorPosition(p.lastElementChild, 0);
        expect(result).toEqual([p, 0]);
    });

    test("should loop outside (left) a non-editable context and then find the deepest editable leaf position", () => {
        const [p] = insertTestHtml(
            unformat(`
            <p>
                <a class="end">text</a>
                <span contenteditable="false">
                    <b class="start">
                        text
                    </b>
                </span>
            </p>
        `)
        );
        const start = p.querySelector(".start");
        const end = p.querySelector(".end");
        const result = getNormalizedCursorPosition(start.lastChild, 0);
        expect(result).toEqual([end.firstChild, 4]);
    });

    test("should loop outside (right) a non-editable context and then find the deepest editable leaf position", () => {
        const [p] = insertTestHtml(
            unformat(`
            <p>
                <span contenteditable="false">
                    <b class="start">
                        text
                    </b>
                </span>
                <a class="end">text</a>
            </p>
        `)
        );
        const start = p.querySelector(".start");
        const end = p.querySelector(".end");
        const result = getNormalizedCursorPosition(start.lastChild, 1);
        expect(result).toEqual([end.lastChild, 0]);
    });

    test("should loop outside (left) a non-editable context and not traverse a non-editable leaf position", () => {
        const [p] = insertTestHtml(
            unformat(`
            <p>
                <a contenteditable="false">leavemealone</a>
                <span contenteditable="false">
                    <b class="start">
                        text
                    </b>
                </span>
            </p>
        `)
        );
        const start = p.querySelector(".start");
        const result = getNormalizedCursorPosition(start.lastChild, 0);
        expect(result).toEqual([p, 1]);
    });

    test("should loop outside (right) a non-editable context and not traverse a non-editable leaf position", () => {
        const [p] = insertTestHtml(
            unformat(`
            <p>
                <span contenteditable="false">
                    <b class="start">
                        text
                    </b>
                </span>
                <a contenteditable="false">leavemealone</a>
            </p>
        `)
        );
        const start = p.querySelector(".start");
        const result = getNormalizedCursorPosition(start.lastChild, 1);
        expect(result).toEqual([p, 1]);
    });
});

describe("setSelection", () => {
    describe("collapsed", () => {
        test("should collapse the cursor at the beginning of an element", () => {
            const [p] = insertTestHtml("<p>abc</p>");
            const result = setSelection(p.firstChild, 0);
            expect(result).toEqual([p.firstChild, 0, p.firstChild, 0]);
            const { anchorNode, anchorOffset, focusNode, focusOffset } = document.getSelection();
            expect([anchorNode, anchorOffset, focusNode, focusOffset]).toEqual([
                p.firstChild,
                0,
                p.firstChild,
                0,
            ]);
        });

        test("should collapse the cursor within an element", () => {
            const [p] = insertTestHtml("<p>abcd</p>");
            const result = setSelection(p.firstChild, 2);
            expect(result).toEqual([p.firstChild, 2, p.firstChild, 2]);
            const { anchorNode, anchorOffset, focusNode, focusOffset } = document.getSelection();
            expect([anchorNode, anchorOffset, focusNode, focusOffset]).toEqual([
                p.firstChild,
                2,
                p.firstChild,
                2,
            ]);
        });

        test("should collapse the cursor at the end of an element", () => {
            const [p] = insertTestHtml("<p>abc</p>");
            const result = setSelection(p.firstChild, 3);
            expect(result).toEqual([p.firstChild, 3, p.firstChild, 3]);
            const { anchorNode, anchorOffset, focusNode, focusOffset } = document.getSelection();
            expect([anchorNode, anchorOffset, focusNode, focusOffset]).toEqual([
                p.firstChild,
                3,
                p.firstChild,
                3,
            ]);
        });

        test("should collapse the cursor before a nested inline element", () => {
            const [p] = insertTestHtml("<p>ab<span>cd<b>ef</b>gh</span>ij</p>");
            const cd = p.childNodes[1].firstChild;
            const result = setSelection(cd, 2);
            expect(result).toEqual([cd, 2, cd, 2]);
            const { anchorNode, anchorOffset, focusNode, focusOffset } = document.getSelection();
            expect([anchorNode, anchorOffset, focusNode, focusOffset]).toEqual([cd, 2, cd, 2]);
        });

        test("should collapse the cursor at the beginning of a nested inline element", () => {
            const [p] = insertTestHtml("<p>ab<span>cd<b>ef</b>gh</span>ij</p>");
            const ef = p.childNodes[1].childNodes[1].firstChild;
            const result = setSelection(ef, 0);
            expect(result).toEqual([ef, 0, ef, 0]);
            const { anchorNode, anchorOffset, focusNode, focusOffset } = document.getSelection();
            expect([anchorNode, anchorOffset, focusNode, focusOffset]).toEqual([ef, 0, ef, 0]);
        });

        test("should collapse the cursor within a nested inline element", () => {
            const [p] = insertTestHtml("<p>ab<span>cd<b>efgh</b>ij</span>kl</p>");
            const efgh = p.childNodes[1].childNodes[1].firstChild;
            const result = setSelection(efgh, 2);
            expect(result).toEqual([efgh, 2, efgh, 2]);
            const { anchorNode, anchorOffset, focusNode, focusOffset } = document.getSelection();
            expect([anchorNode, anchorOffset, focusNode, focusOffset]).toEqual([efgh, 2, efgh, 2]);
        });

        test("should collapse the cursor at the end of a nested inline element", () => {
            const [p] = insertTestHtml("<p>ab<span>cd<b>ef</b>gh</span>ij</p>");
            const ef = p.childNodes[1].childNodes[1].firstChild;
            const result = setSelection(ef, 2);
            expect(result).toEqual([ef, 2, ef, 2]);
            const { anchorNode, anchorOffset, focusNode, focusOffset } = document.getSelection();
            expect([anchorNode, anchorOffset, focusNode, focusOffset]).toEqual([ef, 2, ef, 2]);
        });

        test("should collapse the cursor after a nested inline element", () => {
            const [p] = insertTestHtml("<p>ab<span>cd<b>ef</b>gh</span>ij</p>");
            const ef = p.childNodes[1].childNodes[1].firstChild;
            const gh = p.childNodes[1].lastChild;
            const result = setSelection(gh, 0);
            expect(result).toEqual([ef, 2, ef, 2]);
            const { anchorNode, anchorOffset, focusNode, focusOffset } = document.getSelection();
            expect([anchorNode, anchorOffset, focusNode, focusOffset]).toEqual([ef, 2, ef, 2]);

            const nonNormalizedResult = setSelection(gh, 0, gh, 0, false);
            expect(nonNormalizedResult).toEqual([gh, 0, gh, 0]);
            const sel = document.getSelection();
            expect([sel.anchorNode, sel.anchorOffset, sel.focusNode, sel.focusOffset]).toEqual([
                gh,
                0,
                gh,
                0,
            ]);
        });
    });

    describe("forward", () => {
        test("should select the contents of an element", () => {
            const [p] = insertTestHtml("<p>abc</p>");
            const result = setSelection(p.firstChild, 0, p.firstChild, 3);
            expect(result).toEqual([p.firstChild, 0, p.firstChild, 3]);
            const { anchorNode, anchorOffset, focusNode, focusOffset } = document.getSelection();
            expect([anchorNode, anchorOffset, focusNode, focusOffset]).toEqual([
                p.firstChild,
                0,
                p.firstChild,
                3,
            ]);
        });

        test("should make a complex selection", () => {
            const [p1, p2] = insertTestHtml(
                "<p>ab<span>cd<b>ef</b>gh</span>ij</p><p>kl<span>mn<b>op</b>qr</span>st</p>"
            );
            const ef = p1.childNodes[1].childNodes[1].firstChild;
            const qr = p2.childNodes[1].childNodes[2];
            const st = p2.childNodes[2];
            const result = setSelection(ef, 1, st, 0);
            expect(result).toEqual([ef, 1, qr, 2]);
            const { anchorNode, anchorOffset, focusNode, focusOffset } = document.getSelection();
            expect([anchorNode, anchorOffset, focusNode, focusOffset]).toEqual([ef, 1, qr, 2]);

            const nonNormalizedResult = setSelection(ef, 1, st, 0, false);
            expect(nonNormalizedResult).toEqual([ef, 1, st, 0]);
            const sel = document.getSelection();
            expect([sel.anchorNode, sel.anchorOffset, sel.focusNode, sel.focusOffset]).toEqual([
                ef,
                1,
                st,
                0,
            ]);
        });
    });

    describe("backward", () => {
        test("should select the contents of an element", () => {
            const [p] = insertTestHtml("<p>abc</p>");
            const result = setSelection(p.firstChild, 3, p.firstChild, 0);
            expect(result).toEqual([p.firstChild, 3, p.firstChild, 0]);
            const { anchorNode, anchorOffset, focusNode, focusOffset } = document.getSelection();
            expect([anchorNode, anchorOffset, focusNode, focusOffset]).toEqual([
                p.firstChild,
                3,
                p.firstChild,
                0,
            ]);
        });

        test("should make a complex selection", () => {
            const [p1, p2] = insertTestHtml(
                "<p>ab<span>cd<b>ef</b>gh</span>ij</p><p>kl<span>mn<b>op</b>qr</span>st</p>"
            );
            const ef = p1.childNodes[1].childNodes[1].firstChild;
            const qr = p2.childNodes[1].childNodes[2];
            const st = p2.childNodes[2];
            const result = setSelection(st, 0, ef, 1);
            expect(result).toEqual([qr, 2, ef, 1]);
            const { anchorNode, anchorOffset, focusNode, focusOffset } = document.getSelection();
            expect([anchorNode, anchorOffset, focusNode, focusOffset]).toEqual([qr, 2, ef, 1]);

            const nonNormalizedResult = setSelection(st, 0, ef, 1, false);
            expect(nonNormalizedResult).toEqual([st, 0, ef, 1]);
            const sel = document.getSelection();
            expect([sel.anchorNode, sel.anchorOffset, sel.focusNode, sel.focusOffset]).toEqual([
                st,
                0,
                ef,
                1,
            ]);
        });
    });
});

describe("setCursorStart", () => {
    test("should collapse the cursor at the beginning of an element", () => {
        const [p] = insertTestHtml("<p>abc</p>");
        const result = setCursorStart(p);
        expect(result).toEqual([p.firstChild, 0, p.firstChild, 0]);
        const { anchorNode, anchorOffset, focusNode, focusOffset } = document.getSelection();
        expect([anchorNode, anchorOffset, focusNode, focusOffset]).toEqual([
            p.firstChild,
            0,
            p.firstChild,
            0,
        ]);
    });

    test("should collapse the cursor at the beginning of a nested inline element", () => {
        const [p] = insertTestHtml("<p>ab<span>cd<b>ef</b>gh</span>ij</p>");
        const b = p.childNodes[1].childNodes[1];
        const ef = b.firstChild;
        const result = setCursorStart(b);
        expect(result).toEqual([ef, 0, ef, 0]);
        const { anchorNode, anchorOffset, focusNode, focusOffset } = document.getSelection();
        expect([anchorNode, anchorOffset, focusNode, focusOffset]).toEqual([ef, 0, ef, 0]);
    });

    test("should collapse the cursor after a nested inline element", () => {
        const [p] = insertTestHtml("<p>ab<span>cd<b>ef</b>gh</span>ij</p>");
        const ef = p.childNodes[1].childNodes[1].firstChild;
        const gh = p.childNodes[1].lastChild;
        const result = setCursorStart(gh);
        expect(result).toEqual([ef, 2, ef, 2]);
        const { anchorNode, anchorOffset, focusNode, focusOffset } = document.getSelection();
        expect([anchorNode, anchorOffset, focusNode, focusOffset]).toEqual([ef, 2, ef, 2]);

        const nonNormalizedResult = setCursorStart(gh, false);
        expect(nonNormalizedResult).toEqual([gh, 0, gh, 0]);
        const sel = document.getSelection();
        expect([sel.anchorNode, sel.anchorOffset, sel.focusNode, sel.focusOffset]).toEqual([
            gh,
            0,
            gh,
            0,
        ]);
    });
});

describe("setCursorEnd", () => {
    test("should collapse the cursor at the end of an element", () => {
        const [p] = insertTestHtml("<p>abc</p>");
        const result = setCursorEnd(p);
        expect(result).toEqual([p.firstChild, 3, p.firstChild, 3]);
        const { anchorNode, anchorOffset, focusNode, focusOffset } = document.getSelection();
        expect([anchorNode, anchorOffset, focusNode, focusOffset]).toEqual([
            p.firstChild,
            3,
            p.firstChild,
            3,
        ]);
    });

    test("should collapse the cursor before a nested inline element", () => {
        const [p] = insertTestHtml("<p>ab<span>cd<b>ef</b>gh</span>ij</p>");
        const cd = p.childNodes[1].firstChild;
        const result = setCursorEnd(cd);
        expect(result).toEqual([cd, 2, cd, 2]);
        const { anchorNode, anchorOffset, focusNode, focusOffset } = document.getSelection();
        expect([anchorNode, anchorOffset, focusNode, focusOffset]).toEqual([cd, 2, cd, 2]);
    });

    test("should collapse the cursor at the end of a nested inline element", () => {
        const [p] = insertTestHtml("<p>ab<span>cd<b>ef</b>gh</span>ij</p>");
        const b = p.childNodes[1].childNodes[1];
        const ef = b.firstChild;
        const result = setCursorEnd(b);
        expect(result).toEqual([ef, 2, ef, 2]);
        const { anchorNode, anchorOffset, focusNode, focusOffset } = document.getSelection();
        expect([anchorNode, anchorOffset, focusNode, focusOffset]).toEqual([ef, 2, ef, 2]);
    });
});

describe("getCursorDirection", () => {
    test("should identify a forward selection", async () => {
        await testEditor({
            contentBefore: "<p>a[bc]d</p>",
            stepFunction: (editor) => {
                const { anchorNode, anchorOffset, focusNode, focusOffset } =
                    editor.document.getSelection();
                expect(getCursorDirection(anchorNode, anchorOffset, focusNode, focusOffset)).toBe(
                    DIRECTIONS.RIGHT
                );
            },
        });
    });

    test("should identify a backward selection", async () => {
        await testEditor({
            contentBefore: "<p>a]bc[d</p>",
            stepFunction: (editor) => {
                const { anchorNode, anchorOffset, focusNode, focusOffset } =
                    editor.document.getSelection();
                expect(getCursorDirection(anchorNode, anchorOffset, focusNode, focusOffset)).toBe(
                    DIRECTIONS.LEFT
                );
            },
        });
    });

    test("should identify a collapsed selection", async () => {
        await testEditor({
            contentBefore: "<p>ab[]cd</p>",
            stepFunction: (editor) => {
                const { anchorNode, anchorOffset, focusNode, focusOffset } =
                    editor.document.getSelection();
                expect(getCursorDirection(anchorNode, anchorOffset, focusNode, focusOffset)).toBe(
                    false
                );
            },
        });
    });
});

describe("getSelectedNodes", () => {
    test("should return nothing if the range is collapsed", async () => {
        await testEditor({
            contentBefore: "<p>ab[]cd</p>",
            stepFunction: (editor) => {
                const editable = editor.editable;
                const result = getSelectedNodes(editable);
                expect(result).toEqual([]);
            },
            contentAfter: "<p>ab[]cd</p>",
        });
    });

    test("should find that no node is fully selected", async () => {
        await testEditor({
            contentBefore: "<p>ab[c]d</p>",
            stepFunction: (editor) => {
                const editable = editor.editable;
                const result = getSelectedNodes(editable);
                expect(result).toEqual([]);
            },
        });
    });

    test("should find that no node is fully selected, across blocks", async () => {
        await testEditor({
            contentBefore: "<p>ab[cd</p><p>ef]gh</p>",
            stepFunction: (editor) => {
                const editable = editor.editable;
                const result = getSelectedNodes(editable);
                expect(result).toEqual([]);
            },
        });
    });

    test("should find that a text node is fully selected", async () => {
        await testEditor({
            contentBefore: '<p><span class="a">ab</span>[cd]</p>',
            stepFunction: (editor) => {
                const editable = editor.editable;
                const result = getSelectedNodes(editable);
                const cd = editable.firstChild.lastChild;
                expect(result).toEqual([cd]);
            },
        });
    });

    test("should find that a block is fully selected", async () => {
        await testEditor({
            contentBefore: "<p>[ab</p><p>cd</p><p>ef]gh</p>",
            stepFunction: (editor) => {
                const editable = editor.editable;
                const result = getSelectedNodes(editable);
                const ab = editable.firstChild.firstChild;
                const p2 = editable.childNodes[1];
                const cd = p2.firstChild;
                expect(result).toEqual([ab, p2, cd]);
            },
        });
    });

    test("should find all selected nodes in nested range", async () => {
        await testEditor({
            contentBefore:
                '<p><span class="a">ab[</span>cd</p><div><p><span class="b"><b>e</b><i>f]g</i>h</span></p></div>',
            stepFunction: (editor) => {
                const editable = editor.editable;
                const cd = editable.firstChild.lastChild;
                const b = editable.lastChild.firstChild.firstChild.firstChild;
                const e = b.firstChild;
                const result = getSelectedNodes(editable);
                expect(result).toEqual([cd, b, e]);
            },
        });
    });
});

describe("getDeepRange", () => {
    describe("collapsed", () => {
        test("should collapse the cursor at the beginning of an element", () => {
            const [p] = insertTestHtml(
                `<p>
                    <span><b><i><u>abc</u></i></b></span>
                </p>`
            );
            const abc = p.childNodes[1].firstChild.firstChild.firstChild.firstChild;
            const range = document.createRange();
            range.setStart(p, 0);
            range.setEnd(p, 0);
            const result = getDeepRange(p.parentElement, { range, select: true });
            const { startContainer, startOffset, endContainer, endOffset } = result;
            expect([startContainer, startOffset, endContainer, endOffset]).toEqual([
                abc,
                0,
                abc,
                0,
            ]);
            const { anchorNode, anchorOffset, focusNode, focusOffset } = document.getSelection();
            expect([anchorNode, anchorOffset, focusNode, focusOffset]).toEqual([abc, 0, abc, 0]);
        });

        test("should collapse the cursor at the end of a nested inline element", () => {
            const [p] = insertTestHtml(
                `<p>
                    <span><b><i><u>abc</u></i></b></span>
                </p>`
            );
            const abc = p.childNodes[1].firstChild.firstChild.firstChild.firstChild;
            const range = document.createRange();
            range.setStart(p, 2);
            range.setEnd(p, 2);
            const result = getDeepRange(p.parentElement, { range, select: true });
            const { startContainer, startOffset, endContainer, endOffset } = result;
            expect([startContainer, startOffset, endContainer, endOffset]).toEqual([
                abc,
                3,
                abc,
                3,
            ]);
            const { anchorNode, anchorOffset, focusNode, focusOffset } = document.getSelection();
            expect([anchorNode, anchorOffset, focusNode, focusOffset]).toEqual([abc, 3, abc, 3]);
        });
    });

    describe("forward", () => {
        test("should select the contents of an element", () => {
            const [p] = insertTestHtml(
                `<p>
                    <span><b><i><u>abc</u></i></b></span>
                </p>`
            );
            const abc = p.childNodes[1].firstChild.firstChild.firstChild.firstChild;
            const range = document.createRange();
            range.setStart(p, 0);
            range.setEnd(p, 2);
            const result = getDeepRange(p.parentElement, { range, select: true });
            const { startContainer, startOffset, endContainer, endOffset } = result;
            expect([startContainer, startOffset, endContainer, endOffset]).toEqual([
                abc,
                0,
                abc,
                3,
            ]);
            const { anchorNode, anchorOffset, focusNode, focusOffset } = document.getSelection();
            expect([anchorNode, anchorOffset, focusNode, focusOffset]).toEqual([abc, 0, abc, 3]);
        });

        test("should make a complex selection", () => {
            const [p1, p2] = insertTestHtml(
                `<p>
                    ab<span>cd<b>ef</b>gh</span>ij
                </p><p>
                    kl<span>mn<b>op</b>qr</span>st
                </p>`
            );
            const span1 = p1.childNodes[1];
            const ef = span1.querySelector("b").firstChild;
            const st = p2.childNodes[2];
            const range = document.createRange();
            range.setStart(span1, 1);
            range.setEnd(p2, 2);
            const result = getDeepRange(p1.parentElement, { range, select: true });
            const { startContainer, startOffset, endContainer, endOffset } = result;
            expect([startContainer, startOffset, endContainer, endOffset]).toEqual([ef, 0, st, 0]);
        });

        test("should correct a triple click", () => {
            const [p1, p2] = insertTestHtml("<p>abc def ghi</p><p>jkl mno pqr</p>");
            const range = document.createRange();
            range.setStart(p1, 0);
            range.setEnd(p2, 0);
            const result = getDeepRange(p1.parentElement, {
                range,
                select: true,
                correctTripleClick: true,
            });
            const { startContainer, startOffset, endContainer, endOffset } = result;
            expect([startContainer, startOffset, endContainer, endOffset]).toEqual([
                p1.firstChild,
                0,
                p1.firstChild,
                11,
            ]);
            const { anchorNode, anchorOffset, focusNode, focusOffset } = document.getSelection();
            expect([anchorNode, anchorOffset, focusNode, focusOffset]).toEqual([
                p1.firstChild,
                0,
                p1.firstChild,
                11,
            ]);
        });

        test("should not correct a triple click on collapse", () => {
            const [p1, div] = insertTestHtml("<p>abc def ghi</p><div><p>jkl mno pqr</p></div>");
            const p2 = div.firstChild;
            const range = document.createRange();
            range.setStart(p2, 0);
            range.setEnd(p2, 0);
            const result = getDeepRange(p1.parentElement, {
                range,
                select: true,
                correctTripleClick: true,
            });
            const { startContainer, startOffset, endContainer, endOffset } = result;
            expect([startContainer, startOffset, endContainer, endOffset]).toEqual([
                p2.firstChild,
                0,
                p2.firstChild,
                0,
            ]);
            const { anchorNode, anchorOffset, focusNode, focusOffset } = document.getSelection();
            expect([anchorNode, anchorOffset, focusNode, focusOffset]).toEqual([
                p2.firstChild,
                0,
                p2.firstChild,
                0,
            ]);
        });

        test("should limit the selection to the title text (nested)", () => {
            const [p] = insertTestHtml(
                `<p>
                    <span>
                        <font>title</font>
                    </span>
                </p>`
            );
            const span = p.childNodes[1];
            const whiteBeforeFont = span.childNodes[0];
            const title = span.childNodes[1].firstChild;
            const whiteAfterFont = span.childNodes[2];
            const range = document.createRange();
            range.setStart(whiteBeforeFont, 0);
            range.setEnd(whiteAfterFont, 10);
            const result = getDeepRange(p.parentElement, { range, select: true });
            const { startContainer, startOffset, endContainer, endOffset } = result;
            expect([startContainer, startOffset, endContainer, endOffset]).toEqual([
                title,
                0,
                title,
                5,
            ]);
            const { anchorNode, anchorOffset, focusNode, focusOffset } = document.getSelection();
            expect([anchorNode, anchorOffset, focusNode, focusOffset]).toEqual([
                title,
                0,
                title,
                5,
            ]);
        });

        test("should not limit the selection to the title text within p siblings", () => {
            const [p0, p1, p2] = insertTestHtml(
                `<p><br/></p><p>
                    <font>title</font>
                </p><p><br/></p>`
            );
            const range = document.createRange();
            range.setStart(p0, 0);
            range.setEnd(p2, 0);
            const result = getDeepRange(p1.parentElement, { range, select: true });
            const { startContainer, startOffset, endContainer, endOffset } = result;
            expect([startContainer, startOffset, endContainer, endOffset]).toEqual([p0, 0, p2, 0]);
            const { anchorNode, anchorOffset, focusNode, focusOffset } = document.getSelection();
            expect([anchorNode, anchorOffset, focusNode, focusOffset]).toEqual([p0, 0, p2, 0]);
        });
    });

    describe("backward", () => {
        test("should select the contents of an element", () => {
            const [p] = insertTestHtml(
                `<p>
                    <span><b><i><u>abc</u></i></b></span>
                </p>`
            );
            const abc = p.childNodes[1].firstChild.firstChild.firstChild.firstChild;
            setSelection(p, 2, p, 0, false);
            const result = getDeepRange(p.parentElement, { select: true });
            const { startContainer, startOffset, endContainer, endOffset } = result;
            expect([startContainer, startOffset, endContainer, endOffset]).toEqual([
                abc,
                0,
                abc,
                3,
            ]);
            const { anchorNode, anchorOffset, focusNode, focusOffset } = document.getSelection();
            expect([anchorNode, anchorOffset, focusNode, focusOffset]).toEqual([abc, 3, abc, 0]);
        });

        test("should make a complex selection", () => {
            const [p1, p2] = insertTestHtml(
                `<p>
                    ab<span>cd<b>ef</b>gh</span>ij
                </p><p>
                    kl<span>mn<b>op</b>qr</span>st
                </p>`
            );
            const span1 = p1.childNodes[1];
            const ef = span1.childNodes[1].firstChild;
            const st = p2.childNodes[2];
            setSelection(p2, 2, span1, 1, false);
            const result = getDeepRange(p1.parentElement, { select: true });
            const { startContainer, startOffset, endContainer, endOffset } = result;
            expect([startContainer, startOffset, endContainer, endOffset]).toEqual([ef, 0, st, 0]);
            const { anchorNode, anchorOffset, focusNode, focusOffset } = document.getSelection();
            expect([anchorNode, anchorOffset, focusNode, focusOffset]).toEqual([st, 0, ef, 0]);
        });
    });
});
