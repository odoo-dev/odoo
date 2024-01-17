/** @odoo-module */

import { test } from "@odoo/hoot";
import { testEditor } from "../../helpers";
import { switchDirection } from "./utils";

test.todo("should switch direction on a collapsed range", async () => {
    await testEditor({
        contentBefore: `<p>a[]b</p>`,
        stepFunction: switchDirection,
        contentAfter: `<p dir="rtl">a[]b</p>`,
    });
});

test.todo("should switch direction on an uncollapsed range", async () => {
    await testEditor({
        contentBefore: `<p>a[b]c</p>`,
        stepFunction: switchDirection,
        contentAfter: `<p dir="rtl">a[b]c</p>`,
    });
});

test.todo("should not switch direction of non-editable elements", async () => {
    await testEditor({
        contentBefore: `<p>[before</p><p contenteditable="false">noneditable</p><p>after]</p>`,
        stepFunction: switchDirection,
        contentAfter: `<p dir="rtl">[before</p><p contenteditable="false">noneditable</p><p dir="rtl">after]</p>`,
    });
});
