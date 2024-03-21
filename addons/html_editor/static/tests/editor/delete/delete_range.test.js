import { describe, test } from "@odoo/hoot";
import { testEditor } from "../../test_helpers/editor";
import { unformat } from "../../test_helpers/format";

async function deleteRange(editor) {
    editor.dispatch("DELETE_RANGE");
}
describe("Basic", () => {
    test("should delete a range inside a text node in a paragraph", async () => {
        await testEditor({
            contentBefore: "<p>a[bc]d</p>",
            stepFunction: deleteRange,
            contentAfter: "<p>a[]d</p>",
        });
    });
});

describe("Merge block into inline", () => {
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

    test("should merge paragraph with inline content before it and insert a line-break after it", async () => {
        await testEditor({
            contentBefore: "<div>ab[c<p>d]ef</p>ghi</div>",
            stepFunction: deleteRange,
            contentAfter: "<div>ab[]ef<br>ghi</div>",
        });
    });

    test("should merge paragraph with inline content before it and insert a line-break after it (2)", async () => {
        await testEditor({
            contentBefore: `<div>ab[c<custom-block style="display: block;"><p>d]ef</p></custom-block>ghi</div>`,
            stepFunction: deleteRange,
            contentAfter: "<div>ab[]ef<br>ghi</div>",
        });
    });

    test("should merge paragraph with inline content before it", async () => {
        await testEditor({
            contentBefore: "<div>ab[c<p>d]ef</p><p>ghi</p></div>",
            stepFunction: deleteRange,
            contentAfter: "<div>ab[]ef<p>ghi</p></div>",
        });
    });
});

describe("Merge inline into block", () => {
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
});

describe("Merge blocks", () => {
    test("should merge paragraphs", async () => {
        await testEditor({
            contentBefore: "<p>ab[c</p><p>d]ef</p>",
            stepFunction: deleteRange,
            contentAfter: "<p>ab[]ef</p>",
        });
    });

    test("should merge right block's content into left block", async () => {
        await testEditor({
            contentBefore: "<h1>ab[c</h1><p>d]ef</p>",
            stepFunction: deleteRange,
            contentAfter: "<h1>ab[]ef</h1>",
        });
    });

    test("should remove left block that has been emptied and keep second block", async () => {
        await testEditor({
            contentBefore: "<h1>[abc</h1><p>d]ef</p>",
            stepFunction: deleteRange,
            contentAfter: "<p>[]ef</p>",
        });
    });

    test("should keep left block if both have been emptied", async () => {
        await testEditor({
            contentBefore: "<h1>[abc</h1><p>def]</p>",
            stepFunction: deleteRange,
            contentAfter: "<h1>[]<br></h1>",
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
});

describe("Unmergeables", () => {
    test("should not merge paragraph with unmeargeble block", async () => {
        await testEditor({
            contentBefore: "<p>ab[c</p><div>d]ef</div>",
            stepFunction: deleteRange,
            contentAfter: "<p>ab[]</p><div>ef</div>",
        });
    });

    test("should remove unmergeable block that has been emptied", async () => {
        await testEditor({
            contentBefore: "<p>ab[c</p><div>def]</div>",
            stepFunction: deleteRange,
            contentAfter: "<p>ab[]</p>",
        });
    });
});

describe("Unremovables", () => {
    test("should not remove unremovable node, but clear its content", async () => {
        await testEditor({
            contentBefore: `<p>a[bc</p><div class="oe_unremovable">def</div><p>gh]i</p>`,
            stepFunction: deleteRange,
            contentAfter: `<p>a[]</p><div class="oe_unremovable"><br></div><p>i</p>`,
        });
    });
    test("should move the unremovable up the tree", async () => {
        await testEditor({
            contentBefore: `<p>a[bc</p><div><div class="oe_unremovable">def</div></div><p>gh]i</p>`,
            stepFunction: deleteRange,
            contentAfter: `<p>a[]</p><div class="oe_unremovable"><br></div><p>i</p>`,
        });
    });
    test("should preserve parent-child relations between unremovables", async () => {
        await testEditor({
            contentBefore: unformat(
                `<p>a[bc</p>
                <div>
                    <div class="oe_unremovable">
                        <div class="oe_unremovable">jkl</div>
                        <p>mno</p>
                    </div>
                </div>
                <p>gh]i</p>`
            ),
            stepFunction: deleteRange,
            contentAfter: unformat(
                `<p>a[]</p>
                <div class="oe_unremovable">
                    <div class="oe_unremovable"><br></div>
                </div>
                <p>i</p>`
            ),
        });
    });
    test("should preserve parent-child relations between unremovables (2)", async () => {
        await testEditor({
            contentBefore: unformat(
                `<p>a[bc</p>
                <div class="oe_unremovable">xyz</div>
                <div>
                    <div class="oe_unremovable">
                        <div>
                            <div class="oe_unremovable">jkl</div>
                        </div>
                        <p>mno</p>
                        <div class="oe_unremovable">mno</div>
                    </div>
                </div>
                <p>gh]i</p>`
            ),
            stepFunction: deleteRange,
            contentAfter: unformat(
                `<p>a[]</p>
                <div class="oe_unremovable"><br></div>
                <div class="oe_unremovable">
                    <div class="oe_unremovable"><br></div>
                    <div class="oe_unremovable"><br></div>
                </div>
                <p>i</p>`
            ),
        });
    });
});

describe("Conditional unremovables", () => {
    describe("Bootstrap columns", () => {
        test("should not remove bootstrap columns, but clear its content", async () => {
            await testEditor({
                contentBefore: unformat(
                    `<div class="container o_text_columns">
                        <div class="row">
                            <div class="col-6">a[bc</div>
                            <div class="col-6">def</div>
                        </div>
                    </div>
                    <p>gh]i</p>`
                ),
                stepFunction: deleteRange,
                contentAfterEdit: unformat(
                    `<div class="container o_text_columns">
                        <div class="row">
                            <div class="col-6">a[]</div>
                            <div class="col-6 o-we-hint" placeholder="Empty column"><br></div>
                        </div>
                    </div>
                    <p>i</p>`
                ),
                contentAfter: unformat(
                    `<div class="container o_text_columns">
                        <div class="row">
                            <div class="col-6">a[]</div>
                            <div class="col-6"><br></div>
                        </div>
                    </div>
                    <p>i</p>`
                ),
            });
        });
        test("should remove bootstrap columns", async () => {
            await testEditor({
                contentBefore: unformat(
                    `<p>x[yz</p>
                    <div class="container o_text_columns">
                        <div class="row">
                            <div class="col-6">abc</div>
                            <div class="col-6">def</div>
                        </div>
                    </div>
                    <p>gh]i</p>`
                ),
                stepFunction: deleteRange,
                contentAfter: "<p>x[]i</p>",
            });
        });
    });
    describe("Table cells", () => {
        test("should not remove table cell, but clear its content", async () => {
            // Actually this is handled by the table plugin, and does not
            // involve the unremovable mechanism.
            await testEditor({
                contentBefore: unformat(
                    `<table><tbody>
                        <tr>
                            <td>[a</td> <td>b]</td> <td>c</td> 
                        </tr>
                        <tr>
                            <td>d</td> <td>e</td> <td>f</td> 
                        </tr>
                    </tbody></table>`
                ),
                stepFunction: deleteRange,
                contentAfter: unformat(
                    `<table><tbody>
                        <tr>
                            <td>[]<br></td> <td><br></td> <td>c</td> 
                        </tr>
                        <tr>
                            <td>d</td> <td>e</td> <td>f</td> 
                        </tr>
                    </tbody></table>`
                ),
            });
        });
        test("should remove table", async () => {
            await testEditor({
                contentBefore: unformat(
                    `<p>a[bc</p>
                    <table><tbody>
                        <tr>
                            <td><p>abc</p></td><td><p>def</p></td>
                        </tr>
                    </tbody></table>
                    <p>gh]i</p>`
                ),
                stepFunction: deleteRange,
                contentAfter: "<p>a[]i</p>",
            });
        });
    });
});
