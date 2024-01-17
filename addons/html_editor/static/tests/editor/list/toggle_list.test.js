/** @odoo-module */

import { describe, test } from "@odoo/hoot";
import { testEditor } from "../../helpers";
import { unformat } from "../../utils";

function toggleUnorderedList(editor) {
    throw new Error("toggle UL not done yet");
}

function toggleOrderedList(editor) {
    throw new Error("toggle OL not done yet");
}

function toggleCheckList(editor) {
    throw new Error("toggle checklins not done yet");
}

describe("Range collapsed", () => {
    describe("Unordered", () => {
        describe("Insert", () => {
            test.todo("should turn an empty paragraph into a list", async () => {
                await testEditor({
                    contentBefore: "<p>[]<br></p>",
                    stepFunction: toggleUnorderedList,
                    contentAfter: "<ul><li>[]<br></li></ul>",
                });
            });
            test.todo("should turn a paragraph into a list", async () => {
                await testEditor({
                    contentBefore: "<p>ab[]cd</p>",
                    stepFunction: toggleUnorderedList,
                    contentAfter: "<ul><li>ab[]cd</li></ul>",
                });
            });
            test.todo("should turn a heading into a list", async () => {
                await testEditor({
                    contentBefore: "<h1>ab[]cd</h1>",
                    stepFunction: toggleUnorderedList,
                    contentAfter: "<ul><li><h1>ab[]cd</h1></li></ul>",
                });
            });
            test.todo("should turn a paragraph in a div into a list", async () => {
                await testEditor({
                    contentBefore: "<div><p>ab[]cd</p></div>",
                    stepFunction: toggleUnorderedList,
                    contentAfter: "<div><ul><li>ab[]cd</li></ul></div>",
                });
            });
            test.todo("should turn a paragraph with formats into a list", async () => {
                await testEditor({
                    contentBefore: "<p><span><b>ab</b></span> <span><i>cd</i></span> ef[]gh</p>",
                    stepFunction: toggleUnorderedList,
                    contentAfter: "<ul><li><b>ab</b> <i>cd</i> ef[]gh</li></ul>",
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
                        stepFunction: toggleUnorderedList,
                        contentAfterEdit: unformat(`
                        <table class="table table-bordered o_selected_table">
                            <tbody>
                                <tr>
                                    <td class="o_selected_td">[<ul><li placeholder="List" class="oe-hint"><br></li></ul></td>
                                    <td class="o_selected_td"><ul><li placeholder="List" class="oe-hint"><br></li></ul></td>
                                    <td class="o_selected_td"><ul><li placeholder="List" class="oe-hint"><br></li></ul></td>
                                </tr>
                                <tr>
                                    <td class="o_selected_td"><ul><li placeholder="List" class="oe-hint"><br></li></ul></td>
                                    <td class="o_selected_td"><ul><li placeholder="List" class="oe-hint"><br></li></ul></td>
                                    <td class="o_selected_td"><ul><li placeholder="List" class="oe-hint"><br></li></ul>]</td>
                                </tr>
                            </tbody>
                        </table>
                    `),
                        contentAfter: unformat(`
                        <table class="table table-bordered">
                            <tbody>
                                <tr>
                                    <td>[]<ul><li><br></li></ul></td>
                                    <td><ul><li><br></li></ul></td>
                                    <td><ul><li><br></li></ul></td>
                                </tr>
                                <tr>
                                    <td><ul><li><br></li></ul></td>
                                    <td><ul><li><br></li></ul></td>
                                    <td><ul><li><br></li></ul></td>
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
                    contentBefore: "<ul><li>[]<br></li></ul>",
                    stepFunction: toggleUnorderedList,
                    contentAfter: "<p>[]<br></p>",
                });
            });
            test.todo("should turn a list into a paragraph", async () => {
                await testEditor({
                    contentBefore: "<ul><li>ab[]cd</li></ul>",
                    stepFunction: toggleUnorderedList,
                    contentAfter: "<p>ab[]cd</p>",
                });
            });
            test.todo("should turn a list into a heading", async () => {
                await testEditor({
                    contentBefore: "<ul><li><h1>ab[]cd</h1></li></ul>",
                    stepFunction: toggleUnorderedList,
                    contentAfter: "<h1>ab[]cd</h1>",
                });
            });
            test.todo("should turn a list item into a paragraph", async () => {
                await testEditor({
                    contentBefore: "<p>ab</p><ul><li>cd</li><li>ef[]gh</li></ul>",
                    stepFunction: toggleUnorderedList,
                    contentAfter: "<p>ab</p><ul><li>cd</li></ul><p>ef[]gh</p>",
                });
            });
            test.todo("should turn a list with formats into a paragraph", async () => {
                await testEditor({
                    contentBefore:
                        "<ul><li><span><b>ab</b></span> <span><i>cd</i></span> ef[]gh</li></ul>",
                    stepFunction: toggleUnorderedList,
                    contentAfter: "<p><b>ab</b> <i>cd</i> ef[]gh</p>",
                });
            });
            test.todo("should turn nested list items into paragraphs", async () => {
                await testEditor({
                    contentBefore: unformat(`
                        <ul>
                            <li>a</li>
                            <li class="oe-nested">
                                <ul>
                                    <li>[]b</li>
                                </ul>
                            </li>
                            <li class="oe-nested">
                                <ul>
                                    <li class="oe-nested">
                                        <ul>
                                            <li>c</li>
                                        </ul>
                                    </li>
                                </ul>
                            </li>
                        </ul>`),
                    stepFunction: toggleUnorderedList,
                    contentAfter: unformat(`
                        <ul>
                            <li>a</li>
                        </ul>
                        <p>[]b</p>
                        <ul>
                            <li class="oe-nested">
                                <ul>
                                    <li class="oe-nested">
                                        <ul>
                                            <li>c</li>
                                        </ul>
                                    </li>
                                </ul>
                            </li>
                        </ul>`),
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
                                    <td>[<ul><li><br></li></ul></td>
                                    <td><ul><li><br></li></ul></td>
                                    <td><ul><li><br></li></ul></td>
                                </tr>
                                <tr>
                                    <td><ul><li><br></li></ul></td>
                                    <td><ul><li><br></li></ul></td>
                                    <td><ul><li><br></li></ul>]</td>
                                </tr>
                            </tbody>
                        </table>
                    `),
                        stepFunction: toggleUnorderedList,
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
        describe("Transform", () => {
            test.todo("should turn an empty ordered list into an unordered list", async () => {
                await testEditor({
                    contentBefore: "<ol><li>[]<br></li></ol>",
                    stepFunction: toggleUnorderedList,
                    contentAfter: "<ul><li>[]<br></li></ul>",
                });
            });
            test.todo("should turn an empty ordered list into an unordered list (2)", async () => {
                await testEditor({
                    contentBefore: '<ul class="o_checklist"><li>[]<br></li></ul>',
                    stepFunction: toggleUnorderedList,
                    contentAfter: "<ul><li>[]<br></li></ul>",
                });
            });
        });
    });
    describe("Ordered", () => {
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
    describe("Checklist", () => {
        describe("Insert", () => {
            test.todo("should turn an empty paragraph into a checklist", async () => {
                await testEditor({
                    removeCheckIds: true,
                    contentBefore: "<p>[]<br></p>",
                    stepFunction: toggleCheckList,
                    // JW cAfter: '<ul class="o_checklist"><li>[]<br></li></ul>',
                    contentAfter: '<ul class="o_checklist"><li>[]<br></li></ul>',
                });
            });
            test.todo("should turn a paragraph into a checklist", async () => {
                await testEditor({
                    removeCheckIds: true,
                    contentBefore: "<p>ab[]cd</p>",
                    stepFunction: toggleCheckList,
                    // JW cAfter: '<ul class="o_checklist"><li>ab[]cd</li></ul>',
                    contentAfter: '<ul class="o_checklist"><li>ab[]cd</li></ul>',
                });
            });
            test.todo("should turn a heading into a checklist", async () => {
                await testEditor({
                    removeCheckIds: true,
                    contentBefore: "<h1>ab[]cd</h1>",
                    stepFunction: toggleCheckList,
                    // JW cAfter: '<ul class="o_checklist"><li><h1>ab[]cd</h1></li></ul>',
                    contentAfter: '<ul class="o_checklist"><li><h1>ab[]cd</h1></li></ul>',
                });
            });
            test.todo("should turn a paragraph in a div into a checklist", async () => {
                await testEditor({
                    removeCheckIds: true,
                    contentBefore: "<div><p>ab[]cd</p></div>",
                    stepFunction: toggleCheckList,
                    // JW cAfter: '<div><ul class="o_checklist"><li>ab[]cd</li></ul></div>',
                    contentAfter: '<div><ul class="o_checklist"><li>ab[]cd</li></ul></div>',
                });
            });
            test.todo("should turn a paragraph with formats into a checklist", async () => {
                await testEditor({
                    removeCheckIds: true,
                    contentBefore: "<p><span><b>ab</b></span> <span><i>cd</i></span> ef[]gh</p>",
                    stepFunction: toggleCheckList,
                    // JW cAfter: '<ul class="o_checklist"><li><span><b>ab</b></span> <span><i>cd</i></span> ef[]gh</li></ul>',
                    contentAfter:
                        '<ul class="o_checklist"><li><b>ab</b> <i>cd</i> ef[]gh</li></ul>',
                });
            });
            test.todo(
                "should turn a paragraph between 2 checklist into a checklist item",
                async () => {
                    await testEditor({
                        removeCheckIds: true,
                        contentBefore:
                            '<ul class="o_checklist"><li class="o_checked">abc</li></ul><p>d[]ef</p><ul class="o_checklist"><li class="o_checked">ghi</li></ul>',
                        stepFunction: toggleCheckList,
                        contentAfter:
                            '<ul class="o_checklist"><li class="o_checked">abc</li><li>d[]ef</li><li class="o_checked">ghi</li></ul>',
                    });
                }
            );
            test.todo(
                "should turn a unordered list into a checklist between 2 checklists inside a checklist",
                async () => {
                    await testEditor({
                        removeCheckIds: true,
                        contentBefore: unformat(`
                        <ul class="o_checklist">
                            <li class="o_checked">abc</li>
                            <li class="oe-nested">
                                <ul class="o_checklist">
                                    <li class="o_checked">def</li>
                                </ul>
                            </li>
                            <li class="oe-nested">
                                <ul>
                                    <li>g[]hi</li>
                                </ul>
                            </li>
                            <li class="oe-nested">
                                <ul class="o_checklist">
                                    <li class="o_checked">jkl</li>
                                </ul>
                            </li>
                        </ul>`),
                        stepFunction: toggleCheckList,
                        contentAfterEdit: unformat(`
                        <ul class="o_checklist">
                            <li class="o_checked" id="checkId-1">abc</li>
                            <li class="oe-nested">
                                <ul class="o_checklist">
                                    <li class="o_checked" id="checkId-2">def</li>
                                    <li id="checkId-4">g[]hi</li>
                                    <li class="o_checked" id="checkId-3">jkl</li>
                                </ul>
                            </li>
                        </ul>`),
                        contentAfter: unformat(`
                        <ul class="o_checklist">
                            <li class="o_checked">abc</li>
                            <li class="oe-nested">
                                <ul class="o_checklist">
                                    <li class="o_checked">def</li>
                                    <li>g[]hi</li>
                                    <li class="o_checked">jkl</li>
                                </ul>
                            </li>
                        </ul>`),
                    });
                    await testEditor({
                        removeCheckIds: true,
                        contentBefore: unformat(`
                        <ul class="o_checklist">
                            <li class="o_checked">abc</li>
                            <li class="oe-nested">
                                <ul class="o_checklist">
                                    <li class="o_checked">def</li>
                                </ul>
                            </li>
                            <li class="oe-nested">
                                <ul>
                                    <li class="a">g[]hi</li>
                                </ul>
                            </li>
                            <li class="oe-nested">
                                <ul class="o_checklist">
                                    <li class="o_checked">jkl</li>
                                </ul>
                            </li>
                        </ul>`),
                        stepFunction: toggleCheckList,
                        contentAfter: unformat(`
                        <ul class="o_checklist">
                            <li class="o_checked">abc</li>
                            <li class="oe-nested">
                                <ul class="o_checklist">
                                    <li class="o_checked">def</li>
                                    <li class="a">g[]hi</li>
                                    <li class="o_checked">jkl</li>
                                </ul>
                            </li>
                        </ul>`),
                    });
                }
            );
            test.todo("should remove the list-style when change the list style", async () => {
                await testEditor({
                    removeCheckIds: true,
                    contentBefore: unformat(`
                        <ul>
                            <li style="list-style: cambodian;">a[]</li>
                        </ul>`),
                    stepFunction: toggleCheckList,
                    contentAfter: unformat(`
                    <ul class="o_checklist">
                        <li>a[]</li>
                    </ul>`),
                });
            });
            test.todo("should add a unique id on a new checklist", async () => {
                await testEditor({
                    contentBefore: "<p>ab[]cd</p>",
                    stepFunction: (editor) => {
                        toggleCheckList(editor);
                        const id = editor.editable
                            .querySelector("li[id^=checkId-]")
                            .getAttribute("id");
                        window.chai
                            .expect(editor.editable.innerHTML)
                            .to.be.equal(`<ul class="o_checklist"><li id="${id}">abcd</li></ul>`);
                    },
                });
            });
            test.todo(
                "should turn an empty paragraph of multiple table cells into a checklist",
                async () => {
                    await testEditor({
                        removeCheckIds: true,
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
                        stepFunction: (editor) => {
                            toggleCheckList(editor);
                            for (const li of editor.editable.querySelectorAll("li[id^=checkId-]")) {
                                li.removeAttribute("id");
                            }
                        },
                        contentAfterEdit: unformat(`
                        <table class="table table-bordered o_selected_table">
                            <tbody>
                                <tr>
                                    <td class="o_selected_td">[<ul class="o_checklist"><li placeholder="List" class="oe-hint"><br></li></ul></td>
                                    <td class="o_selected_td"><ul class="o_checklist"><li placeholder="List" class="oe-hint"><br></li></ul></td>
                                    <td class="o_selected_td"><ul class="o_checklist"><li placeholder="List" class="oe-hint"><br></li></ul></td>
                                </tr>
                                <tr>
                                    <td class="o_selected_td"><ul class="o_checklist"><li placeholder="List" class="oe-hint"><br></li></ul></td>
                                    <td class="o_selected_td"><ul class="o_checklist"><li placeholder="List" class="oe-hint"><br></li></ul></td>
                                    <td class="o_selected_td"><ul class="o_checklist"><li placeholder="List" class="oe-hint"><br></li></ul>]</td>
                                </tr>
                            </tbody>
                        </table>
                    `),
                        contentAfter: unformat(`
                        <table class="table table-bordered">
                            <tbody>
                                <tr>
                                    <td>[]<ul class="o_checklist"><li><br></li></ul></td>
                                    <td><ul class="o_checklist"><li><br></li></ul></td>
                                    <td><ul class="o_checklist"><li><br></li></ul></td>
                                </tr>
                                <tr>
                                    <td><ul class="o_checklist"><li><br></li></ul></td>
                                    <td><ul class="o_checklist"><li><br></li></ul></td>
                                    <td><ul class="o_checklist"><li><br></li></ul></td>
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
                    contentBefore: '<ul class="o_checklist"><li>[]<br></li></ul>',
                    stepFunction: toggleCheckList,
                    contentAfter: "<p>[]<br></p>",
                });
            });
            test.todo("should turn a checklist into a paragraph", async () => {
                await testEditor({
                    contentBefore: '<ul class="o_checklist"><li>ab[]cd</li></ul>',
                    stepFunction: toggleCheckList,
                    contentAfter: "<p>ab[]cd</p>",
                });
            });
            test.todo("should turn a checklist into a heading", async () => {
                await testEditor({
                    contentBefore: '<ul class="o_checklist"><li><h1>ab[]cd</h1></li></ul>',
                    stepFunction: toggleCheckList,
                    contentAfter: "<h1>ab[]cd</h1>",
                });
            });
            test.todo("should turn a checklist item into a paragraph", async () => {
                await testEditor({
                    removeCheckIds: true,
                    contentBefore:
                        '<p>ab</p><ul class="o_checklist"><li>cd</li><li>ef[]gh</li></ul>',
                    stepFunction: toggleCheckList,
                    contentAfter: '<p>ab</p><ul class="o_checklist"><li>cd</li></ul><p>ef[]gh</p>',
                });
            });
            test.todo("should turn a checklist with formats into a paragraph", async () => {
                await testEditor({
                    contentBefore:
                        '<ul class="o_checklist"><li><span><b>ab</b></span> <span><i>cd</i></span> ef[]gh</li></ul>',
                    stepFunction: toggleCheckList,
                    contentAfter: "<p><b>ab</b> <i>cd</i> ef[]gh</p>",
                });
            });
            test.todo("should turn nested list items into paragraphs", async () => {
                await testEditor({
                    removeCheckIds: true,
                    contentBefore: unformat(`
                        <ul class="o_checklist">
                            <li class="o_checked">a</li>
                            <li class="oe-nested">
                                <ul class="o_checklist">
                                    <li class="o_checked">[]b</li>
                                </ul>
                            </li>
                            <li class="oe-nested">
                                <ul class="o_checklist">
                                    <li class="oe-nested">
                                        <ul class="o_checklist">
                                            <li class="o_checked">c</li>
                                        </ul>
                                    </li>
                                </ul>
                            </li>
                        </ul>`),
                    stepFunction: toggleCheckList,
                    contentAfter: unformat(`
                        <ul class="o_checklist">
                            <li class="o_checked">a</li>
                        </ul>
                        <p>[]b</p>
                        <ul class="o_checklist">
                            <li class="oe-nested">
                                <ul class="o_checklist">
                                    <li class="oe-nested">
                                        <ul class="o_checklist">
                                            <li class="o_checked">c</li>
                                        </ul>
                                    </li>
                                </ul>
                            </li>
                        </ul>`),
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
                                    <td>[<ul class="o_checklist"><li><br></li></ul></td>
                                    <td><ul class="o_checklist"><li><br></li></ul></td>
                                    <td><ul class="o_checklist"><li><br></li></ul></td>
                                </tr>
                                <tr>
                                    <td><ul class="o_checklist"><li><br></li></ul></td>
                                    <td><ul class="o_checklist"><li><br></li></ul></td>
                                    <td><ul class="o_checklist"><li><br></li></ul>]</td>
                                </tr>
                            </tbody>
                        </table>
                    `),
                        stepFunction: toggleCheckList,
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
});

describe("Range not collapsed", () => {
    describe("Unordered", () => {
        describe("Insert", () => {
            test.todo("should turn a paragraph into a list", async () => {
                await testEditor({
                    contentBefore: "<p>ab</p><p>cd[ef]gh</p>",
                    stepFunction: toggleUnorderedList,
                    contentAfter: "<p>ab</p><ul><li>cd[ef]gh</li></ul>",
                });
            });
            test.todo("should turn a heading into a list", async () => {
                await testEditor({
                    contentBefore: "<p>ab</p><h1>cd[ef]gh</h1>",
                    stepFunction: toggleUnorderedList,
                    contentAfter: "<p>ab</p><ul><li><h1>cd[ef]gh</h1></li></ul>",
                });
            });
            test.todo("should turn two paragraphs into a list with two items", async () => {
                await testEditor({
                    contentBefore: "<p>ab</p><p>cd[ef</p><p>gh]ij</p>",
                    stepFunction: toggleUnorderedList,
                    contentAfter: "<p>ab</p><ul><li>cd[ef</li><li>gh]ij</li></ul>",
                });
            });
            test.todo(
                "should turn two paragraphs in a div into a list with two items",
                async () => {
                    await testEditor({
                        contentBefore: "<div><p>ab[cd</p><p>ef]gh</p></div>",
                        stepFunction: toggleUnorderedList,
                        contentAfter: "<div><ul><li>ab[cd</li><li>ef]gh</li></ul></div>",
                    });
                }
            );
            test.todo("should turn a paragraph and a list item into two list items", async () => {
                await testEditor({
                    contentBefore: "<p>a[b</p><ul><li>c]d</li><li>ef</li></ul>",
                    stepFunction: toggleUnorderedList,
                    contentAfter: "<ul><li>a[b</li><li>c]d</li><li>ef</li></ul>",
                });
            });
            test.todo("should turn a list item and a paragraph into two list items", async () => {
                await testEditor({
                    contentBefore: "<ul><li>ab</li><li>c[d</li></ul><p>e]f</p>",
                    stepFunction: toggleUnorderedList,
                    contentAfter: "<ul><li>ab</li><li>c[d</li><li>e]f</li></ul>",
                });
            });
            test.todo(
                "should turn a list, a paragraph and another list into one list with three list items",
                async () => {
                    await testEditor({
                        contentBefore: "<ul><li>a[b</li></ul><p>cd</p><ul><li>e]f</li></ul>",
                        stepFunction: toggleUnorderedList,
                        contentAfter: "<ul><li>a[b</li><li>cd</li><li>e]f</li></ul>",
                    });
                }
            );
            test.todo(
                "should turn a list item, a paragraph and another list into one list with all three as list items",
                async () => {
                    await testEditor({
                        contentBefore: "<ul><li>ab<li>c[d</li></ul><p>ef</p><ul><li>g]h</li></ul>",
                        stepFunction: toggleUnorderedList,
                        contentAfter: "<ul><li>ab</li><li>c[d</li><li>ef</li><li>g]h</li></ul>",
                    });
                }
            );
            test.todo(
                "should turn a list, a paragraph and a list item into one list with all three as list items",
                async () => {
                    await testEditor({
                        contentBefore:
                            "<ul><li>a[b</li></ul><p>cd</p><ul><li>e]f</li><li>gh</li></ul>",
                        stepFunction: toggleUnorderedList,
                        contentAfter: "<ul><li>a[b</li><li>cd</li><li>e]f</li><li>gh</li></ul>",
                    });
                }
            );
            test.todo("should not turn a non-editable paragraph into a list", async () => {
                await testEditor({
                    contentBefore: '<p>[ab</p><p contenteditable="false">cd</p><p>ef]</p>',
                    stepFunction: toggleUnorderedList,
                    contentAfter:
                        '<ul><li>[ab</li></ul><p contenteditable="false">cd</p><ul><li>ef]</li></ul>',
                });
            });
        });
        describe("Remove", () => {
            test.todo("should turn a list into a paragraph", async () => {
                await testEditor({
                    contentBefore: "<p>ab</p><ul><li>cd[ef]gh</li></ul>",
                    stepFunction: toggleUnorderedList,
                    contentAfter: "<p>ab</p><p>cd[ef]gh</p>",
                });
            });
            test.todo("should turn a list into a heading", async () => {
                await testEditor({
                    contentBefore: "<p>ab</p><ul><li><h1>cd[ef]gh</h1></li></ul>",
                    stepFunction: toggleUnorderedList,
                    contentAfter: "<p>ab</p><h1>cd[ef]gh</h1>",
                });
            });
            test.todo("should turn a list into two paragraphs", async () => {
                await testEditor({
                    contentBefore: "<p>ab</p><ul><li>cd[ef</li><li>gh]ij</li></ul>",
                    stepFunction: toggleUnorderedList,
                    contentAfter: "<p>ab</p><p>cd[ef</p><p>gh]ij</p>",
                });
            });
            test.todo("should turn a list item into a paragraph", async () => {
                await testEditor({
                    contentBefore: "<p>ab</p><ul><li>cd</li><li>ef[gh]ij</li></ul>",
                    stepFunction: toggleUnorderedList,
                    contentAfter: "<p>ab</p><ul><li>cd</li></ul><p>ef[gh]ij</p>",
                });
            });
            test.todo("should not turn a non-editable list into a paragraph", async () => {
                test.todo("should not turn a non-editable list into a paragraph", async () => {
                    await testEditor({
                        contentBefore:
                            '<ul><li>[ab</li></ul><p contenteditable="false">cd</p><ul><li>ef]</li></ul>',
                        stepFunction: toggleUnorderedList,
                        contentAfter: '<p>[ab</p><p contenteditable="false">cd</p><p>ef]</p>',
                    });
                });
            });
        });
    });
    describe("Ordered", () => {
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
            test.todo(
                "should turn two paragraphs in a div into a list with two items",
                async () => {
                    await testEditor({
                        contentBefore: "<div><p>ab[cd</p><p>ef]gh</p></div>",
                        stepFunction: toggleOrderedList,
                        contentAfter: "<div><ol><li>ab[cd</li><li>ef]gh</li></ol></div>",
                    });
                }
            );
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
                        contentBefore:
                            "<ol><li>a[b</li></ol><p>cd</p><ol><li>e]f</li><li>gh</li></ol>",
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
    describe("Checklist", () => {
        describe("Insert", () => {
            test.todo("should turn a paragraph into a checklist", async () => {
                await testEditor({
                    removeCheckIds: true,
                    contentBefore: "<p>ab</p><p>cd[ef]gh</p>",
                    stepFunction: toggleCheckList,
                    contentAfter: '<p>ab</p><ul class="o_checklist"><li>cd[ef]gh</li></ul>',
                });
            });
            test.todo("should turn a heading into a checklist", async () => {
                await testEditor({
                    removeCheckIds: true,
                    contentBefore: "<p>ab</p><h1>cd[ef]gh</h1>",
                    stepFunction: toggleCheckList,
                    contentAfter:
                        '<p>ab</p><ul class="o_checklist"><li><h1>cd[ef]gh</h1></li></ul>',
                });
            });
            test.todo("should turn two paragraphs into a checklist with two items", async () => {
                await testEditor({
                    removeCheckIds: true,
                    contentBefore: "<p>ab</p><p>cd[ef</p><p>gh]ij</p>",
                    stepFunction: toggleCheckList,
                    contentAfter:
                        '<p>ab</p><ul class="o_checklist"><li>cd[ef</li><li>gh]ij</li></ul>',
                });
            });
            test.todo(
                "should turn two paragraphs in a div into a checklist with two items",
                async () => {
                    await testEditor({
                        removeCheckIds: true,
                        contentBefore: "<div><p>ab[cd</p><p>ef]gh</p></div>",
                        stepFunction: toggleCheckList,
                        contentAfter:
                            '<div><ul class="o_checklist"><li>ab[cd</li><li>ef]gh</li></ul></div>',
                    });
                }
            );
            test.todo(
                "should turn a paragraph and a checklist item into two list items",
                async () => {
                    await testEditor({
                        removeCheckIds: true,
                        contentBefore:
                            '<p>a[b</p><ul class="o_checklist"><li class="o_checked">c]d</li><li>ef</li></ul>',
                        stepFunction: toggleCheckList,
                        contentAfter:
                            '<ul class="o_checklist"><li>a[b</li><li class="o_checked">c]d</li><li>ef</li></ul>',
                    });
                    await testEditor({
                        removeCheckIds: true,
                        contentBefore:
                            '<p>a[b</p><ul class="o_checklist"><li class="o_checked">c]d</li><li class="o_checked">ef</li></ul>',
                        stepFunction: toggleCheckList,
                        contentAfter:
                            '<ul class="o_checklist"><li>a[b</li><li class="o_checked">c]d</li><li class="o_checked">ef</li></ul>',
                    });
                }
            );
            test.todo(
                "should turn a checklist item and a paragraph into two list items",
                async () => {
                    await testEditor({
                        removeCheckIds: true,
                        contentBefore:
                            '<ul class="o_checklist"><li>ab</li><li class="o_checked">c[d</li></ul><p>e]f</p>',
                        stepFunction: toggleCheckList,
                        contentAfter:
                            '<ul class="o_checklist"><li>ab</li><li class="o_checked">c[d</li><li>e]f</li></ul>',
                    });
                }
            );
            test.todo(
                "should turn a checklist, a paragraph and another list into one list with three list items",
                async () => {
                    await testEditor({
                        removeCheckIds: true,
                        contentBefore:
                            '<ul class="o_checklist"><li>a[b</li></ul><p>cd</p><ul class="o_checklist"><li class="o_checked">e]f</li></ul>',
                        stepFunction: toggleCheckList,
                        contentAfter:
                            '<ul class="o_checklist"><li>a[b</li><li>cd</li><li class="o_checked">e]f</li></ul>',
                    });
                }
            );
            test.todo(
                "should turn a checklist item, a paragraph and another list into one list with all three as list items",
                async () => {
                    await testEditor({
                        removeCheckIds: true,
                        contentBefore:
                            '<ul class="o_checklist"><li class="o_checked">ab<li>c[d</li></ul><p>ef</p><ul class="o_checklist"><li class="o_checked">g]h</li></ul>',
                        stepFunction: toggleCheckList,
                        contentAfter:
                            '<ul class="o_checklist"><li class="o_checked">ab</li><li>c[d</li><li>ef</li><li class="o_checked">g]h</li></ul>',
                    });
                }
            );
            test.todo(
                "should turn a checklist, a paragraph and a checklist item into one list with all three as list items",
                async () => {
                    await testEditor({
                        removeCheckIds: true,
                        contentBefore:
                            '<ul class="o_checklist"><li class="o_checked">a[b</li></ul><p>cd</p><ul class="o_checklist"><li class="o_checked">e]f</li><li>gh</li></ul>',
                        stepFunction: toggleCheckList,
                        contentAfter:
                            '<ul class="o_checklist"><li class="o_checked">a[b</li><li>cd</li><li class="o_checked">e]f</li><li>gh</li></ul>',
                    });
                }
            );
        });
        describe("Remove", () => {
            test.todo("should turn a checklist into a paragraph", async () => {
                await testEditor({
                    contentBefore: '<p>ab</p><ul class="o_checklist"><li>cd[ef]gh</li></ul>',
                    stepFunction: toggleCheckList,
                    contentAfter: "<p>ab</p><p>cd[ef]gh</p>",
                });
            });
            test.todo("should turn a checklist into a heading", async () => {
                await testEditor({
                    contentBefore:
                        '<p>ab</p><ul class="o_checklist"><li><h1>cd[ef]gh</h1></li></ul>',
                    stepFunction: toggleCheckList,
                    contentAfter: "<p>ab</p><h1>cd[ef]gh</h1>",
                });
            });
            test.todo("should turn a checklist into two paragraphs", async () => {
                await testEditor({
                    contentBefore:
                        '<p>ab</p><ul class="o_checklist"><li>cd[ef</li><li>gh]ij</li></ul>',
                    stepFunction: toggleCheckList,
                    contentAfter: "<p>ab</p><p>cd[ef</p><p>gh]ij</p>",
                });
            });
            test.todo("should turn a checklist item into a paragraph", async () => {
                await testEditor({
                    removeCheckIds: true,
                    contentBefore:
                        '<p>ab</p><ul class="o_checklist"><li class="o_checked">cd</li><li class="o_checked">ef[gh]ij</li></ul>',
                    stepFunction: toggleCheckList,
                    contentAfter:
                        '<p>ab</p><ul class="o_checklist"><li class="o_checked">cd</li></ul><p>ef[gh]ij</p>',
                });
            });
        });
    });
    describe("Mixed", () => {
        test.todo("should turn an ordered list into an unordered list", async () => {
            await testEditor({
                contentBefore: "<ol><li>a[b]c</li></ol>",
                stepFunction: toggleUnorderedList,
                contentAfter: "<ul><li>a[b]c</li></ul>",
            });
        });
        test.todo("should turn an unordered list into an ordered list", async () => {
            await testEditor({
                contentBefore: "<ul><li>a[b]c</li></ul>",
                stepFunction: toggleOrderedList,
                contentAfter: "<ol><li>a[b]c</li></ol>",
            });
        });
        test.todo(
            "should turn a paragraph and an unordered list item into an ordered list and an unordered list",
            async () => {
                await testEditor({
                    contentBefore: "<p>a[b</p><ul><li>c]d</li><li>ef</li></ul>",
                    stepFunction: toggleOrderedList,
                    contentAfter: "<ol><li>a[b</li><li>c]d</li><li>ef</li></ol>",
                });
            }
        );
        test.todo(
            "should turn a p, an ul list with ao. one nested ul, and another p into one ol with a nested ol",
            async () => {
                await testEditor({
                    contentBefore: unformat(`
                    <p>a[b</p>
                    <ul>
                        <li>cd</li>
                        <li class="oe-nested">
                            <ul>
                                <li>ef</li>
                            </ul>
                        </li>
                        <li>gh</li>
                    </ul>
                    <p>i]j</p>`),
                    stepFunction: toggleOrderedList,
                    contentAfter: unformat(`
                    <ol>
                        <li>a[b</li>
                        <li>cd</li>
                        <li class="oe-nested">
                            <ol>
                                <li>ef</li>
                            </ol>
                        </li>
                        <li>gh</li>
                        <li>i]j</li>
                    </ol>`),
                });
            }
        );
        test.todo(
            "should turn unordered list into ordered list with block style applied to it",
            async () => {
                await testEditor({
                    contentBefore: unformat(`
                                <ul>
                                    <li><h1>abc</h1></li>
                                    <li class="oe-nested">
                                        <ul>
                                            <li><h2>a[bc</h2></li>
                                            <li class="oe-nested">
                                                <ul>
                                                    <li><h2>abc</h2></li>
                                                    <li><h3>abc</h3></li>
                                                    <li><h4>abc</h4></li>
                                                </ul>
                                            </li>
                                            <li><h2>abc</h2></li>
                                        </ul>
                                    </li>
                                    <li><h1>abc</h1></li>
                                    <li class="oe-nested">
                                        <ul>
                                            <li><h2>abc</h2></li>
                                            <li class="oe-nested">
                                                <ul>
                                                    <li><h2>abc</h2></li>
                                                    <li><h3>abc</h3></li>
                                                    <li><h4>abc</h4></li>
                                                </ul>
                                            </li>
                                            <li><h2>a]bc</h2></li>
                                        </ul>
                                    </li>
                                    <li><h1>abc</h1></li>
                                </ul>
                            `),
                    stepFunction: toggleOrderedList,
                    contentAfter: unformat(`
                                <ol>
                                    <li><h1>abc</h1></li>
                                    <li class="oe-nested">
                                        <ol>
                                            <li><h2>a[bc</h2></li>
                                            <li class="oe-nested">
                                                <ol>
                                                    <li><h2>abc</h2></li>
                                                    <li><h3>abc</h3></li>
                                                    <li><h4>abc</h4></li>
                                                </ol>
                                            </li>
                                            <li><h2>abc</h2></li>
                                        </ol>
                                    </li>
                                    <li><h1>abc</h1></li>
                                    <li class="oe-nested">
                                        <ol>
                                            <li><h2>abc</h2></li>
                                            <li class="oe-nested">
                                                <ol>
                                                    <li><h2>abc</h2></li>
                                                    <li><h3>abc</h3></li>
                                                    <li><h4>abc</h4></li>
                                                </ol>
                                            </li>
                                            <li><h2>a]bc</h2></li>
                                        </ol>
                                    </li>
                                    <li><h1>abc</h1></li>
                                </ol>`),
                });
            }
        );
        test.todo(
            "should turn unordered list into ordered list with block and inline style applied to it",
            async () => {
                await testEditor({
                    contentBefore: unformat(`
                        <ul>
                            <li><h1><strong>abc</strong></h1></li>
                            <li class="oe-nested">
                                <ul>
                                    <li><h3><strong>a[bc</strong></h3></li>
                                    <li class="oe-nested">
                                        <ul>
                                            <li><h2><em>abc</em></h2></li>
                                            <li><h2><s>abc</s></h2></li>
                                            <li><h2><u>abc</u></h2></li>
                                        </ul>
                                    </li>
                                    <li><h1><strong>abc</strong></h1></li>
                                </ul>
                            </li>
                            <li><h1><strong>abc</strong></h1></li>
                            <li class="oe-nested">
                                <ul>
                                    <li><h3><strong>abc</strong></h3></li>
                                    <li class="oe-nested">
                                        <ul>
                                            <li><h2><em>abc</em></h2></li>
                                            <li><h2><s>abc</s></h2></li>
                                            <li><h2><u>abc</u></h2></li>
                                        </ul>
                                    </li>
                                    <li><h1><strong>a]bc</strong></h1></li>
                                </ul>
                            </li>
                            <li><h1><strong>abc</strong></h1></li>
                        </ul>
                        `),
                    stepFunction: toggleOrderedList,
                    contentAfter: unformat(`
                        <ol>
                            <li><h1><strong>abc</strong></h1></li>
                            <li class="oe-nested">
                                <ol>
                                    <li><h3><strong>a[bc</strong></h3></li>
                                    <li class="oe-nested">
                                        <ol>
                                            <li><h2><em>abc</em></h2></li>
                                            <li><h2><s>abc</s></h2></li>
                                            <li><h2><u>abc</u></h2></li>
                                        </ol>
                                    </li>
                                    <li><h1><strong>abc</strong></h1></li>
                                </ol>
                            </li>
                            <li><h1><strong>abc</strong></h1></li>
                            <li class="oe-nested">
                                <ol>
                                    <li><h3><strong>abc</strong></h3></li>
                                    <li class="oe-nested">
                                        <ol>
                                            <li><h2><em>abc</em></h2></li>
                                            <li><h2><s>abc</s></h2></li>
                                            <li><h2><u>abc</u></h2></li>
                                        </ol>
                                    </li>
                                    <li><h1><strong>a]bc</strong></h1></li>
                                </ol>
                            </li>
                            <li><h1><strong>abc</strong></h1></li>
                        </ol>`),
                });
            }
        );
        test.todo(
            "should turn an unordered list item and a paragraph into two list items within an ordered list",
            async () => {
                await testEditor({
                    contentBefore: "<ul><li>ab</li><li>c[d</li></ul><p>e]f</p>",
                    stepFunction: toggleOrderedList,
                    contentAfter: "<ol><li>ab</li><li>c[d</li><li>e]f</li></ol>",
                });
            }
        );
        test.todo(
            "should turn an unordered list, a paragraph and an ordered list into one ordered list with three list items",
            async () => {
                await testEditor({
                    contentBefore: "<ul><li>a[b</li></ul><p>cd</p><ol><li>e]f</li></ol>",
                    stepFunction: toggleOrderedList,
                    contentAfter: "<ol><li>a[b</li><li>cd</li><li>e]f</li></ol>",
                });
            }
        );
        test.todo(
            "should turn an unordered list item, a paragraph and an ordered list into one ordered list with all three as list items",
            async () => {
                await testEditor({
                    contentBefore: "<ul><li>ab<li>c[d</li></ul><p>ef</p><ol><li>g]h</li></ol>",
                    stepFunction: toggleOrderedList,
                    contentAfter: "<ol><li>ab</li><li>c[d</li><li>ef</li><li>g]h</li></ol>",
                });
            }
        );
        test.todo(
            "should turn an ordered list, a paragraph and an unordered list item into one ordered list with all three as list items",
            async () => {
                await testEditor({
                    contentBefore: "<ol><li>a[b</li></ol><p>cd</p><ul><li>e]f</li><li>gh</li></ul>",
                    stepFunction: toggleOrderedList,
                    contentAfter: "<ol><li>a[b</li><li>cd</li><li>e]f</li><li>gh</li></ol>",
                });
            }
        );
        test.todo(
            "should turn an unordered list within an unordered list into an ordered list within an unordered list",
            async () => {
                await testEditor({
                    contentBefore: unformat(`
                    <ul>
                        <li>ab</li>
                        <li class="oe-nested">
                            <ul>
                                <li>c[d</li>
                                <li>e]f</li>
                            </ul>
                        </li>
                        <li>gh</li>
                    </ul>`),
                    stepFunction: toggleOrderedList,
                    contentAfter: unformat(`
                    <ul>
                        <li>ab</li>
                        <li class="oe-nested">
                            <ol>
                                <li>c[d</li>
                                <li>e]f</li>
                            </ol>
                        </li>
                        <li>gh</li>
                    </ul>`),
                });
            }
        );
        test.todo(
            "should turn an unordered list with mixed nested elements into an ordered list with only unordered elements",
            async () => {
                await testEditor({
                    contentBefore: unformat(`
                    <ul>
                        <li>a[b</li>
                        <li>cd</li>
                        <li class="oe-nested">
                            <ul>
                                <li>ef</li>
                                <li>gh</li>
                                <li class="oe-nested">
                                    <ol>
                                        <li>ij</li>
                                        <li>kl</li>
                                        <li class="oe-nested">
                                            <ul>
                                                <li>mn</li>
                                            </ul>
                                        </li>
                                        <li>op</li>
                                    </ol>
                                </li>
                            </ul>
                        </li>
                        <li>q]r</li>
                        <li>st</li>
                    </ul>`),
                    stepFunction: toggleOrderedList,
                    contentAfter: unformat(`
                    <ol>
                        <li>a[b</li>
                        <li>cd</li>
                        <li class="oe-nested">
                            <ol>
                                <li>ef</li>
                                <li>gh</li>
                                <li class="oe-nested">
                                    <ol>
                                        <li>ij</li>
                                        <li>kl</li>
                                        <li class="oe-nested">
                                            <ol>
                                                <li>mn</li>
                                            </ol>
                                        </li>
                                        <li>op</li>
                                    </ol>
                                </li>
                            </ol>
                        </li>
                        <li>q]r</li>
                        <li>st</li>
                    </ol>`),
                });
            }
        );
        test.todo("should convert within mixed lists", async () => {
            await testEditor({
                contentBefore: unformat(`
                    <ul>
                        <li>a</li>
                        <li>b</li>
                        <li class="oe-nested">
                            <ol>
                                <li>c</li>
                                <li>d</li>
                                <li class="oe-nested">
                                    <ul>
                                        <li>[]e</li>
                                        <li>f</li>
                                        <li class="oe-nested">
                                            <ul>
                                                <li>g</li>
                                            </ul>
                                        </li>
                                        <li>h</li>
                                    </ul>
                                </li>
                            </ol>
                        </li>
                        <li>qr</li>
                        <li>st</li>
                    </ul>`),
                stepFunction: toggleOrderedList,
                contentAfter: unformat(`
                    <ul>
                        <li>a</li>
                        <li>b</li>
                        <li class="oe-nested">
                            <ol>
                                <li>c</li>
                                <li>d</li>
                                <li class="oe-nested">
                                    <ol>
                                        <li>[]e</li>
                                        <li>f</li>
                                        <li class="oe-nested">
                                            <ul>
                                                <li>g</li>
                                            </ul>
                                        </li>
                                        <li>h</li>
                                    </ol>
                                </li>
                            </ol>
                        </li>
                        <li>qr</li>
                        <li>st</li>
                    </ul>`),
            });
        });
        test.todo("should turn an unordered list into a checklist", async () => {
            await testEditor({
                removeCheckIds: true,
                contentBefore: "<ul><li>a[b]c</li></ul>",
                stepFunction: toggleCheckList,
                contentAfter: '<ul class="o_checklist"><li>a[b]c</li></ul>',
            });
        });
        test.todo(
            "should turn an unordered list into a checklist just after a checklist",
            async () => {
                await testEditor({
                    removeCheckIds: true,
                    contentBefore:
                        '<ul class="o_checklist"><li class="o_checked">abc</li></ul><ul><li>d[e]f</li></ul>',
                    stepFunction: toggleCheckList,
                    contentAfter:
                        '<ul class="o_checklist"><li class="o_checked">abc</li><li>d[e]f</li></ul>',
                });
            }
        );
        test.todo(
            "should turn an unordered list into a checklist just after a checklist and inside a checklist",
            async () => {
                await testEditor({
                    removeCheckIds: true,
                    contentBefore: unformat(`
                    <ul class="o_checklist">
                        <li class="o_checked">title</li>
                        <li class="oe-nested">
                            <ul class="o_checklist">
                                <li class="o_checked">abc</li>
                            </ul>
                        </li>
                        <li class="oe-nested">
                            <ul>
                                <li>d[e]f</li>
                            </ul>
                        </li>
                    </ul>`),
                    stepFunction: toggleCheckList,
                    contentAfter: unformat(`
                    <ul class="o_checklist">
                        <li class="o_checked">title</li>
                        <li class="oe-nested">
                            <ul class="o_checklist">
                                <li class="o_checked">abc</li>
                                <li>d[e]f</li>
                            </ul>
                        </li>
                    </ul>`),
                });
            }
        );
    });
});
