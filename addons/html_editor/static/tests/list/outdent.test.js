import { describe, test } from "@odoo/hoot";
import { testEditor } from "../_helpers/editor";
import { unformat } from "../_helpers/format";
import { keydownShiftTab } from "../_helpers/user_actions";

describe("Regular list", () => {
    test("should remove the list-style when outdent the list", async () => {
        await testEditor({
            contentBefore: unformat(`
                    <ul>
                        <li style="list-style: cambodian;">
                            <ul>
                                <li>a[b]c</li>
                            </ul>
                        </li>
                    </ul>`),
            stepFunction: keydownShiftTab,
            contentAfter: unformat(`
                    <ul>
                        <li style="list-style: cambodian;"></li>
                        <li>a[b]c</li>
                    </ul>`),
        });
    });
});

describe("Checklist", () => {
    test("should outdent a checklist", async () => {
        await testEditor({
            removeCheckIds: true,
            contentBefore: unformat(`
                    <ul class="o_checklist">
                        <li class="oe-nested">
                            <ul class="o_checklist">
                                <li class="o_checked">a[b]c</li>
                            </ul>
                        </li>
                    </ul>`),
            stepFunction: keydownShiftTab,
            contentAfter: unformat(`
                <ul class="o_checklist">
                    <li class="o_checked">a[b]c</li>
                </ul>`),
        });
        await testEditor({
            removeCheckIds: true,
            contentBefore: unformat(`
                    <ul class="o_checklist">
                        <li class="oe-nested">
                            <ul class="o_checklist">
                                <li>a[b]c</li>
                            </ul>
                        </li>
                    </ul>`),
            stepFunction: keydownShiftTab,
            contentAfter: unformat(`
                    <ul class="o_checklist">
                        <li>a[b]c</li>
                    </ul>`),
        });
    });

    test('should outdent a checklist and previous line as "title"', async () => {
        await testEditor({
            removeCheckIds: true,
            contentBefore: unformat(`
                    <ul class="o_checklist">
                        <li class="o_checked">abc</li>
                        <li class="oe-nested">
                            <ul class="o_checklist">
                                <li class="o_checked">d[e]f</li>
                            </ul>
                        </li>
                    </ul>`),
            stepFunction: keydownShiftTab,
            contentAfter: unformat(`
                    <ul class="o_checklist">
                        <li class="o_checked">abc</li>
                        <li class="o_checked">d[e]f</li>
                    </ul>`),
        });
        await testEditor({
            removeCheckIds: true,
            contentBefore: unformat(`
                    <ul class="o_checklist">
                        <li>abc</li>
                        <li class="oe-nested">
                            <ul class="o_checklist">
                                <li>d[e]f</li>
                            </ul>
                        </li>
                    </ul>`),
            stepFunction: keydownShiftTab,
            contentAfter: unformat(`
                    <ul class="o_checklist">
                        <li>abc</li>
                        <li>d[e]f</li>
                    </ul>`),
        });
    });
});

describe("with selection collapsed", () => {
    test("should outdent the last element of a list", async () => {
        await testEditor({
            contentBefore: unformat(`
                    <ul>
                        <li>
                            a
                        </li><li class="oe-nested">
                            <ul>
                                <li>[]b</li>
                            </ul>
                        </li>
                    </ul>`),
            stepFunction: keydownShiftTab,
            contentAfter: unformat(`
                    <ul>
                        <li>a</li>
                        <li>[]b</li>
                    </ul>`),
        });
    });

    test("should outdent the last element of a list with proper with unordered list", async () => {
        await testEditor({
            contentBefore: unformat(`
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
            stepFunction: keydownShiftTab,
            contentAfter: unformat(`
                    <ol>
                        <li>a</li>
                        <li>[]b</li>
                    </ol>`),
        });
    });

    test("should outdent the middle element of a list", async () => {
        await testEditor({
            contentBefore: unformat(`
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
            stepFunction: keydownShiftTab,
            contentAfter: unformat(`
                    <ul>
                        <li>a</li>
                        <li>[]b</li>
                        <li>c</li>
                    </ul>`),
        });
    });

    test("should outdent if the first element of a list is selected", async () => {
        await testEditor({
            contentBefore: unformat(`
                    <ul>
                        <li>[]a</li>
                        <li>b</li>
                    </ul>`),
            stepFunction: keydownShiftTab,
            contentAfter: unformat(`
                    <p>[]a</p>
                    <ul>
                        <li>b</li>
                    </ul>`),
        });
    });

    test("should outdent the last element of a list with sublist", async () => {
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
                                        <li>[]c</li>
                                    </ul>
                                </li>
                            </ul>
                        </li>
                    </ul>`),
            stepFunction: keydownShiftTab,
            contentAfter: unformat(`
                    <ul>
                        <li>
                            a
                        </li>
                        <li class="oe-nested">
                            <ul>
                                <li>[]c</li>
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
                                <li>[]c</li>
                            </ul>
                        </li>
                    </ul>`),
            stepFunction: keydownShiftTab,
            contentAfter: unformat(`
                    <ul>
                        <li>
                            a
                        </li>
                        <li>[]c</li>
                    </ul>`),
        });
    });

    test("should outdent unordered list inside a table cell", async () => {
        await testEditor({
            contentBefore: unformat(`
                    <table>
                        <tbody>
                            <tr>
                                <td>
                                    ghi
                                </td>
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
                                    jkl
                                </td>
                            </tr>
                        </tbody>
                    </table>
                `),
            stepFunction: (editor) => keydownShiftTab(editor),
            contentAfter: unformat(`
                    <table>
                        <tbody>
                            <tr>
                                <td>
                                    ghi
                                </td>
                                <td>
                                    <ul>
                                        <li>abc</li>
                                        <li>def[]</li>
                                    </ul>
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

    test("should outdent checklist inside a table cell", async () => {
        await testEditor({
            removeCheckIds: true,
            contentBefore: unformat(`
                    <table>
                        <tbody>
                            <tr>
                                <td>
                                    ghi
                                </td>
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
                                    jkl
                                </td>
                            </tr>
                        </tbody>
                    </table>
                `),
            stepFunction: (editor) => keydownShiftTab(editor),
            contentAfter: unformat(`
                    <table>
                        <tbody>
                            <tr>
                                <td>
                                    ghi
                                </td>
                                <td>
                                    <ul class="o_checklist">
                                        <li>abc</li>
                                        <li>def[]</li>
                                    </ul>
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

    test.todo("should outdent a list inside a nav-item list", async () => {
        await testEditor({
            contentBefore: unformat(`
                <ul>
                    <li class="nav-item">
                        <ul>
                            <li>a[]b</li>
                        </ul>
                    </li>
                </ul>
            `),
            stepFunction: keydownShiftTab,
            contentAfter: unformat(`
                <ul>
                    <li class="nav-item">
                        <p>a[]b</p>
                    </li>
                </ul>
            `),
        });
        await testEditor({
            contentBefore: unformat(`
                <ul>
                    <li class="nav-item">
                        <ol>
                            <li>a[]b</li>
                        </ol>
                    </li>
                </ul>
            `),
            stepFunction: keydownShiftTab,
            contentAfter: unformat(`
                <ul>
                    <li class="nav-item">
                        <p>a[]b</p>
                    </li>
                </ul>
            `),
        });
        await testEditor({
            contentBefore: unformat(`
                <ul>
                    <li class="nav-item">
                        <ul class="o_checklist">
                            <li>a[]b</li>
                        </ul>
                    </li>
                </ul>
            `),
            stepFunction: keydownShiftTab,
            contentAfter: unformat(`
                <ul>
                    <li class="nav-item">
                        <p>a[]b</p>
                    </li>
                </ul>
            `),
        });
        await testEditor({
            contentBefore: unformat(`
                <ul>
                    <li class="nav-item">
                        <div>
                            <ul>
                                <li>a[]b</li>
                            </ul>
                        </div>
                    </li>
                </ul>
            `),
            stepFunction: keydownShiftTab,
            contentAfter: unformat(`
                <ul>
                    <li class="nav-item">
                        <div>
                            <p>a[]b</p>
                        </div>
                    </li>
                </ul>
            `),
        });
        await testEditor({
            contentBefore: unformat(`
                <ul>
                    <li class="nav-item">
                        <div>
                            <ol>
                                <li>
                                    <h1>a[]b</h1>
                                </li>
                            </ol>
                        </div>
                    </li>
                </ul>
            `),
            stepFunction: keydownShiftTab,
            contentAfter: unformat(`
                <ul>
                    <li class="nav-item">
                        <div>
                            <h1>a[]b</h1>
                        </div>
                    </li>
                </ul>
            `),
        });
        await testEditor({
            contentBefore: unformat(`
                <ul>
                    <li class="nav-item">
                        <div>
                            <ul class="o_checklist">
                                <li>a[]b</li>
                            </ul>
                        </div>
                    </li>
                </ul>
            `),
            stepFunction: keydownShiftTab,
            contentAfter: unformat(`
                <ul>
                    <li class="nav-item">
                        <div>
                            <p>a[]b</p>
                        </div>
                    </li>
                </ul>
            `),
        });
    });
});

describe("with selection", () => {
    test("should outdent the middle element of a list", async () => {
        await testEditor({
            contentBefore: unformat(`
                    <ul>
                        <li>
                            a
                        </li><li class="oe-nested">
                            <ul>
                                <li>[b]</li>
                            </ul>
                        </li>
                        <li>
                            c
                        </li>
                    </ul>`),
            stepFunction: keydownShiftTab,
            contentAfter: unformat(`
                    <ul>
                        <li>a</li>
                        <li>[b]</li>
                        <li>c</li>
                    </ul>`),
        });
    });

    test("should outdent multiples list item in the middle element of a list", async () => {
        await testEditor({
            contentBefore: unformat(`
                    <ul>
                        <li>
                            a
                            <ul>
                                <li>[b</li>
                                <li>c]</li>
                            </ul>
                        </li>
                        <li>
                            d
                        </li>
                    </ul>`),
            stepFunction: keydownShiftTab,
            contentAfter: unformat(`
                    <ul>
                        <li>a</li>
                        <li>[b</li>
                        <li>c]</li>
                        <li>d</li>
                    </ul>`),
        });
    });

    // @todo @phoenix: is this a valid contentBefore?
    test.todo(
        "should outdent multiples list item in the middle element of a list with sublist",
        async () => {
            await testEditor({
                contentBefore: unformat(`
                    <ul>
                        <li>
                            a
                            <ul>
                                <li>
                                    [b
                                    <ul>
                                        <li>c</li>
                                    </ul>
                                </li>
                                <li>d]</li>
                            </ul>
                        </li>
                        <li>e</li>
                    </ul>`),
                stepFunction: keydownShiftTab,
                contentAfter: unformat(`
                    <ul>
                        <li>a</li>
                        <li>
                            [b
                        </li>
                        <li class="oe-nested">
                            <ul>
                                <li>c</li>
                            </ul>
                        </li>
                        <li>d]</li>
                        <li>e</li>
                    </ul>`),
            });
            await testEditor({
                contentBefore: unformat(`
                    <ul>
                        <li>
                            a
                            <ul>
                                <li>
                                    b
                                    <ul>
                                        <li>[c</li>
                                    </ul>
                                </li>
                                <li>d]</li>
                            </ul>
                        </li>
                        <li>e</li>
                    </ul>`),
                stepFunction: keydownShiftTab,
                contentAfter: unformat(`
                    <ul>
                        <li>
                            a
                            <ul>
                                <li>b</li>
                                <li>[c</li>
                            </ul>
                        </li>
                        <li>d]</li>
                        <li>e</li>
                    </ul>`),
            });
        }
    );

    test.todo(
        "should outdent nested list and list with elements in a upper level than the rangestart",
        async () => {
            await testEditor({
                contentBefore: unformat(`
                    <ul>
                        <li>a</li>
                        <li>
                            b
                            <ul>
                                <li>
                                    c
                                    <ul>
                                        <li>[d</li>
                                    </ul>
                                </li>
                                <li>
                                e
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
                stepFunction: keydownShiftTab,
                contentAfter: unformat(`
                    <ul>
                        <li>a</li>
                        <li>b
                            <ul>
                                <li>c</li>
                                <li>[d</li>
                            </ul>
                        </li>
                        <li>e</li>
                        <li class="oe-nested">
                            <ul>
                                <li>f</li>
                                <li>g</li>
                            </ul>
                        </li>
                        <li>h]</li>
                        <li>i</li>
                    </ul>`),
            });
        }
    );

    test("should not outdent a non-editable list", async () => {
        await testEditor({
            contentBefore: unformat(`
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
            stepFunction: keydownShiftTab,
            contentAfter: unformat(`
                <p>[before</p>
                <ul>
                    <li>a</li>
                </ul>
                <ul contenteditable="false">
                    <li>a</li>
                </ul>
                <p>after]</p>`),
        });
    });

    test("should outdent a ordered list inside a table cell", async () => {
        await testEditor({
            contentBefore: unformat(`
                    <table>
                        <tbody>
                            <tr>
                                <td>
                                    ghi
                                </td>
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
                                    jkl
                                </td>
                            </tr>
                        </tbody>
                    </table>
                `),
            stepFunction: (editor) => keydownShiftTab(editor),
            contentAfter: unformat(`
                    <table>
                        <tbody>
                            <tr>
                                <td>
                                    ghi
                                </td>
                                <td>
                                    <ol>
                                        <li>abc</li>
                                        <li>[def]</li>
                                    </ol>
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
