/** @odoo-module */

import { describe, test } from "@odoo/hoot";
import { testEditor } from "../../test_helpers/editor";
import { unformat } from "../../test_helpers/format";
import { indentList, keydownTab } from "../../test_helpers/user_actions";

describe("Checklist", () => {
    test("should indent a checklist", async () => {
        await testEditor({
            removeCheckIds: true,
            contentBefore: unformat(`
                    <ul class="o_checklist">
                        <li class="o_checked">a[b]c</li>
                    </ul>`),
            stepFunction: indentList,
            contentAfter: unformat(`
                    <ul class="o_checklist">
                        <li class="oe-nested">
                            <ul class="o_checklist">
                                <li class="o_checked">a[b]c</li>
                            </ul>
                        </li>
                    </ul>`),
        });
        await testEditor({
            removeCheckIds: true,
            contentBefore: unformat(`
                    <ul class="o_checklist">
                        <li>a[b]c</li>
                    </ul>`),
            stepFunction: indentList,
            contentAfter: unformat(`
                    <ul class="o_checklist">
                        <li class="oe-nested">
                            <ul class="o_checklist">
                                <li>a[b]c</li>
                            </ul>
                        </li>
                    </ul>`),
        });
    });

    test('should indent a checklist and previous line become the "title"', async () => {
        await testEditor({
            removeCheckIds: true,
            contentBefore: unformat(`
                    <ul class="o_checklist">
                        <li class="o_checked">abc</li>
                        <li class="o_checked">d[e]f</li>
                    </ul>`),
            stepFunction: indentList,
            contentAfter: unformat(`
                    <ul class="o_checklist">
                        <li class="o_checked">abc</li>
                        <li class="oe-nested">
                            <ul class="o_checklist">
                            <li class="o_checked">d[e]f</li>
                            </ul>
                        </li>
                    </ul>`),
        });
        await testEditor({
            removeCheckIds: true,
            contentBefore: unformat(`
                    <ul class="o_checklist">
                        <li class="o_checked">abc</li>
                        <li>d[e]f</li>
                    </ul>`),
            stepFunction: indentList,
            contentAfter: unformat(`
                    <ul class="o_checklist">
                        <li class="o_checked">abc</li>
                        <li class="oe-nested">
                            <ul class="o_checklist">
                                <li>d[e]f</li>
                            </ul>
                        </li>
                    </ul>`),
        });
        await testEditor({
            removeCheckIds: true,
            contentBefore: unformat(`
                    <ul class="o_checklist">
                        <li>abc</li>
                        <li>d[e]f</li>
                    </ul>`),
            stepFunction: indentList,
            contentAfter: unformat(`
                    <ul class="o_checklist">
                        <li>abc</li>
                        <li class="oe-nested">
                            <ul class="o_checklist">
                            <li>d[e]f</li>
                            </ul>
                        </li>
                    </ul>`),
        });
        await testEditor({
            removeCheckIds: true,
            contentBefore: unformat(`
                    <ul class="o_checklist">
                        <li>abc</li>
                        <li class="o_checked">d[e]f</li>
                    </ul>`),
            stepFunction: indentList,
            contentAfter: unformat(`
                    <ul class="o_checklist">
                        <li>abc</li>
                        <li class="oe-nested">
                            <ul class="o_checklist">
                            <li class="o_checked">d[e]f</li>
                            </ul>
                        </li>
                    </ul>`),
        });
    });

    test("should indent a checklist and merge it with previous siblings", async () => {
        await testEditor({
            contentBefore: unformat(`
                    <ul class="o_checklist">
                        <li class="oe-nested">
                            <ul class="o_checklist">
                                <li class="o_checked">def</li>
                            </ul>
                        </li>
                        <li class="o_checked">g[h]i</li>
                    </ul>`),
            stepFunction: indentList,
            contentAfter: unformat(`
                    <ul class="o_checklist">
                        <li class="oe-nested">
                            <ul class="o_checklist">
                                <li class="o_checked">def</li>
                                <li class="o_checked">g[h]i</li>
                            </ul>
                        </li>
                    </ul>`),
        });

        await testEditor({
            contentBefore: unformat(`
                    <ul class="o_checklist">
                        <li>abc</li>
                        <li class="oe-nested">
                            <ul class="o_checklist">
                                <li>def</li>
                            </ul>
                        </li>
                        <li class="o_checked">g[h]i</li>
                    </ul>`),
            stepFunction: indentList,
            contentAfter: unformat(`
                    <ul class="o_checklist">
                        <li>abc</li>
                        <li class="oe-nested">
                            <ul class="o_checklist">
                                <li>def</li>
                                <li class="o_checked">g[h]i</li>
                            </ul>
                        </li>
                    </ul>`),
        });
        await testEditor({
            contentBefore: unformat(`
                    <ul class="o_checklist">
                        <li class="o_checked">abc</li>
                        <li class="oe-nested">
                            <ul class="o_checklist">
                                <li class="o_checked">def</li>
                            </ul>
                        </li>
                        <li>g[h]i</li>
                    </ul>`),
            stepFunction: indentList,
            contentAfter: unformat(`
                    <ul class="o_checklist">
                        <li class="o_checked">abc</li>
                        <li class="oe-nested">
                            <ul class="o_checklist">
                                <li class="o_checked">def</li>
                                <li>g[h]i</li>
                            </ul>
                        </li>
                    </ul>`),
        });
    });

    test("should indent a checklist and merge it with next siblings", async () => {
        await testEditor({
            contentBefore: unformat(`
                    <ul class="o_checklist">
                        <li class="o_checked">abc</li>
                        <li class="o_checked">d[e]f</li>
                        <li class="oe-nested">
                            <ul class="o_checklist">
                                <li class="o_checked">ghi</li>
                            </ul>
                        </li>
                    </ul>`),
            stepFunction: indentList,
            contentAfter: unformat(`
                    <ul class="o_checklist">
                        <li class="o_checked">abc</li>
                        <li class="oe-nested">
                            <ul class="o_checklist">
                                <li class="o_checked">d[e]f</li>
                                <li class="o_checked">ghi</li>
                            </ul>
                        </li>
                    </ul>`),
        });
        await testEditor({
            contentBefore: unformat(`
                    <ul class="o_checklist">
                        <li>abc</li>
                        <li class="o_checked">d[e]f</li>
                        <li class="oe-nested">
                            <ul class="o_checklist">
                                <li class="o_checked">ghi</li>
                            </ul>
                        </li>
                    </ul>`),
            stepFunction: indentList,
            contentAfter: unformat(`
                    <ul class="o_checklist">
                        <li>abc</li>
                        <li class="oe-nested">
                            <ul class="o_checklist">
                                <li class="o_checked">d[e]f</li>
                                <li class="o_checked">ghi</li>
                            </ul>
                        </li>
                    </ul>`),
        });
        await testEditor({
            contentBefore: unformat(`
                    <ul class="o_checklist">
                        <li class="o_checked">abc</li>
                        <li>d[e]f</li>
                        <li class="oe-nested">
                            <ul class="o_checklist">
                                <li>ghi</li>
                            </ul>
                        </li>
                    </ul>`),
            stepFunction: indentList,
            contentAfter: unformat(`
                    <ul class="o_checklist">
                        <li class="o_checked">abc</li>
                        <li class="oe-nested">
                            <ul class="o_checklist">
                                <li>d[e]f</li>
                                <li>ghi</li>
                            </ul>
                        </li>
                    </ul>`),
        });
    });
});

describe("Regular list", () => {
    test("should indent a regular list empty item", async () => {
        await testEditor({
            contentBefore: unformat(`
                    <ul>
                        <li>abc</li>
                        <li>[]</li>
                    </ul>
                    <p>def</p>`),
            stepFunction: indentList,
            contentAfter: unformat(`
                    <ul>
                        <li>abc</li>
                        <li class="oe-nested">
                            <ul>
                                <li>[]</li>
                            </ul>
                        </li>
                    </ul>
                    <p>def</p>`),
        });
    });

    test.todo("should indent a regular list empty item after an insertParagraphBreak", async () => {
        await testEditor({
            contentBefore: unformat(`
                    <ul>
                        <li>abc[]</li>
                    </ul>
                    <p>def</p>`),
            stepFunction: async (editor) => {
                await editor.execCommand("oEnter");
                await editor.execCommand("oTab");
            },
            contentAfter: unformat(`
                    <ul>
                        <li>abc</li>
                        <li class="oe-nested">
                            <ul>
                                <li>[]<br></li>
                            </ul>
                        </li>
                    </ul>
                    <p>def</p>`),
        });
    });
});

describe("with selection collapsed", () => {
    test("should indent the first element of a list", async () => {
        await testEditor({
            contentBefore: unformat(`
                <ul>
                    <li>a[]</li>
                    <li>b</li>
                </ul>`),
            stepFunction: indentList,
            contentAfter: unformat(`
                <ul>
                    <li class="oe-nested">
                        <ul>
                            <li>a[]</li>
                        </ul>
                    </li>
                    <li>b</li>
                </ul>`),
        });
    });

    test("should indent the last element of a list", async () => {
        await testEditor({
            contentBefore: unformat(`
                <ul>
                    <li>a</li>
                    <li>[]b</li>
                </ul>`),
            stepFunction: indentList,
            contentAfter: unformat(`
                <ul>
                    <li>
                        a
                    </li>
                    <li class="oe-nested">
                        <ul>
                            <li>[]b</li>
                        </ul>
                    </li>
                </ul>`),
        });
    });

    test("should indent multi-level", async () => {
        await testEditor({
            contentBefore: unformat(`
                <ul>
                    <li>
                        a
                        <ul>
                            <li>[]b</li>
                        </ul>
                    </li>
                </ul>`),
            stepFunction: indentList,
            contentAfter: unformat(`
                <ul>
                    <li>
                        a
                        <ul>
                            <li class="oe-nested">
                                <ul>
                                    <li>[]b</li>
                                </ul>
                            </li>
                        </ul>
                    </li>
                </ul>`),
        });
    });

    test("should indent the last element of a list with proper with unordered list", async () => {
        await testEditor({
            contentBefore: unformat(`
                <ol>
                    <li>a</li>
                    <li>[]b</li>
                </ol>`),
            stepFunction: indentList,
            contentAfter: unformat(`
                <ol>
                    <li>
                        a
                    </li>
                    <li class="oe-nested">
                        <ol>
                            <li>[]b</li>
                        </ol>
                    </li>
                </ol>`),
        });
    });

    test("should indent the middle element of a list", async () => {
        await testEditor({
            contentBefore: unformat(`
                <ul>
                    <li>a</li>
                    <li>[]b</li>
                    <li>c</li>
                </ul>`),
            stepFunction: indentList,
            contentAfter: unformat(`
                <ul>
                    <li>
                        a
                    </li>
                    <li class="oe-nested">
                        <ul>
                            <li>[]b</li>
                        </ul>
                    </li>
                    <li>
                        c
                    </li>
                </ul>`),
        });
    });

    test("should indent even if the first element of a list is selected", async () => {
        await testEditor({
            contentBefore: unformat(`
                <ul>
                    <li>[]a</li>
                    <li>b</li>
                </ul>`),
            stepFunction: indentList,
            contentAfter: unformat(`
                <ul>
                    <li class="oe-nested">
                        <ul>
                            <li>[]a</li>
                        </ul>
                    </li>
                    <li>b</li>
                </ul>`),
        });
    });

    test("should indent only one element of a list with sublist", async () => {
        await testEditor({
            contentBefore: unformat(`
                <ul>
                    <li>a</li>
                    <li>
                        []b
                    </li>
                    <li class="oe-nested">
                        <ul>
                            <li>c</li>
                        </ul>
                    </li>
                </ul>`),
            stepFunction: indentList,
            contentAfter: unformat(`
                <ul>
                    <li>
                        a
                    </li>
                    <li class="oe-nested">
                        <ul>
                            <li>[]b</li>
                            <li>c</li>
                        </ul>
                    </li>
                </ul>`),
        });
    });

    test("should convert mixed lists", async () => {
        await testEditor({
            contentBefore: unformat(`
                <ul>
                    <li>a</li>
                    <li>
                        []b
                    </li>
                    <li class="oe-nested">
                        <ol>
                            <li>c</li>
                        </ol>
                    </li>
                </ul>`),
            stepFunction: indentList,
            contentAfter: unformat(`
                <ul>
                    <li>
                        a
                    </li>
                    <li class="oe-nested">
                        <ol>
                            <li>[]b</li>
                            <li>c</li>
                        </ol>
                    </li>
                </ul>`),
        });
    });

    test("should rejoin after indent", async () => {
        await testEditor({
            contentBefore: unformat(`
                <ol>
                    <li class="oe-nested">
                        <ol>
                            <li>a</li>
                        </ol>
                    </li>
                    <li>
                        []b
                    </li>
                    <li class="oe-nested">
                        <ol>
                            <li>c</li>
                        </ol>
                    </li>
                </ol>`),
            stepFunction: indentList,
            contentAfter: unformat(`
                <ol>
                    <li class="oe-nested">
                        <ol>
                            <li>a</li>
                            <li>[]b</li>
                            <li>c</li>
                        </ol>
                    </li>
                </ol>`),
        });
    });

    test("should indent unordered list inside a table cell", async () => {
        await testEditor({
            contentBefore: unformat(`
                        <table>
                            <tbody>
                                <tr>
                                    <td>
                                        <ul>
                                            <li>abc</li>
                                            <li>def[]</li>
                                        </ul>
                                    </td>
                                    <td>
                                        ghi
                                    </td>
                                    <td>
                                        jkl
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    `),
            stepFunction: async (editor) => keydownTab(editor),
            contentAfter: unformat(`
                        <table>
                            <tbody>
                                <tr>
                                    <td>
                                        <ul>
                                            <li>abc</li>
                                            <li class="oe-nested">
                                                <ul>
                                                    <li>def[]</li>
                                                </ul>
                                            </li>
                                        </ul>
                                    </td>
                                    <td>
                                        ghi
                                    </td>
                                    <td>
                                        jkl
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    `),
        });
    });

    test("should indent checklist inside a table cell", async () => {
        await testEditor({
            removeCheckIds: true,
            contentBefore: unformat(`
                        <table>
                            <tbody>
                                <tr>
                                    <td>
                                        <ul class="o_checklist">
                                            <li>abc</li>
                                            <li>def[]</li>
                                        </ul>
                                    </td>
                                    <td>
                                        ghi
                                    </td>
                                    <td>
                                        jkl
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    `),
            stepFunction: async (editor) => keydownTab(editor),
            contentAfter: unformat(`
                        <table>
                            <tbody>
                                <tr>
                                    <td>
                                        <ul class="o_checklist">
                                            <li>abc</li>
                                            <li class="oe-nested">
                                                <ul class="o_checklist">
                                                    <li>def[]</li>
                                                </ul>
                                            </li>
                                        </ul>
                                    </td>
                                    <td>
                                        ghi
                                    </td>
                                    <td>
                                        jkl
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    `),
        });
    });
});

describe("with selection", () => {
    test("should indent the first element of a list", async () => {
        await testEditor({
            contentBefore: unformat(`
                <ul>
                    <li>[a]</li>
                    <li>b</li>
                </ul>`),
            stepFunction: indentList,
            contentAfter: unformat(`
                <ul>
                    <li class="oe-nested">
                        <ul>
                            <li>[a]</li>
                        </ul>
                    </li>
                    <li>b</li>
                </ul>`),
        });
    });

    test("should indent the middle element of a list", async () => {
        await testEditor({
            contentBefore: unformat(`
                <ul>
                    <li>a</li>
                    <li>[b]</li>
                    <li>c</li>
                </ul>`),
            stepFunction: indentList,
            contentAfter: unformat(`
                <ul>
                    <li>
                        a
                    </li>
                    <li class="oe-nested">
                        <ul>
                            <li>[b]</li>
                        </ul>
                    </li>
                    <li>
                        c
                    </li>
                </ul>`),
        });
    });

    test("should indent multi-level", async () => {
        await testEditor({
            contentBefore: unformat(`
                <ul>
                    <li>
                        a
                    </li>
                    <li class="oe-nested">
                        <ul>
                            <li>[b]</li>
                        </ul>
                    </li>
                </ul>`),
            stepFunction: indentList,
            contentAfter: unformat(`
                <ul>
                    <li>
                        a
                    </li>
                    <li class="oe-nested">
                        <ul>
                            <li class="oe-nested">
                                <ul>
                                    <li>[b]</li>
                                </ul>
                            </li>
                        </ul>
                    </li>
                </ul>`),
        });
        await testEditor({
            contentBefore: unformat(`
                <ul>
                    <li>
                        a
                    </li>
                    <li class="oe-nested">
                        <ul>
                            <li class="oe-nested">
                                <ul>
                                    <li>[b]</li>
                                </ul>
                            </li>
                        </ul>
                    </li>
                </ul>`),
            stepFunction: indentList,
            contentAfter: unformat(`
                <ul>
                    <li>
                        a
                    </li>
                    <li class="oe-nested">
                        <ul>
                            <li class="oe-nested">
                                <ul>
                                    <li class="oe-nested">
                                        <ul>
                                            <li>[b]</li>
                                        </ul>
                                    </li>
                                </ul>
                            </li>
                        </ul>
                    </li>
                </ul>`),
        });
    });

    test("should indent two multi-levels", async () => {
        await testEditor({
            contentBefore: unformat(`
                <ul>
                    <li>
                        a
                    </li>
                    <li class="oe-nested">
                        <ul>
                            <li>[b</li>
                            <li class="oe-nested">
                                <ul>
                                    <li>c]</li>
                                </ul>
                            </li>
                        </ul>
                    </li>
                </ul>`),
            stepFunction: indentList,
            contentAfter: unformat(`
                <ul>
                    <li>
                        a
                    </li>
                    <li class="oe-nested">
                        <ul>
                            <li class="oe-nested">
                                <ul>
                                    <li>[b</li>
                                    <li class="oe-nested">
                                        <ul>
                                            <li>c]</li>
                                        </ul>
                                    </li>
                                </ul>
                            </li>
                        </ul>
                    </li>
                </ul>`),
        });
        await testEditor({
            contentBefore: unformat(`
                <ul>
                    <li>
                        a
                    </li>
                    <li class="oe-nested">
                        <ul>
                            <li class="oe-nested">
                                <ul>
                                    <li>[b
                                    </li><li class="oe-nested">
                                        <ul>
                                            <li>c]</li>
                                        </ul>
                                    </li>
                                </ul>
                            </li>
                        </ul>
                    </li>
                </ul>`),
            stepFunction: indentList,
            contentAfter: unformat(`
                <ul>
                    <li>
                        a
                    </li>
                    <li class="oe-nested">
                        <ul>
                            <li class="oe-nested">
                                <ul>
                                    <li class="oe-nested">
                                        <ul>
                                            <li>[b</li>
                                            <li class="oe-nested">
                                                <ul>
                                                    <li>c]</li>
                                                </ul>
                                            </li>
                                        </ul>
                                    </li>
                                </ul>
                            </li>
                        </ul>
                    </li>
                </ul>`),
        });
    });

    test("should indent multiples list item in the middle element of a list", async () => {
        await testEditor({
            contentBefore: unformat(`
                <ul>
                    <li>a</li>
                    <li>[b</li>
                    <li>c]</li>
                    <li>d</li>
                </ul>`),
            stepFunction: indentList,
            contentAfter: unformat(`
                <ul>
                    <li>
                        a
                    </li>
                    <li class="oe-nested">
                        <ul>
                            <li>[b</li>
                            <li>c]</li>
                        </ul>
                    </li>
                    <li>
                        d
                    </li>
                </ul>`),
        });
    });

    test("should indent multiples list item with reversed range", async () => {
        await testEditor({
            contentBefore: unformat(`
                <ul>
                    <li>a</li>
                    <li>]b</li>
                    <li>c[</li>
                    <li>d</li>
                </ul>`),
            stepFunction: indentList,
            contentAfter: unformat(`
                <ul>
                    <li>
                        a
                    </li>
                    <li class="oe-nested">
                        <ul>
                            <li>]b</li>
                            <li>c[</li>
                        </ul>
                    </li>
                    <li>
                        d
                    </li>
                </ul>`),
        });
    });

    test("should indent multiples list item in the middle element of a list with sublist", async () => {
        await testEditor({
            contentBefore: unformat(`
                <ul>
                    <li>a</li>
                    <li>
                        [b
                    </li><li class="oe-nested">
                        <ul>
                            <li>c</li>
                        </ul>
                    </li>
                    <li>d]</li>
                    <li>e</li>
                </ul>`),
            stepFunction: indentList,
            contentAfter: unformat(`
                <ul>
                    <li>
                        a
                    </li>
                    <li class="oe-nested">
                        <ul>
                            <li>
                                [b
                            </li>
                            <li class="oe-nested">
                                <ul>
                                    <li>c</li>
                                </ul>
                            </li>
                            <li>d]</li>
                        </ul>
                    </li>
                    <li>e</li>
                </ul>`),
        });
    });

    test("should indent with mixed lists", async () => {
        await testEditor({
            contentBefore: unformat(`
                <ul>
                    <li>a</li>
                    <li>
                        [b
                    </li><li class="oe-nested">
                        <ol>
                            <li>]c</li>
                        </ol>
                    </li>
                </ul>`),
            stepFunction: indentList,
            contentAfter: unformat(`
                <ul>
                    <li>
                        a
                    </li>
                    <li class="oe-nested">
                        <ol>
                            <li>
                                [b
                            </li>
                            <li class="oe-nested">
                                <ol>
                                    <li>]c</li>
                                </ol>
                            </li>
                        </ol>
                    </li>
                </ul>`),
        });
    });

    test("should indent nested list and list with elements in a upper level than the rangestart", async () => {
        await testEditor({
            contentBefore: unformat(`
                <ul>
                    <li>a</li>
                    <li>
                        b
                    </li>
                    <li class="oe-nested">
                        <ul>
                            <li>c</li>
                            <li>[d</li>
                        </ul>
                    </li>
                    <li>
                        e
                    </li>
                    <li class="oe-nested">
                        <ul>
                            <li>f</li>
                            <li>g</li>
                        </ul>
                    </li>
                    <li>h]</li>
                    <li>i</li>
                </ul>`),
            stepFunction: indentList,
            contentAfter: unformat(`
                <ul>
                    <li>a</li>
                    <li>
                        b
                    </li>
                    <li class="oe-nested">
                        <ul>
                            <li>
                                c
                            </li>
                            <li class="oe-nested">
                                <ul>
                                    <li>[d</li>
                                </ul>
                            </li>
                            <li>
                            e
                            </li>
                            <li class="oe-nested">
                            <ul>
                                <li>f</li>
                                <li>g</li>
                            </ul>
                        </li>
                        <li>h]</li>
                        </ul>
                    </li>
                    <li>i</li>
                </ul>`),
        });
    });

    test.todo("should not intent a non-editable list", async () => {
        await testEditor({
            contentBefore: unformat(`
                    <p>[before</p>
                    <ul>
                        <li>a</li>
                    </ul>
                    <ul contenteditable="false">
                        <li>a</li>
                    </ul>
                    <p>after]</p>`),
            stepFunction: indentList,
            contentAfter: unformat(`
                    <p>[before</p>
                    <ul>
                        <li class="oe-nested">
                            <ul>
                                <li>a</li>
                            </ul>
                        </li>
                    </ul>
                    <ul contenteditable="false">
                        <li>a</li>
                    </ul>
                    <p>after]</p>`),
        });
    });

    test("should indent ordered list inside a table cell", async () => {
        await testEditor({
            contentBefore: unformat(`
                        <table>
                            <tbody>
                                <tr>
                                    <td>
                                        <ol>
                                            <li>abc</li>
                                            <li>[def]</li>
                                        </ol>
                                    </td>
                                    <td>
                                        ghi
                                    </td>
                                    <td>
                                        jkl
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    `),
            stepFunction: async (editor) => keydownTab(editor),
            contentAfter: unformat(`
                        <table>
                            <tbody>
                                <tr>
                                    <td>
                                        <ol>
                                            <li>abc</li>
                                            <li class="oe-nested">
                                                <ol>
                                                    <li>[def]</li>
                                                </ol>
                                            </li>
                                        </ol>
                                    </td>
                                    <td>
                                        ghi
                                    </td>
                                    <td>
                                        jkl
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    `),
        });
    });
});
