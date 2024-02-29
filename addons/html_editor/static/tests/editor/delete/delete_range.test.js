import { test } from "@odoo/hoot";
import { testEditor } from "../../test_helpers/editor";

async function deleteRange(editor) {
    editor.dispatch("DELETE_RANGE");
}

test("should delete a range inside a text node in a paragraph", async () => {
    await testEditor({
        contentBefore: "<p>a[bc]d</p>",
        stepFunction: deleteRange,
        contentAfter: "<p>a[]d</p>",
    });
});

test("should merge paragraph with inline content before it (remove paragraph)", async () => {
    await testEditor({
        contentBefore: "<div>ab[c<p>d]ef</p></div>",
        stepFunction: deleteRange,
        contentAfter: "<div>ab[]ef</div>",
    });
});

// @todo @phoenix: this selection is confused with a triple click, and gets changed into
// collapsed selection after "c". Fix the triple click issued first.
test.skip("should merge paragraph with inline content before it (remove paragraph) (2)", async () => {
    await testEditor({
        contentBefore: "<div>abc[<p>]def</p></div>",
        stepFunction: deleteRange,
        contentAfter: "<div>abc[]def</div>",
    });
});

test("should merge paragraph with inline content after it", async () => {
    await testEditor({
        contentBefore: "<div><p>ab[c</p>d]ef</div>",
        stepFunction: deleteRange,
        contentAfter: "<div><p>ab[]ef</p></div>",
    });
});

test("should merge paragraph with inline content after it (2)", async () => {
    await testEditor({
        contentBefore: "<div><p>abc[</p>]def</div>",
        stepFunction: deleteRange,
        contentAfter: "<div><p>abc[]def</p></div>",
    });
});

// @todo @phoenix: triple click correction messes up the selection big time.
test.todo("should not merge paragraph with paragraph before it", async () => {
    await testEditor({
        contentBefore: "<div><p>abc</p>[<p>]def</p></div>",
        stepFunction: deleteRange,
        contentAfter: "<div><p>abc</p>[]<p>def</p></div>",
    });
});
