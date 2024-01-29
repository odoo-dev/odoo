/** @odoo-module */

import { describe, test } from "@odoo/hoot";
import { testEditor } from "../test_helpers/editor";

function setTag(tagName) {
    return (editor) => editor.dispatch("SET_TAG", { tagName });
}

describe("to paragraph", () => {
    test("should turn a heading 1 into a paragraph", async () => {
        await testEditor({
            contentBefore: "<h1>ab[]cd</h1>",
            stepFunction: setTag("p"),
            contentAfter: "<p>ab[]cd</p>",
        });
    });

    test.todo("should turn a heading 1 into a paragraph (character selected)", async () => {
        await testEditor({
            contentBefore: "<h1>a[b]c</h1>",
            stepFunction: setTag("p"),
            contentAfter: "<p>a[b]c</p>",
        });
    });

    test.todo(
        "should turn a heading 1, a paragraph and a heading 2 into three paragraphs",
        async () => {
            await testEditor({
                contentBefore: "<h1>a[b</h1><p>cd</p><h2>e]f</h2>",
                stepFunction: setTag("p"),
                contentAfter: "<p>a[b</p><p>cd</p><p>e]f</p>",
            });
        }
    );

    test.skip("should turn a heading 1 into a paragraph after a triple click", async () => {
        await testEditor({
            contentBefore: "<h1>[ab</h1><h2>]cd</h2>",
            stepFunction: setTag("p"),
            contentAfter: "<p>[ab</p><h2>]cd</h2>",
        });
    });

    test.todo("should not turn a div into a paragraph", async () => {
        await testEditor({
            contentBefore: "<div>[ab]</div>",
            stepFunction: setTag("p"),
            contentAfter: "<div><p>[ab]</p></div>",
        });
    });

    test.todo(
        "should not add paragraph tag when selection is changed to normal in list",
        async () => {
            await testEditor({
                contentBefore: "<ul><li><h1>[abcd]</h1></li></ul>",
                stepFunction: setTag("p"),
                contentAfter: `<ul><li>[abcd]</li></ul>`,
            });
        }
    );

    test.todo("should not add paragraph tag to normal text in list", async () => {
        await testEditor({
            contentBefore: "<ul><li>[abcd]</li></ul>",
            stepFunction: setTag("p"),
            contentAfter: `<ul><li>[abcd]</li></ul>`,
        });
    });

    test.todo(
        "should turn three table cells with heading 1 to table cells with paragraph",
        async () => {
            await testEditor({
                contentBefore:
                    "<table><tbody><tr><td><h1>[a</h1></td><td><h1>b</h1></td><td><h1>c]</h1></td></tr></tbody></table>",
                stepFunction: setTag("p"),
                // The custom table selection is removed in cleanForSave and the selection is collapsed.
                contentAfter:
                    "<table><tbody><tr><td><p>[]a</p></td><td><p>b</p></td><td><p>c</p></td></tr></tbody></table>",
            });
        }
    );

    test.todo("should not set the tag of non-editable elements", async () => {
        await testEditor({
            contentBefore:
                '<h1>[before</h1><h1 contenteditable="false">noneditable</h1><h1>after]</h1>',
            stepFunction: setTag("p"),
            contentAfter: '<p>[before</p><h1 contenteditable="false">noneditable</h1><p>after]</p>',
        });
    });
});

describe("to heading 1", () => {
    test("should turn a paragraph into a heading 1", async () => {
        await testEditor({
            contentBefore: "<p>ab[]cd</p>",
            stepFunction: setTag("h1"),
            contentAfter: "<h1>ab[]cd</h1>",
        });
    });

    test.todo("should turn a paragraph into a heading 1 (character selected)", async () => {
        await testEditor({
            contentBefore: "<p>a[b]c</p>",
            stepFunction: setTag("h1"),
            contentAfter: "<h1>a[b]c</h1>",
        });
    });

    test.todo(
        "should turn a paragraph, a heading 1 and a heading 2 into three headings 1",
        async () => {
            await testEditor({
                contentBefore: "<p>a[b</p><h1>cd</h1><h2>e]f</h2>",
                stepFunction: setTag("h1"),
                contentAfter: "<h1>a[b</h1><h1>cd</h1><h1>e]f</h1>",
            });
        }
    );

    test.skip("should turn a paragraph into a heading 1 after a triple click", async () => {
        await testEditor({
            contentBefore: "<p>[ab</p><h2>]cd</h2>",
            stepFunction: setTag("h1"),
            contentAfter: "<h1>[ab</h1><h2>]cd</h2>",
        });
    });

    test.todo("should not turn a div into a heading 1", async () => {
        await testEditor({
            contentBefore: "<div>[ab]</div>",
            stepFunction: setTag("h1"),
            contentAfter: "<div><h1>[ab]</h1></div>",
        });
    });

    test.todo(
        "should turn three table cells with paragraph to table cells with heading 1",
        async () => {
            await testEditor({
                contentBefore:
                    "<table><tbody><tr><td><p>[a</p></td><td><p>b</p></td><td><p>c]</p></td></tr></tbody></table>",
                stepFunction: setTag("h1"),
                // The custom table selection is removed in cleanForSave and the selection is collapsed.
                contentAfter:
                    "<table><tbody><tr><td><h1>[]a</h1></td><td><h1>b</h1></td><td><h1>c</h1></td></tr></tbody></table>",
            });
        }
    );
});

describe("to heading 2", () => {
    test("should turn a heading 1 into a heading 2", async () => {
        await testEditor({
            contentBefore: "<h1>ab[]cd</h1>",
            stepFunction: setTag("h2"),
            contentAfter: "<h2>ab[]cd</h2>",
        });
    });

    test.todo("should turn a heading 1 into a heading 2 (character selected)", async () => {
        await testEditor({
            contentBefore: "<h1>a[b]c</h1>",
            stepFunction: setTag("h2"),
            contentAfter: "<h2>a[b]c</h2>",
        });
    });

    test.todo(
        "should turn a heading 1, a heading 2 and a paragraph into three headings 2",
        async () => {
            await testEditor({
                contentBefore: "<h1>a[b</h1><h2>cd</h2><p>e]f</p>",
                stepFunction: setTag("h2"),
                contentAfter: "<h2>a[b</h2><h2>cd</h2><h2>e]f</h2>",
            });
        }
    );

    test.skip("should turn a paragraph into a heading 2 after a triple click", async () => {
        await testEditor({
            contentBefore: "<p>[ab</p><h1>]cd</h1>",
            stepFunction: setTag("h2"),
            contentAfter: "<h2>[ab</h2><h1>]cd</h1>",
        });
    });

    test.todo("should not turn a div into a heading 2", async () => {
        await testEditor({
            contentBefore: "<div>[ab]</div>",
            stepFunction: setTag("h2"),
            contentAfter: "<div><h2>[ab]</h2></div>",
        });
    });

    test.todo(
        "should turn three table cells with paragraph to table cells with heading 2",
        async () => {
            await testEditor({
                contentBefore:
                    "<table><tbody><tr><td><p>[a</p></td><td><p>b</p></td><td><p>c]</p></td></tr></tbody></table>",
                stepFunction: setTag("h2"),
                // The custom table selection is removed in cleanForSave and the selection is collapsed.
                contentAfter:
                    "<table><tbody><tr><td><h2>[]a</h2></td><td><h2>b</h2></td><td><h2>c</h2></td></tr></tbody></table>",
            });
        }
    );
});

describe("to heading 3", () => {
    test("should turn a heading 1 into a heading 3", async () => {
        await testEditor({
            contentBefore: "<h1>ab[]cd</h1>",
            stepFunction: setTag("h3"),
            contentAfter: "<h3>ab[]cd</h3>",
        });
    });

    test.todo("should turn a heading 1 into a heading 3 (character selected)", async () => {
        await testEditor({
            contentBefore: "<h1>a[b]c</h1>",
            stepFunction: setTag("h3"),
            contentAfter: "<h3>a[b]c</h3>",
        });
    });

    test.todo(
        "should turn a heading 1, a paragraph and a heading 2 into three headings 3",
        async () => {
            await testEditor({
                contentBefore: "<h1>a[b</h1><p>cd</p><h2>e]f</h2>",
                stepFunction: setTag("h3"),
                contentAfter: "<h3>a[b</h3><h3>cd</h3><h3>e]f</h3>",
            });
        }
    );

    test.skip("should turn a paragraph into a heading 3 after a triple click", async () => {
        await testEditor({
            contentBefore: "<p>[ab</p><h1>]cd</h1>",
            stepFunction: setTag("h3"),
            contentAfter: "<h3>[ab</h3><h1>]cd</h1>",
        });
    });

    test.todo("should not turn a div into a heading 3", async () => {
        await testEditor({
            contentBefore: "<div>[ab]</div>",
            stepFunction: setTag("h3"),
            contentAfter: "<div><h3>[ab]</h3></div>",
        });
    });

    test.todo(
        "should turn three table cells with paragraph to table cells with heading 3",
        async () => {
            await testEditor({
                contentBefore:
                    "<table><tbody><tr><td><p>[a</p></td><td><p>b</p></td><td><p>c]</p></td></tr></tbody></table>",
                stepFunction: setTag("h3"),
                // The custom table selection is removed in cleanForSave and the selection is collapsed.
                contentAfter:
                    "<table><tbody><tr><td><h3>[]a</h3></td><td><h3>b</h3></td><td><h3>c</h3></td></tr></tbody></table>",
            });
        }
    );
});

describe("to pre", () => {
    test("should turn a heading 1 into a pre", async () => {
        await testEditor({
            contentBefore: "<h1>ab[]cd</h1>",
            stepFunction: setTag("pre"),
            contentAfter: "<pre>ab[]cd</pre>",
        });
    });

    test.todo("should turn a heading 1 into a pre (character selected)", async () => {
        await testEditor({
            contentBefore: "<h1>a[b]c</h1>",
            stepFunction: setTag("pre"),
            contentAfter: "<pre>a[b]c</pre>",
        });
    });

    test.todo("should turn a heading 1 a pre and a paragraph into three pres", async () => {
        await testEditor({
            contentBefore: "<h1>a[b</h1><pre>cd</pre><p>e]f</p>",
            stepFunction: setTag("pre"),
            contentAfter: "<pre>a[b</pre><pre>cd</pre><pre>e]f</pre>",
        });
    });

    test.todo("should turn three table cells with paragraph to table cells with pre", async () => {
        await testEditor({
            contentBefore:
                "<table><tbody><tr><td><p>[a</p></td><td><p>b</p></td><td><p>c]</p></td></tr></tbody></table>",
            stepFunction: setTag("pre"),
            // The custom table selection is removed in cleanForSave and the selection is collapsed.
            contentAfter:
                "<table><tbody><tr><td><pre>[]a</pre></td><td><pre>b</pre></td><td><pre>c</pre></td></tr></tbody></table>",
        });
    });
});

describe("to blockquote", () => {
    test("should turn a blockquote into a paragraph", async () => {
        await testEditor({
            contentBefore: "<h1>ab[]cd</h1>",
            stepFunction: setTag("blockquote"),
            contentAfter: "<blockquote>ab[]cd</blockquote>",
        });
    });

    test.todo("should turn a heading 1 into a blockquote (character selected)", async () => {
        await testEditor({
            contentBefore: "<h1>a[b]c</h1>",
            stepFunction: setTag("blockquote"),
            contentAfter: "<blockquote>a[b]c</blockquote>",
        });
    });

    test.todo(
        "should turn a heading 1, a paragraph and a heading 2 into three blockquote",
        async () => {
            await testEditor({
                contentBefore: "<h1>a[b</h1><p>cd</p><h2>e]f</h2>",
                stepFunction: setTag("blockquote"),
                contentAfter:
                    "<blockquote>a[b</blockquote><blockquote>cd</blockquote><blockquote>e]f</blockquote>",
            });
        }
    );

    test.skip("should turn a heading 1 into a blockquote after a triple click", async () => {
        await testEditor({
            contentBefore: "<h1>[ab</h1><h2>]cd</h2>",
            stepFunction: setTag("blockquote"),
            contentAfter: "<blockquote>[ab</blockquote><h2>]cd</h2>",
        });
    });

    test.todo("should not turn a div into a blockquote", async () => {
        await testEditor({
            contentBefore: "<div>[ab]</div>",
            stepFunction: setTag("blockquote"),
            contentAfter: "<div><blockquote>[ab]</blockquote></div>",
        });
    });

    test.todo(
        "should turn three table cells with paragraph to table cells with blockquote",
        async () => {
            await testEditor({
                contentBefore:
                    "<table><tbody><tr><td><p>[a</p></td><td><p>b</p></td><td><p>c]</p></td></tr></tbody></table>",
                stepFunction: setTag("blockquote"),
                // The custom table selection is removed in cleanForSave and the selection is collapsed.
                contentAfter:
                    "<table><tbody><tr><td><blockquote>[]a</blockquote></td><td><blockquote>b</blockquote></td><td><blockquote>c</blockquote></td></tr></tbody></table>",
            });
        }
    );
});
