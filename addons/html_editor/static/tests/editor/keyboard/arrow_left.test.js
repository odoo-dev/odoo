/** @odoo-module */

import { test } from "@odoo/hoot";
import { dispatch } from "@odoo/hoot-dom";
import { setSelection, testEditor } from "../../helpers";

test.todo("should move past a zws (collapsed)", async () => {
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

test.todo("should select a zws backwards", async () => {
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

test.todo("should select a zws backwards (2)", async () => {
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

test.todo("should select a zws backwards (3)", async () => {
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

test.todo("should move out of a link", async () => {
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

test.todo("should move into a link", async () => {
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
