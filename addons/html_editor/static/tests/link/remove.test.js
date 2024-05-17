import { describe, test } from "@odoo/hoot";
import { testEditor } from "../_helpers/editor";
import { unlink } from "../_helpers/user_actions";

describe("range collapsed", () => {
    test("should remove the link if collapsed range at the end of a link", async () => {
        await testEditor({
            contentBefore: '<p>a<a href="exist">bcd[]</a>e</p>',
            stepFunction: async (editor) => {
                await unlink(editor);
            },
            contentAfter: "<p>abcd[]e</p>",
        });
        // With fontawesome at the start of the link.
        await testEditor({
            contentBefore:
                '<p>a<a href="exist"><span class="fa fa-music" contenteditable="false">\u200B</span>bcd[]</a>e</p>',
            stepFunction: async (editor) => {
                await unlink(editor);
            },
            contentAfterEdit:
                '<p>a<span class="fa fa-music" contenteditable="false">\u200B</span>bcd[]e</p>',
        });
        // With fontawesome at the middle of the link.
        await testEditor({
            contentBefore:
                '<p>a<a href="exist">bc<span class="fa fa-music" contenteditable="false">\u200B</span>d[]</a>e</p>',
            stepFunction: async (editor) => {
                await unlink(editor);
            },
            contentAfterEdit:
                '<p>abc<span class="fa fa-music" contenteditable="false">\u200B</span>d[]e</p>',
        });
        // With fontawesome at the end of the link.
        await testEditor({
            contentBefore:
                '<p>a<a href="exist">bcd[]<span class="fa fa-music" contenteditable="false">\u200B</span></a>e</p>',
            stepFunction: async (editor) => {
                await unlink(editor);
            },
            contentAfterEdit:
                '<p>abcd[]<span class="fa fa-music" contenteditable="false">\u200B</span>e</p>',
        });
    });

    test("should remove the link if collapsed range in the middle a link", async () => {
        await testEditor({
            contentBefore: '<p>a<a href="exist">b[]cd</a>e</p>',
            stepFunction: async (editor) => {
                await unlink(editor);
            },
            contentAfter: "<p>ab[]cde</p>",
        });
        // With fontawesome at the start of the link.
        await testEditor({
            contentBefore:
                '<p>a<a href="exist"><span class="fa fa-music" contenteditable="false">\u200B</span>b[]cd</a>e</p>',
            stepFunction: async (editor) => {
                await unlink(editor);
            },
            contentAfterEdit:
                '<p>a<span class="fa fa-music" contenteditable="false">\u200B</span>b[]cde</p>',
        });
        // With fontawesome at the middle of the link.
        await testEditor({
            contentBefore:
                '<p>a<a href="exist">b[]c<span class="fa fa-music" contenteditable="false">\u200B</span>d</a>e</p>',
            stepFunction: async (editor) => {
                await unlink(editor);
            },
            contentAfterEdit:
                '<p>ab[]c<span class="fa fa-music" contenteditable="false">\u200B</span>de</p>',
        });
        // With fontawesome at the end of the link.
        await testEditor({
            contentBefore:
                '<p>a<a href="exist">b[]cd<span class="fa fa-music" contenteditable="false">\u200B</span></a>e</p>',
            stepFunction: async (editor) => {
                await unlink(editor);
            },
            contentAfterEdit:
                '<p>ab[]cd<span class="fa fa-music" contenteditable="false">\u200B</span>e</p>',
        });
    });

    test("should remove the link if collapsed range at the start of a link", async () => {
        await testEditor({
            contentBefore: '<p>a<a href="exist">[]bcd</a>e</p>',
            stepFunction: async (editor) => {
                await unlink(editor);
            },
            contentAfter: "<p>a[]bcde</p>",
        });
        // With fontawesome at the start of the link.
        await testEditor({
            contentBefore:
                '<p>a<a href="exist"><span class="fa fa-music" contenteditable="false">\u200B</span>[]bcd</a>e</p>',
            stepFunction: async (editor) => {
                await unlink(editor);
            },
            contentAfterEdit:
                '<p>a<span class="fa fa-music" contenteditable="false">\u200B</span>[]bcde</p>',
        });
        // With fontawesome at the middle of the link.
        await testEditor({
            contentBefore:
                '<p>a<a href="exist">[]bc<span class="fa fa-music" contenteditable="false">\u200B</span>d</a>e</p>',
            stepFunction: async (editor) => {
                await unlink(editor);
            },
            contentAfterEdit:
                '<p>a[]bc<span class="fa fa-music" contenteditable="false">\u200B</span>de</p>',
        });
        // With fontawesome at the end of the link.
        await testEditor({
            contentBefore:
                '<p>a<a href="exist">[]bcd<span class="fa fa-music" contenteditable="false">\u200B</span></a>e</p>',
            stepFunction: async (editor) => {
                await unlink(editor);
            },
            contentAfterEdit:
                '<p>a[]bcd<span class="fa fa-music" contenteditable="false">\u200B</span>e</p>',
        });
    });

    test("should remove only the current link if collapsed range in the middle of a link", async () => {
        await testEditor({
            contentBefore:
                '<p><a href="exist">a</a>b<a href="exist">c[]d</a>e<a href="exist">f</a></p>',
            stepFunction: async (editor) => {
                await unlink(editor);
            },
            contentAfter: '<p><a href="exist">a</a>bc[]de<a href="exist">f</a></p>',
        });
        // With fontawesome at the start of the link.
        await testEditor({
            contentBefore:
                '<p><a href="exist">a</a>b<a href="exist"><span class="fa fa-music" contenteditable="false">\u200B</span>c[]d</a>e<a href="exist">f</a></p>',
            stepFunction: async (editor) => {
                await unlink(editor);
            },
            contentAfterEdit:
                '<p><a href="exist">a</a>b<span class="fa fa-music" contenteditable="false">\u200B</span>c[]de<a href="exist">f</a></p>',
        });
        // With fontawesome at the middle of the link.
        await testEditor({
            contentBefore:
                '<p><a href="exist">a</a>b<a href="exist">c<span class="fa fa-music" contenteditable="false">\u200B</span>d[]e</a>f<a href="exist">g</a></p>',
            stepFunction: async (editor) => {
                await unlink(editor);
            },
            contentAfterEdit:
                '<p><a href="exist">a</a>bc<span class="fa fa-music" contenteditable="false">\u200B</span>d[]ef<a href="exist">g</a></p>',
        });
        // With fontawesome at the end of the link.
        await testEditor({
            contentBefore:
                '<p><a href="exist">a</a>b<a href="exist">c[]d<span class="fa fa-music" contenteditable="false">\u200B</span></a>e<a href="exist">f</a></p>',
            stepFunction: async (editor) => {
                await unlink(editor);
            },
            contentAfterEdit:
                '<p><a href="exist">a</a>bc[]d<span class="fa fa-music" contenteditable="false">\u200B</span>e<a href="exist">f</a></p>',
        });
    });
});

describe("range not collapsed", () => {
    test("should remove the link in the selected range at the end of a link", async () => {
        // FORWARD
        await testEditor({
            contentBefore: '<p>a<a href="exist">bc[d]</a>e</p>',
            stepFunction: async (editor) => {
                await unlink(editor);
            },
            contentAfter: '<p>a<a href="exist">bc</a>[d]e</p>',
        });
        // BACKWARD
        await testEditor({
            contentBefore: '<p>a<a href="exist">bc]d[</a>e</p>',
            stepFunction: async (editor) => {
                await unlink(editor);
            },
            contentAfter: '<p>a<a href="exist">bc</a>]d[e</p>',
        });
    });

    test("should remove the link in the selected range in the middle of a link", async () => {
        // FORWARD
        await testEditor({
            contentBefore: '<p>a<a href="exist">b[c]d</a>e</p>',
            stepFunction: async (editor) => {
                await unlink(editor);
            },
            contentAfter: '<p>a<a href="exist">b</a>[c]<a href="exist">d</a>e</p>',
        });
        // BACKWARD
        await testEditor({
            contentBefore: '<p>a<a href="exist">b]c[d</a>e</p>',
            stepFunction: async (editor) => {
                await unlink(editor);
            },
            contentAfter: '<p>a<a href="exist">b</a>]c[<a href="exist">d</a>e</p>',
        });
    });

    test("should remove the link in the selected range at the start of a link", async () => {
        // FORWARD
        await testEditor({
            contentBefore: '<p>a<a href="exist">[b]cd</a>e</p>',
            stepFunction: async (editor) => {
                await unlink(editor);
            },
            contentAfter: '<p>a[b]<a href="exist">cd</a>e</p>',
        });
        // BACKWARD
        await testEditor({
            contentBefore: '<p>a<a href="exist">]b[cd</a>e</p>',
            stepFunction: async (editor) => {
                await unlink(editor);
            },
            contentAfter: '<p>a]b[<a href="exist">cd</a>e</p>',
        });
    });

    test("should remove the link in the selected range overlapping the end of a link", async () => {
        // FORWARD
        await testEditor({
            contentBefore: '<p>a<a href="exist">bc[d</a>e]f</p>',
            stepFunction: async (editor) => {
                await unlink(editor);
            },
            contentAfter: '<p>a<a href="exist">bc</a>[de]f</p>',
        });
        // BACKWARD
        await testEditor({
            contentBefore: '<p>a<a href="exist">bc]d</a>e[f</p>',
            stepFunction: async (editor) => {
                await unlink(editor);
            },
            contentAfter: '<p>a<a href="exist">bc</a>]de[f</p>',
        });
    });

    test("should remove the link in the selected range overlapping the start of a link", async () => {
        // FORWARD
        await testEditor({
            contentBefore: '<p>a[b<a href="exist">c]de</a>f</p>',
            stepFunction: async (editor) => {
                await unlink(editor);
            },
            contentAfter: '<p>a[bc]<a href="exist">de</a>f</p>',
        });
        // BACKWARD
        await testEditor({
            contentBefore: '<p>a]b<a href="exist">c[de</a>f</p>',
            stepFunction: async (editor) => {
                await unlink(editor);
            },
            contentAfter: '<p>a]bc[<a href="exist">de</a>f</p>',
        });
    });

    test("should not unlink selected non-editable links", async () => {
        await testEditor({
            contentBefore:
                '<p><a href="exist">[ab</a><a contenteditable="false" href="exist">cd</a>ef]</p>',
            stepFunction: async (editor) => {
                await unlink(editor);
            },
            contentAfter: '<p>[ab<a contenteditable="false" href="exist">cd</a>ef]</p>',
        });
    });
});
