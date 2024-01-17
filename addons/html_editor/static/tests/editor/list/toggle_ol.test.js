/** @odoo-module */

import { describe, test } from "@odoo/hoot";
import { testEditor } from "../../helpers";
import { unformat } from "../../utils";

function toggleOrderedList(editor) {
    throw new Error("toggle OL not done yet");
}

describe("Range collapsed", () => {
    describe("Insert", () => {
        test.todo("should turn an empty paragraph into a list", async () => {
            await testEditor({
                contentBefore: "<p>[]<br></p>",
                stepFunction: toggleOrderedList,
                contentAfter: "<ol><li>[]<br></li></ol>",
            });
        });
        test.todo("should turn a paragraph into a list", async () => {
            await testEditor({
                contentBefore: "<p>ab[]cd</p>",
                stepFunction: toggleOrderedList,
                contentAfter: "<ol><li>ab[]cd</li></ol>",
            });
        });
        test.todo("should turn a heading into a list", async () => {
            await testEditor({
                contentBefore: "<h1>ab[]cd</h1>",
                stepFunction: toggleOrderedList,
                contentAfter: "<ol><li><h1>ab[]cd</h1></li></ol>",
            });
        });
        test.todo("should turn a paragraph in a div into a list", async () => {
            await testEditor({
                contentBefore: "<div><p>ab[]cd</p></div>",
                stepFunction: toggleOrderedList,
                contentAfter: "<div><ol><li>ab[]cd</li></ol></div>",
            });
        });
        test.todo("should turn a paragraph with formats into a list", async () => {
            await testEditor({
                contentBefore: "<p><span><b>ab</b></span> <span><i>cd</i></span> ef[]gh</p>",
                stepFunction: toggleOrderedList,
                contentAfter: "<ol><li><b>ab</b> <i>cd</i> ef[]gh</li></ol>",
            });
        });
        test.todo(
            "should turn an empty paragraph of multiple table cells into a list",
            async () => {
                await testEditor({
                    contentBefore: unformat(`
                        <table class="table table-bordered">
                            <tbody>
                                <tr>
                                    <td>[<br></td>
                                    <td><br></td>
                                    <td><br></td>
                                </tr>
                                <tr>
                                    <td><br></td>
                                    <td><br></td>
                                    <td><br>]</td>
                                </tr>
                            </tbody>
                        </table>
                    `),
                    stepFunction: toggleOrderedList,
                    contentAfterEdit: unformat(`
                        <table class="table table-bordered o_selected_table">
                            <tbody>
                                <tr>
                                    <td class="o_selected_td">[<ol><li placeholder="List" class="oe-hint"><br></li></ol></td>
                                    <td class="o_selected_td"><ol><li placeholder="List" class="oe-hint"><br></li></ol></td>
                                    <td class="o_selected_td"><ol><li placeholder="List" class="oe-hint"><br></li></ol></td>
                                </tr>
                                <tr>
                                    <td class="o_selected_td"><ol><li placeholder="List" class="oe-hint"><br></li></ol></td>
                                    <td class="o_selected_td"><ol><li placeholder="List" class="oe-hint"><br></li></ol></td>
                                    <td class="o_selected_td"><ol><li placeholder="List" class="oe-hint"><br></li></ol>]</td>
                                </tr>
                            </tbody>
                        </table>
                    `),
                    contentAfter: unformat(`
                        <table class="table table-bordered">
                            <tbody>
                                <tr>
                                    <td>[]<ol><li><br></li></ol></td>
                                    <td><ol><li><br></li></ol></td>
                                    <td><ol><li><br></li></ol></td>
                                </tr>
                                <tr>
                                    <td><ol><li><br></li></ol></td>
                                    <td><ol><li><br></li></ol></td>
                                    <td><ol><li><br></li></ol></td>
                                </tr>
                            </tbody>
                        </table>
                    `),
                });
            }
        );
    });
    describe("Remove", () => {
        test.todo("should turn an empty list into a paragraph", async () => {
            await testEditor({
                contentBefore: "<ol><li>[]<br></li></ol>",
                stepFunction: toggleOrderedList,
                contentAfter: "<p>[]<br></p>",
            });
        });
        test.todo("should turn a list into a paragraph", async () => {
            await testEditor({
                contentBefore: "<ol><li>ab[]cd</li></ol>",
                stepFunction: toggleOrderedList,
                contentAfter: "<p>ab[]cd</p>",
            });
        });
        test.todo("should turn a list into a heading", async () => {
            await testEditor({
                contentBefore: "<ol><li><h1>ab[]cd</h1></li></ol>",
                stepFunction: toggleOrderedList,
                contentAfter: "<h1>ab[]cd</h1>",
            });
        });
        test.todo("should turn a list item into a paragraph", async () => {
            await testEditor({
                contentBefore: "<p>ab</p><ol><li>cd</li><li>ef[]gh</li></ol>",
                stepFunction: toggleOrderedList,
                contentAfter: "<p>ab</p><ol><li>cd</li></ol><p>ef[]gh</p>",
            });
        });
        test.todo("should turn a list with formats into a paragraph", async () => {
            await testEditor({
                contentBefore:
                    "<ol><li><span><b>ab</b></span> <span><i>cd</i></span> ef[]gh</li></ol>",
                stepFunction: toggleOrderedList,
                contentAfter: "<p><b>ab</b> <i>cd</i> ef[]gh</p>",
            });
        });
        test.todo(
            "should turn an list of multiple table cells into a empty paragraph",
            async () => {
                await testEditor({
                    contentBefore: unformat(`
                        <table class="table table-bordered">
                            <tbody>
                                <tr>
                                    <td>[<ol><li><br></li></ol></td>
                                    <td><ol><li><br></li></ol></td>
                                    <td><ol><li><br></li></ol></td>
                                </tr>
                                <tr>
                                    <td><ol><li><br></li></ol></td>
                                    <td><ol><li><br></li></ol></td>
                                    <td><ol><li><br></li></ol>]</td>
                                </tr>
                            </tbody>
                        </table>
                    `),
                    stepFunction: toggleOrderedList,
                    contentAfterEdit: unformat(`
                        <table class="table table-bordered o_selected_table">
                            <tbody>
                                <tr>
                                    <td class="o_selected_td">[<p><br></p></td>
                                    <td class="o_selected_td"><p><br></p></td>
                                    <td class="o_selected_td"><p><br></p></td>
                                </tr>
                                <tr>
                                    <td class="o_selected_td"><p><br></p></td>
                                    <td class="o_selected_td"><p><br></p></td>
                                    <td class="o_selected_td"><p><br></p>]</td>
                                </tr>
                            </tbody>
                        </table>
                    `),
                    contentAfter: unformat(`
                        <table class="table table-bordered">
                            <tbody>
                                <tr>
                                    <td>[]<p><br></p></td>
                                    <td><p><br></p></td>
                                    <td><p><br></p></td>
                                </tr>
                                <tr>
                                    <td><p><br></p></td>
                                    <td><p><br></p></td>
                                    <td><p><br></p></td>
                                </tr>
                            </tbody>
                        </table>
                    `),
                });
            }
        );
    });
});

describe("Range not collapsed", () => {
    describe("Insert", () => {
        test.todo("should turn a paragraph into a list", async () => {
            await testEditor({
                contentBefore: "<p>ab</p><p>cd[ef]gh</p>",
                stepFunction: toggleOrderedList,
                contentAfter: "<p>ab</p><ol><li>cd[ef]gh</li></ol>",
            });
        });
        test.todo("should turn a heading into a list", async () => {
            await testEditor({
                contentBefore: "<p>ab</p><h1>cd[ef]gh</h1>",
                stepFunction: toggleOrderedList,
                contentAfter: "<p>ab</p><ol><li><h1>cd[ef]gh</h1></li></ol>",
            });
        });
        test.todo("should turn two paragraphs into a list with two items", async () => {
            await testEditor({
                contentBefore: "<p>ab</p><p>cd[ef</p><p>gh]ij</p>",
                stepFunction: toggleOrderedList,
                contentAfter: "<p>ab</p><ol><li>cd[ef</li><li>gh]ij</li></ol>",
            });
        });
        test.todo("should turn two paragraphs in a div into a list with two items", async () => {
            await testEditor({
                contentBefore: "<div><p>ab[cd</p><p>ef]gh</p></div>",
                stepFunction: toggleOrderedList,
                contentAfter: "<div><ol><li>ab[cd</li><li>ef]gh</li></ol></div>",
            });
        });
        test.todo("should turn a paragraph and a list item into two list items", async () => {
            await testEditor({
                contentBefore: "<p>a[b</p><ol><li>c]d</li><li>ef</li></ol>",
                stepFunction: toggleOrderedList,
                contentAfter: "<ol><li>a[b</li><li>c]d</li><li>ef</li></ol>",
            });
        });
        test.todo("should turn a list item and a paragraph into two list items", async () => {
            await testEditor({
                contentBefore: "<ol><li>ab</li><li>c[d</li></ol><p>e]f</p>",
                stepFunction: toggleOrderedList,
                contentAfter: "<ol><li>ab</li><li>c[d</li><li>e]f</li></ol>",
            });
        });
        test.todo(
            "should turn a list, a paragraph and another list into one list with three list items",
            async () => {
                await testEditor({
                    contentBefore: "<ol><li>a[b</li></ol><p>cd</p><ol><li>e]f</li></ol>",
                    stepFunction: toggleOrderedList,
                    contentAfter: "<ol><li>a[b</li><li>cd</li><li>e]f</li></ol>",
                });
            }
        );
        test.todo(
            "should turn a list item, a paragraph and another list into one list with all three as list items",
            async () => {
                await testEditor({
                    contentBefore: "<ol><li>ab<li>c[d</li></ol><p>ef</p><ol><li>g]h</li></ol>",
                    stepFunction: toggleOrderedList,
                    contentAfter: "<ol><li>ab</li><li>c[d</li><li>ef</li><li>g]h</li></ol>",
                });
            }
        );
        test.todo(
            "should turn a list, a paragraph and a list item into one list with all three as list items",
            async () => {
                await testEditor({
                    contentBefore: "<ol><li>a[b</li></ol><p>cd</p><ol><li>e]f</li><li>gh</li></ol>",
                    stepFunction: toggleOrderedList,
                    contentAfter: "<ol><li>a[b</li><li>cd</li><li>e]f</li><li>gh</li></ol>",
                });
            }
        );
    });
    describe("Remove", () => {
        test.todo("should turn a list into a paragraph", async () => {
            await testEditor({
                contentBefore: "<p>ab</p><ol><li>cd[ef]gh</li></ol>",
                stepFunction: toggleOrderedList,
                contentAfter: "<p>ab</p><p>cd[ef]gh</p>",
            });
        });
        test.todo("should turn a list into a heading", async () => {
            await testEditor({
                contentBefore: "<p>ab</p><ol><li><h1>cd[ef]gh</h1></li></ol>",
                stepFunction: toggleOrderedList,
                contentAfter: "<p>ab</p><h1>cd[ef]gh</h1>",
            });
        });
        test.todo("should turn a list into two paragraphs", async () => {
            await testEditor({
                contentBefore: "<p>ab</p><ol><li>cd[ef</li><li>gh]ij</li></ol>",
                stepFunction: toggleOrderedList,
                contentAfter: "<p>ab</p><p>cd[ef</p><p>gh]ij</p>",
            });
        });
        test.todo("should turn a list item into a paragraph", async () => {
            await testEditor({
                contentBefore: "<p>ab</p><ol><li>cd</li><li>ef[gh]ij</li></ol>",
                stepFunction: toggleOrderedList,
                contentAfter: "<p>ab</p><ol><li>cd</li></ol><p>ef[gh]ij</p>",
            });
        });
    });
});
