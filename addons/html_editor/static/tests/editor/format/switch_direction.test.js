import { test } from "@odoo/hoot";
import { testEditor } from "../../test_helpers/editor";
import { switchDirection } from "../../test_helpers/user_actions";

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

test.todo("should properly switch the direction of the single level list (ltr).", async () => {
    await testEditor({
        contentBefore: `<ul><li>a</li><li>b[]</li><li>c</li></ul>`,
        stepFunction: switchDirection,
        contentAfter: `<ul dir="rtl"><li>a</li><li>b[]</li><li>c</li></ul>`,
    });
    await testEditor({
        contentBefore: `<ol><li>a</li><li>b[]</li><li>c</li></ol>`,
        stepFunction: switchDirection,
        contentAfter: `<ol dir="rtl"><li>a</li><li>b[]</li><li>c</li></ol>`,
    });
    await testEditor({
        removeCheckIds: true,
        contentBefore: `<ul class="o_checklist"><li>a</li><li>b[]</li><li>c</li></ul>`,
        stepFunction: switchDirection,
        contentAfter: `<ul class="o_checklist" dir="rtl"><li>a</li><li>b[]</li><li>c</li></ul>`,
    });
});

test.todo("should properly switch the direction of nested list (ltr).", async () => {
    await testEditor({
        contentBefore: `<ul><li>a[]</li><li class="oe-nested"><ul><li>b</li><li>c</li></ul></li><li>d</li></ul>`,
        stepFunction: switchDirection,
        contentAfter: `<ul dir="rtl"><li>a[]</li><li class="oe-nested"><ul dir="rtl"><li>b</li><li>c</li></ul></li><li>d</li></ul>`,
    });
    await testEditor({
        contentBefore: `<ol><li>a[]</li><li class="oe-nested"><ol><li>b</li><li>c</li></ol></li><li>d</li></ol>`,
        stepFunction: switchDirection,
        contentAfter: `<ol dir="rtl"><li>a[]</li><li class="oe-nested"><ol dir="rtl"><li>b</li><li>c</li></ol></li><li>d</li></ol>`,
    });
    await testEditor({
        removeCheckIds: true,
        contentBefore: `<ul class="o_checklist"><li>a[]</li><li class="oe-nested"><ul class="o_checklist"><li>b</li><li>c</li></ul></li><li>d</li></ul>`,
        stepFunction: switchDirection,
        contentAfter: `<ul class="o_checklist" dir="rtl"><li>a[]</li><li class="oe-nested"><ul class="o_checklist" dir="rtl"><li>b</li><li>c</li></ul></li><li>d</li></ul>`,
    });
    await testEditor({
        removeCheckIds: true,
        contentBefore: `<ul><li>a[]</li><li class="oe-nested"><ul class="o_checklist"><li>b</li><li class="oe-nested"><ol><li>g</li><li>e</li></ol></li><li>c</li></ul></li><li>d</li></ul>`,
        stepFunction: switchDirection,
        contentAfter: `<ul dir="rtl"><li>a[]</li><li class="oe-nested"><ul class="o_checklist" dir="rtl"><li>b</li><li class="oe-nested"><ol dir="rtl"><li>g</li><li>e</li></ol></li><li>c</li></ul></li><li>d</li></ul>`,
    });
});

test.todo("should properly switch the direction of the single level list (rtl).", async () => {
    await testEditor({
        contentBefore: `<ul dir="rtl"><li>a</li><li>b[]</li><li>c</li></ul>`,
        stepFunction: switchDirection,
        contentAfter: `<ul><li>a</li><li>b[]</li><li>c</li></ul>`,
    });
    await testEditor({
        contentBefore: `<ol dir="rtl"><li>a</li><li>b[]</li><li>c</li></ol>`,
        stepFunction: switchDirection,
        contentAfter: `<ol><li>a</li><li>b[]</li><li>c</li></ol>`,
    });
    await testEditor({
        removeCheckIds: true,
        contentBefore: `<ul class="o_checklist" dir="rtl"><li>a</li><li>b[]</li><li>c</li></ul>`,
        stepFunction: switchDirection,
        contentAfter: `<ul class="o_checklist"><li>a</li><li>b[]</li><li>c</li></ul>`,
    });
});

test.todo("should properly switch the direction of nested list (rtl).", async () => {
    await testEditor({
        contentBefore: `<ul dir="rtl"><li>a[]</li><li class="oe-nested"><ul dir="rtl"><li>b</li><li>c</li></ul></li><li>d</li></ul>`,
        stepFunction: switchDirection,
        contentAfter: `<ul><li>a[]</li><li class="oe-nested"><ul><li>b</li><li>c</li></ul></li><li>d</li></ul>`,
    });
    await testEditor({
        contentBefore: `<ol dir="rtl"><li>a[]</li><li class="oe-nested"><ol dir="rtl"><li>b</li><li>c</li></ol></li><li>d</li></ol>`,
        stepFunction: switchDirection,
        contentAfter: `<ol><li>a[]</li><li class="oe-nested"><ol><li>b</li><li>c</li></ol></li><li>d</li></ol>`,
    });
    await testEditor({
        removeCheckIds: true,
        contentBefore: `<ul class="o_checklist" dir="rtl"><li>a[]</li><li class="oe-nested"><ul class="o_checklist" dir="rtl"><li>b</li><li>c</li></ul></li><li>d</li></ul>`,
        stepFunction: switchDirection,
        contentAfter: `<ul class="o_checklist"><li>a[]</li><li class="oe-nested"><ul class="o_checklist"><li>b</li><li>c</li></ul></li><li>d</li></ul>`,
    });
    await testEditor({
        removeCheckIds: true,
        contentBefore: `<ul dir="rtl"><li>a[]</li><li class="oe-nested"><ul class="o_checklist" dir="rtl"><li>b</li><li class="oe-nested"><ol dir="rtl"><li>g</li><li>e</li></ol></li><li>c</li></ul></li><li>d</li></ul>`,
        stepFunction: switchDirection,
        contentAfter: `<ul><li>a[]</li><li class="oe-nested"><ul class="o_checklist"><li>b</li><li class="oe-nested"><ol><li>g</li><li>e</li></ol></li><li>c</li></ul></li><li>d</li></ul>`,
    });
});
