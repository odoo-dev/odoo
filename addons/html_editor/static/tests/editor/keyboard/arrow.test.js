/** @odoo-module */

import { test } from "@odoo/hoot";
import { dispatch } from "@odoo/hoot-dom";
import { setSelection, testEditor } from "../../helpers";
import { childNodeIndex } from "@html_editor/editor/utils/position";

// TODO @phoenix: we should maybe use it in each test ???
// Simulates placing the cursor at the editable root after an arrow key press
async function simulateArrowKeyPress(editor, key) {
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

test.todo("should move past a zws (collapsed - ArrowRight)", async () => {
    await testEditor({
        contentBefore: '<p>ab[]<span class="a">\u200B</span>cd</p>',
        stepFunction: async (editor) => {
            await dispatch(editor.editable, "keydown", { key: "ArrowRight" });
        },
        contentAfter: '<p>ab<span class="a">\u200B[]</span>cd</p>',
        // Final state: '<p>ab<span class="a">\u200B</span>c[]d</p>'
    });
    await testEditor({
        contentBefore: '<p>ab<span class="a">[]\u200B</span>cd</p>',
        stepFunction: async (editor) => {
            await dispatch(editor.editable, "keydown", { key: "ArrowRight" });
        },
        contentAfter: '<p>ab<span class="a">\u200B[]</span>cd</p>',
        // Final state: '<p>ab<span class="a">\u200B</span>c[]d</p>'
    });
});

test.todo("should move past a zws (collapsed - ArrowLeft)", async () => {
    await testEditor({
        contentBefore: '<p>ab<span class="a">\u200B[]</span>cd</p>',
        stepFunction: async (editor) => {
            await dispatch(editor.editable, "keydown", { key: "ArrowLeft" });
        },
        contentAfter: '<p>ab<span class="a">[]\u200B</span>cd</p>',
    });
    await testEditor({
        contentBefore: '<p>ab<span class="a">\u200B</span>[]cd</p>',
        stepFunction: async (editor) => {
            await dispatch(editor.editable, "keydown", { key: "ArrowLeft" });
        },
        contentAfter: '<p>ab<span class="a">[]\u200B</span>cd</p>',
    });
});

test.todo("should move past a zws (collapsed at the end of a block)", async () => {
    await testEditor({
        contentBefore: '<p>ab[]<span class="a">\u200B</span></p><p>cd</p>',
        stepFunction: async (editor) => {
            await dispatch(editor.editable, "keydown", { key: "ArrowRight" });
        },
        contentAfter: '<p>ab<span class="a">\u200B[]</span></p><p>cd</p>',
        // Final state: '<p>ab<span class="a">\u200B</span></p><p>[]cd</p>'
    });
    await testEditor({
        contentBefore: '<p>ab<span class="a">[]\u200B</span></p><p>cd</p>',
        stepFunction: async (editor) => {
            await dispatch(editor.editable, "keydown", { key: "ArrowRight" });
        },
        contentAfter: '<p>ab<span class="a">\u200B[]</span></p><p>cd</p>',
        // Final state: '<p>ab<span class="a">\u200B</span></p><p>[]cd</p>'
    });
});

test.todo("should select a zws", async () => {
    await testEditor({
        contentBefore: '<p>[ab]<span class="a">\u200B</span>cd</p>',
        stepFunction: async (editor) => {
            await dispatch(editor.editable, "keydown", { key: "ArrowRight", shiftKey: true });
        },
        contentAfter: '<p>[ab<span class="a">\u200B]</span>cd</p>',
        // Final state: '<p>[ab<span class="a">\u200B</span>c]d</p>'
    });
    await testEditor({
        contentBefore: '<p>[ab<span class="a">]\u200B</span>cd</p>',
        stepFunction: async (editor) => {
            await dispatch(editor.editable, "keydown", { key: "ArrowRight", shiftKey: true });
        },
        contentAfter: '<p>[ab<span class="a">\u200B]</span>cd</p>',
        // Final state: '<p>[ab<span class="a">\u200B</span>c]d</p>'
    });
});

test.todo("should select a zws (2)", async () => {
    await testEditor({
        contentBefore: '<p>a[b]<span class="a">\u200B</span>cd</p>',
        stepFunction: async (editor) => {
            await dispatch(editor.editable, "keydown", { key: "ArrowRight", shiftKey: true });
        },
        contentAfter: '<p>a[b<span class="a">\u200B]</span>cd</p>',
        // Final state: '<p>a[b<span class="a">\u200B</span>c]d</p>'
    });
    await testEditor({
        contentBefore: '<p>a[b<span class="a">]\u200B</span>cd</p>',
        stepFunction: async (editor) => {
            await dispatch(editor.editable, "keydown", { key: "ArrowRight", shiftKey: true });
        },
        contentAfter: '<p>a[b<span class="a">\u200B]</span>cd</p>',
        // Final state: '<p>a[b<span class="a">\u200B</span>c]d</p>'
    });
});

test.todo("should select a zws (3)", async () => {
    await testEditor({
        contentBefore: '<p>ab[]<span class="a">\u200B</span>cd</p>',
        stepFunction: async (editor) => {
            await dispatch(editor.editable, "keydown", { key: "ArrowRight", shiftKey: true });
        },
        contentAfter: '<p>ab[<span class="a">\u200B]</span>cd</p>',
        // Final state: '<p>ab[<span class="a">\u200B</span>c]d</p>'
    });
    await testEditor({
        contentBefore: '<p>ab<span class="a">[]\u200B</span>cd</p>',
        stepFunction: async (editor) => {
            await dispatch(editor.editable, "keydown", { key: "ArrowRight", shiftKey: true });
        },
        contentAfter: '<p>ab<span class="a">[\u200B]</span>cd</p>',
        // Final state: '<p>ab<span class="a">[\u200B</span>c]d</p>'
    });
});

test.todo("should select a zws backwards (ArrowLeft)", async () => {
    await testEditor({
        contentBefore: '<p>ab<span class="a">\u200B[]</span>cd</p>',
        stepFunction: async (editor) => {
            await dispatch(editor.editable, "keydown", { key: "ArrowLeft", shiftKey: true });
        },
        contentAfter: '<p>ab<span class="a">]\u200B[</span>cd</p>',
        // Final state: '<p>a]b<span class="a">\u200B[</span>cd</p>'
    });
    await testEditor({
        contentBefore: '<p>ab<span class="a">\u200B</span>[]cd</p>',
        stepFunction: async (editor) => {
            await dispatch(editor.editable, "keydown", { key: "ArrowLeft", shiftKey: true });
        },
        contentAfter: '<p>ab<span class="a">]\u200B[</span>cd</p>',
        // Final state: '<p>a]b<span class="a">\u200B[</span>cd</p>'
    });
});

test.todo("should select a zws backwards (ArrowLeft - 2)", async () => {
    await testEditor({
        contentBefore: '<p>ab<span class="a">\u200B</span>]cd[</p>',
        stepFunction: async (editor) => {
            await dispatch(editor.editable, "keydown", { key: "ArrowLeft", shiftKey: true });
        },
        contentAfter: '<p>ab<span class="a">]\u200B</span>cd[</p>',
        // Final state: '<p>a]b<span class="a">\u200B</span>cd[</p>'
    });
    await testEditor({
        contentBefore: '<p>ab<span class="a">\u200B]</span>cd[</p>',
        stepFunction: async (editor) => {
            await dispatch(editor.editable, "keydown", { key: "ArrowLeft", shiftKey: true });
        },
        contentAfter: '<p>ab<span class="a">]\u200B</span>cd[</p>',
        // Final state: '<p>a]b<span class="a">\u200B</span>cd[</p>'
    });
});

test.todo("should select a zws backwards (ArrowLeft - 3)", async () => {
    await testEditor({
        contentBefore: '<p>ab<span class="a">\u200B</span>]c[d</p>',
        stepFunction: async (editor) => {
            await dispatch(editor.editable, "keydown", { key: "ArrowLeft", shiftKey: true });
        },
        contentAfter: '<p>ab<span class="a">]\u200B</span>c[d</p>',
        // Final state: '<p>a]b<span class="a">\u200B</span>c[d</p>'
    });
    await testEditor({
        contentBefore: '<p>ab<span class="a">\u200B]</span>c[d</p>',
        stepFunction: async (editor) => {
            await dispatch(editor.editable, "keydown", { key: "ArrowLeft", shiftKey: true });
        },
        contentAfter: '<p>ab<span class="a">]\u200B</span>c[d</p>',
        // Final state: '<p>a]b<span class="a">\u200B</span>c[d</p>'
    });
});

test.todo("should select a zws backwards (ArrowRight)", async () => {
    await testEditor({
        contentBefore: '<p>ab<span class="a">]\u200B[</span>cd</p>',
        stepFunction: async (editor) => {
            await dispatch(editor.editable, "keydown", { key: "ArrowRight", shiftKey: true });
        },
        contentAfter: '<p>ab<span class="a">\u200B[]</span>cd</p>',
        // Final state: '<p>ab<span class="a">\u200B</span>[c]d</p>'
    });
    await testEditor({
        contentBefore: '<p>ab<span class="a">]\u200B</span>[cd</p>',
        stepFunction: async (editor) => {
            await dispatch(editor.editable, "keydown", { key: "ArrowRight", shiftKey: true });
        },
        contentAfter: '<p>ab<span class="a">\u200B[]</span>cd</p>',
        // Final state: '<p>ab<span class="a">\u200B</span>[c]d</p>'
    });
    await testEditor({
        contentBefore: '<p>ab]<span class="a">\u200B</span>[cd</p>',
        stepFunction: async (editor) => {
            await dispatch(editor.editable, "keydown", { key: "ArrowRight", shiftKey: true });
        },
        contentAfter: '<p>ab<span class="a">\u200B[]</span>cd</p>',
        // Final state: '<p>ab<span class="a">\u200B</span>[c]d</p>'
    });
    await testEditor({
        contentBefore: '<p>ab]<span class="a">\u200B[</span>cd</p>',
        stepFunction: async (editor) => {
            await dispatch(editor.editable, "keydown", { key: "ArrowRight", shiftKey: true });
        },
        contentAfter: '<p>ab<span class="a">\u200B[]</span>cd</p>',
        // Final state: '<p>ab<span class="a">\u200B</span>[c]d</p>'
    });
});

test.todo("should select a zws backwards (ArrowRight - 2)", async () => {
    await testEditor({
        contentBefore: '<p>ab<span class="a">]\u200B</span>c[d</p>',
        stepFunction: async (editor) => {
            await dispatch(editor.editable, "keydown", { key: "ArrowRight", shiftKey: true });
        },
        contentAfter: '<p>ab<span class="a">\u200B]</span>c[d</p>',
        // Final state: '<p>ab<span class="a">\u200B</span>c[]d</p>'
    });
    await testEditor({
        contentBefore: '<p>ab]<span class="a">\u200B</span>c[d</p>',
        stepFunction: async (editor) => {
            await dispatch(editor.editable, "keydown", { key: "ArrowRight", shiftKey: true });
        },
        contentAfter: '<p>ab<span class="a">\u200B]</span>c[d</p>',
        // Final state: '<p>ab<span class="a">\u200B</span>c[]d</p>'
    });
});

test.todo("should deselect a zws", async () => {
    await testEditor({
        contentBefore: '<p>ab<span class="a">[\u200B]</span>cd</p>',
        stepFunction: async (editor) => {
            await dispatch(editor.editable, "keydown", { key: "ArrowLeft", shiftKey: true });
        },
        contentAfter: '<p>ab<span class="a">[]\u200B</span>cd</p>',
        // Final state: '<p>a]b<span class="a">[\u200B</span>cd</p>'
    });
    await testEditor({
        contentBefore: '<p>ab<span class="a">[\u200B</span>]cd</p>',
        stepFunction: async (editor) => {
            await dispatch(editor.editable, "keydown", { key: "ArrowLeft", shiftKey: true });
        },
        contentAfter: '<p>ab<span class="a">[]\u200B</span>cd</p>',
        // Final state: '<p>a]b<span class="a">[\u200B</span>cd</p>'
    });
    await testEditor({
        contentBefore: '<p>ab[<span class="a">\u200B]</span>cd</p>',
        stepFunction: async (editor) => {
            await dispatch(editor.editable, "keydown", { key: "ArrowLeft", shiftKey: true });
        },
        contentAfter: '<p>ab[<span class="a">]\u200B</span>cd</p>',
        // Final state: '<p>a]b[<span class="a">\u200B</span>cd</p>'
    });
    await testEditor({
        contentBefore: '<p>ab[<span class="a">\u200B</span>]cd</p>',
        stepFunction: async (editor) => {
            await dispatch(editor.editable, "keydown", { key: "ArrowLeft", shiftKey: true });
        },
        contentAfter: '<p>ab[<span class="a">]\u200B</span>cd</p>',
        // Final state: '<p>a]b[<span class="a">\u200B</span>cd</p>'
    });
});

test.todo("should deselect a zws (2)", async () => {
    await testEditor({
        contentBefore: '<p>a[b<span class="a">\u200B]</span>cd</p>',
        stepFunction: async (editor) => {
            await dispatch(editor.editable, "keydown", { key: "ArrowLeft", shiftKey: true });
        },
        contentAfter: '<p>a[b<span class="a">]\u200B</span>cd</p>',
        // Final state: '<p>a[]b<span class="a">\u200B</span>cd</p>'
    });
    await testEditor({
        contentBefore: '<p>a[b<span class="a">\u200B</span>]cd</p>',
        stepFunction: async (editor) => {
            await dispatch(editor.editable, "keydown", { key: "ArrowLeft", shiftKey: true });
        },
        contentAfter: '<p>a[b<span class="a">]\u200B</span>cd</p>',
        // Final state: '<p>a[]b<span class="a">\u200B</span>cd</p>'
    });
});

test.todo("should move into a link (ArrowRight)", async () => {
    await testEditor({
        contentBefore: '<p>ab[]<a href="#">cd</a>ef</p>',
        contentBeforeEdit:
            "<p>ab[]" +
            '<a href="#">' +
            '<span data-o-link-zws="start" contenteditable="false">\u200B</span>' + // start zws
            "cd" + // content
            // end zws is only there if the selection is in the link
            "</a>" +
            '<span data-o-link-zws="after" contenteditable="false">\u200B</span>' + // after zws
            "ef</p>",
        stepFunction: async (editor) => {
            // TODO @phoenix: should use simulateArrowKeyPress
            dispatch(editor.editable, "keydown", { key: "ArrowRight" });
            // Set the selection to mimick that which keydown would
            // have set, were it not blocked when triggered
            // programmatically.
            const cd = editor.editable.querySelector("a").childNodes[1];
            setSelection(
                {
                    anchorNode: cd,
                    anchorOffset: 0,
                    focusNode: cd,
                    focusOffset: 0,
                },
                editor.document
            );
        },
        contentAfterEdit:
            "<p>ab" +
            '<a href="#" class="o_link_in_selection">' +
            '<span data-o-link-zws="start" contenteditable="false">\u200B</span>' + // start zws
            "[]cd" + // content
            '<span data-o-link-zws="end">\u200B</span>' + // end zws
            "</a>" +
            '<span data-o-link-zws="after" contenteditable="false">\u200B</span>' + // after zws
            "ef</p>",
        contentAfter: '<p>ab<a href="#">[]cd</a>ef</p>',
    });
});

test.todo("should move into a link (ArrowLeft)", async () => {
    await testEditor({
        contentBefore: '<p>ab<a href="#">cd</a>[]ef</p>',
        contentBeforeEdit:
            "<p>ab" +
            '<a href="#">' +
            '<span data-o-link-zws="start" contenteditable="false">\u200B</span>' + // start zws
            "cd" + // content
            // end zws is only there if the selection is in the link
            "</a>" +
            '<span data-o-link-zws="after" contenteditable="false">\u200B</span>' + // after zws
            "[]ef</p>",
        stepFunction: async (editor) => {
            dispatch(editor.editable, "keydown", { key: "ArrowLeft" });
            // Set the selection to mimick that which keydown would
            // have set, were it not blocked when triggered
            // programmatically.
            const cd = editor.editable.querySelector("a").childNodes[1];
            setSelection(
                {
                    anchorNode: cd,
                    anchorOffset: 2,
                    focusNode: cd,
                    focusOffset: 2,
                },
                editor.document
            );
        },
        contentAfterEdit:
            "<p>ab" +
            '<a href="#" class="o_link_in_selection">' +
            '<span data-o-link-zws="start" contenteditable="false">\u200B</span>' + // start zws
            "cd[]" + // content
            '<span data-o-link-zws="end">\u200B</span>' + // end zws
            "</a>" +
            '<span data-o-link-zws="after" contenteditable="false">\u200B</span>' + // after zws
            "ef</p>",
        contentAfter: '<p>ab<a href="#">cd[]</a>ef</p>',
    });
});

test.todo("should move out of a link (ArrowRight)", async () => {
    await testEditor({
        contentBefore: '<p>ab<a href="#">cd[]</a>ef</p>',
        contentBeforeEdit:
            "<p>ab" +
            '<a href="#" class="o_link_in_selection">' +
            '<span data-o-link-zws="start" contenteditable="false">\u200B</span>' + // start zws
            "cd[]" + // content
            '<span data-o-link-zws="end">\u200B</span>' + // end zws
            "</a>" +
            '<span data-o-link-zws="after" contenteditable="false">\u200B</span>' + // after zws
            "ef</p>",
        stepFunction: async (editor) => {
            // TODO @phoenix: should use simulateArrowKeyPress

            dispatch(editor.editable, "keydown", { key: "ArrowRight" });
            // Set the selection to mimick that which keydown would
            // have set, were it not blocked when triggered
            // programmatically.
            const endZws = editor.editable.querySelector('a > span[data-o-link-zws="end"]');
            setSelection(
                {
                    anchorNode: endZws,
                    anchorOffset: 1,
                    focusNode: endZws,
                    focusOffset: 1,
                },
                editor.document
            );
        },
        contentAfterEdit:
            "<p>ab" +
            '<a href="#" class="">' +
            '<span data-o-link-zws="start" contenteditable="false">\u200B</span>' + // start zws
            "cd" + // content
            // end zws is only there if the selection is in the link
            "</a>" +
            '<span data-o-link-zws="after" contenteditable="false">\u200B</span>' + // after zws
            "[]ef</p>",
        contentAfter: '<p>ab<a href="#">cd</a>[]ef</p>',
    });
});

test.todo("should move out of a link (ArrowLeft)", async () => {
    await testEditor({
        contentBefore: '<p>ab<a href="#">[]cd</a>ef</p>',
        contentBeforeEdit:
            "<p>ab" +
            '<a href="#" class="o_link_in_selection">' +
            '<span data-o-link-zws="start" contenteditable="false">\u200B</span>' + // start zws
            "[]cd" + // content
            '<span data-o-link-zws="end">\u200B</span>' + // end zws
            "</a>" +
            '<span data-o-link-zws="after" contenteditable="false">\u200B</span>' + // after zws
            "ef</p>",
        stepFunction: async (editor) => {
            // TODO @phoenix: should use simulateArrowKeyPress

            dispatch(editor.editable, "keydown", { key: "ArrowLeft" });
            // Set the selection to mimick that which keydown would
            // have set, were it not blocked when triggered
            // programmatically.
            const ab = editor.editable.querySelector("p").firstChild;
            setSelection(
                {
                    anchorNode: ab,
                    anchorOffset: 2,
                    focusNode: ab,
                    focusOffset: 2,
                },
                editor.document
            );
        },
        contentAfterEdit:
            "<p>ab[]" +
            '<a href="#" class="">' +
            '<span data-o-link-zws="start" contenteditable="false">\u200B</span>' + // start zws
            "cd" + // content
            // end zws is only there if the selection is in the link
            "</a>" +
            '<span data-o-link-zws="after" contenteditable="false">\u200B</span>' + // after zws
            "ef</p>",
        contentAfter: '<p>ab[]<a href="#">cd</a>ef</p>',
    });
});

test.todo("should place cursor in the table below", async () => {
    await testEditor({
        contentBefore:
            "<table><tbody><tr><td><p>a</p><p>b[]</p></td></tr></tbody></table>" +
            "<table><tbody><tr><td><p>c</p><p>d</p></td></tr></tbody></table>",
        stepFunction: async (editor) => simulateArrowKeyPress(editor, "ArrowRight"),
        contentAfter:
            "<table><tbody><tr><td><p>a</p><p>b</p></td></tr></tbody></table>" +
            "<table><tbody><tr><td><p>[]c</p><p>d</p></td></tr></tbody></table>",
    });
});

test.todo("should place cursor in the table above", async () => {
    await testEditor({
        contentBefore:
            "<table><tbody><tr><td><p>a</p><p>b</p></td></tr></tbody></table>" +
            "<table><tbody><tr><td><p>[]c</p><p>d</p></td></tr></tbody></table>",
        stepFunction: async (editor) => simulateArrowKeyPress(editor, "ArrowLeft"),
        contentAfter:
            "<table><tbody><tr><td><p>a</p><p>b[]</p></td></tr></tbody></table>" +
            "<table><tbody><tr><td><p>c</p><p>d</p></td></tr></tbody></table>",
    });
});

test.todo("should place cursor in the paragraph below", async () => {
    await testEditor({
        contentBefore:
            "<table><tbody><tr><td><p>a</p><p>b[]</p></td></tr></tbody></table>" + "<p><br></p>",
        stepFunction: async (editor) => simulateArrowKeyPress(editor, "ArrowRight"),
        contentAfter:
            "<table><tbody><tr><td><p>a</p><p>b</p></td></tr></tbody></table>" + "<p>[]<br></p>",
    });
});

test.todo("should place cursor in the paragraph above", async () => {
    await testEditor({
        contentBefore:
            "<p><br></p>" + "<table><tbody><tr><td><p>[]a</p><p>b</p></td></tr></tbody></table>",
        stepFunction: async (editor) => simulateArrowKeyPress(editor, "ArrowLeft"),
        contentAfter:
            "<p>[]<br></p>" + "<table><tbody><tr><td><p>a</p><p>b</p></td></tr></tbody></table>",
    });
});

test.todo(
    "should keep cursor at the same position (avoid reaching the editable root)",
    async () => {
        await testEditor({
            contentBefore: "<table><tbody><tr><td><p>a</p><p>b[]</p></td></tr></tbody></table>",
            stepFunction: async (editor) => simulateArrowKeyPress(editor, "ArrowRight"),
            contentAfter: "<table><tbody><tr><td><p>a</p><p>b[]</p></td></tr></tbody></table>",
        });
        await testEditor({
            contentBefore: "<table><tbody><tr><td><p>[]a</p><p>b</p></td></tr></tbody></table>",
            stepFunction: async (editor) => simulateArrowKeyPress(editor, "ArrowLeft"),
            contentAfter: "<table><tbody><tr><td><p>[]a</p><p>b</p></td></tr></tbody></table>",
        });
    }
);

test.todo("should place cursor after the second separator", async () => {
    await testEditor({
        contentBefore:
            '<p>[]<br></p><hr contenteditable="false">' + '<hr contenteditable="false"><p><br></p>',
        stepFunction: async (editor) => simulateArrowKeyPress(editor, "ArrowRight"),
        contentAfter:
            '<p><br></p><hr contenteditable="false">' + '<hr contenteditable="false"><p>[]<br></p>',
    });
});

test.todo("should place cursor before the first separator", async () => {
    await testEditor({
        contentBefore:
            '<p><br></p><hr contenteditable="false">' + '<hr contenteditable="false"><p>[]<br></p>',
        stepFunction: async (editor) => simulateArrowKeyPress(editor, "ArrowLeft"),
        contentAfter:
            '<p>[]<br></p><hr contenteditable="false">' + '<hr contenteditable="false"><p><br></p>',
    });
});
