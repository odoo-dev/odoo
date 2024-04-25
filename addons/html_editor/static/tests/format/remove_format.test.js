import { test } from "@odoo/hoot";
import { testEditor } from "../_helpers/editor";

test("should do nothing if no format is set", async () => {
    await testEditor({
        contentBefore: "<div>ab[cd]ef</div>",
        stepFunction: (editor) => editor.dispatch("FORMAT_REMOVE_FORMAT"),
        contentAfter: "<div>ab[cd]ef</div>",
    });
});
test('should not remove "non formating" html class (1)', async () => {
    await testEditor({
        contentBefore: '<div>ab<span class="xyz">[cd]</span>ef</div>',
        stepFunction: (editor) => editor.dispatch("FORMAT_REMOVE_FORMAT"),
        contentAfter: '<div>ab<span class="xyz">[cd]</span>ef</div>',
    });
});
test('should not remove "non formating" html class (2)', async () => {
    await testEditor({
        contentBefore: '<div>a[b<span class="xyz">cd</span>e]f</div>',
        stepFunction: (editor) => editor.dispatch("FORMAT_REMOVE_FORMAT"),
        contentAfter: '<div>a[b<span class="xyz">cd</span>e]f</div>',
    });
});
test('should not remove "non formating" html class (3)', async () => {
    await testEditor({
        contentBefore: '<div>a<span class="xyz">b[cd]e</span>f</div>',
        stepFunction: (editor) => editor.dispatch("FORMAT_REMOVE_FORMAT"),
        contentAfter: '<div>a<span class="xyz">b[cd]e</span>f</div>',
    });
});
test("should remove bold format (1)", async () => {
    await testEditor({
        contentBefore: "<div>ab<b>[cd]</b>ef</div>",
        stepFunction: (editor) => editor.dispatch("FORMAT_REMOVE_FORMAT"),
        contentAfter: "<div>ab[cd]ef</div>",
    });
});
test("should remove bold format (2)", async () => {
    await testEditor({
        contentBefore: "<div>ab[<b>cd]</b>ef</div>",
        stepFunction: (editor) => editor.dispatch("FORMAT_REMOVE_FORMAT"),
        contentAfter: "<div>ab[cd]ef</div>",
    });
});
test("should remove bold format (3)", async () => {
    await testEditor({
        contentBefore: "<div>ab<b>[cd</b>]ef</div>",
        stepFunction: (editor) => editor.dispatch("FORMAT_REMOVE_FORMAT"),
        contentAfter: "<div>ab[cd]ef</div>",
    });
});
test("should remove bold format (4)", async () => {
    await testEditor({
        contentBefore: "<div>ab[<b>cd</b>]ef</div>",
        stepFunction: (editor) => editor.dispatch("FORMAT_REMOVE_FORMAT"),
        contentAfter: "<div>ab[cd]ef</div>",
    });
});
test("should remove bold format (5)", async () => {
    await testEditor({
        contentBefore: "<div>ab[<b>cd</b>]ef</div>",
        stepFunction: (editor) => editor.dispatch("FORMAT_REMOVE_FORMAT"),
        contentAfter: "<div>ab[cd]ef</div>",
    });
});
test("should remove bold format (6)", async () => {
    await testEditor({
        contentBefore: "<div>a<b>b[cd]e</b>f</div>",
        stepFunction: (editor) => editor.dispatch("FORMAT_REMOVE_FORMAT"),
        contentAfter: "<div>a<b>b</b>[cd]<b>e</b>f</div>",
    });
});
test("should remove bold format (7)", async () => {
    await testEditor({
        contentBefore: "<div>a<b>b[c</b>d]ef</div>",
        stepFunction: (editor) => editor.dispatch("FORMAT_REMOVE_FORMAT"),
        contentAfter: "<div>a<b>b</b>[cd]ef</div>",
    });
});
test("should remove bold format (8)", async () => {
    await testEditor({
        contentBefore: '<div>ab<font style="font-weight: bold">[cd]</font>ef</div>',
        stepFunction: (editor) => editor.dispatch("FORMAT_REMOVE_FORMAT"),
        contentAfter: "<div>ab[cd]ef</div>",
    });
});
test("should remove bold format (9)", async () => {
    await testEditor({
        contentBefore: '<div>ab<font style="font-weight: bolder">[cd]</font>ef</div>',
        stepFunction: (editor) => editor.dispatch("FORMAT_REMOVE_FORMAT"),
        contentAfter: "<div>ab[cd]ef</div>",
    });
});
test("should remove bold format (10)", async () => {
    await testEditor({
        contentBefore: '<div>ab<font style="font-weight: 500">[cd]</font>ef</div>',
        stepFunction: (editor) => editor.dispatch("FORMAT_REMOVE_FORMAT"),
        contentAfter: "<div>ab[cd]ef</div>",
    });
});
test("should remove bold format (11)", async () => {
    await testEditor({
        contentBefore: '<div>ab<font style="font-weight: 600">[cd]</font>ef</div>',
        stepFunction: (editor) => editor.dispatch("FORMAT_REMOVE_FORMAT"),
        contentAfter: "<div>ab[cd]ef</div>",
    });
});
test("should remove bold format (12)", async () => {
    await testEditor({
        contentBefore: '<div>a<font style="font-weight: 600">b[cd]e</font>f</div>',
        stepFunction: (editor) => editor.dispatch("FORMAT_REMOVE_FORMAT"),
        contentAfter:
            '<div>a<font style="font-weight: 600">b</font>[cd]<font style="font-weight: 600">e</font>f</div>',
    });
});
test("should remove bold format (13)", async () => {
    await testEditor({
        contentBefore: "<div>ab<strong>[cd]</strong>ef</div>",
        stepFunction: (editor) => editor.dispatch("FORMAT_REMOVE_FORMAT"),
        contentAfter: "<div>ab[cd]ef</div>",
    });
});
test("should remove bold format (14)", async () => {
    await testEditor({
        contentBefore: "<div>a<strong>b[cd]e</strong>f</div>",
        stepFunction: (editor) => editor.dispatch("FORMAT_REMOVE_FORMAT"),
        contentAfter: "<div>a<strong>b</strong>[cd]<strong>e</strong>f</div>",
    });
});
test("should remove italic format (1)", async () => {
    await testEditor({
        contentBefore: "<div>ab<i>[cd]</i>ef</div>",
        stepFunction: (editor) => editor.dispatch("FORMAT_REMOVE_FORMAT"),
        contentAfter: "<div>ab[cd]ef</div>",
    });
});
test("should remove italic format (2)", async () => {
    await testEditor({
        contentBefore: "<div>ab[<i>cd]</i>ef</div>",
        stepFunction: (editor) => editor.dispatch("FORMAT_REMOVE_FORMAT"),
        contentAfter: "<div>ab[cd]ef</div>",
    });
});
test("should remove italic format (3)", async () => {
    await testEditor({
        contentBefore: "<div>ab<i>[cd</i>]ef</div>",
        stepFunction: (editor) => editor.dispatch("FORMAT_REMOVE_FORMAT"),
        contentAfter: "<div>ab[cd]ef</div>",
    });
});
test("should remove italic format (4)", async () => {
    await testEditor({
        contentBefore: "<div>ab[<i>cd</i>]ef</div>",
        stepFunction: (editor) => editor.dispatch("FORMAT_REMOVE_FORMAT"),
        contentAfter: "<div>ab[cd]ef</div>",
    });
});
test("should remove italic format (5)", async () => {
    await testEditor({
        contentBefore: "<div>ab[<i>cd</i>]ef</div>",
        stepFunction: (editor) => editor.dispatch("FORMAT_REMOVE_FORMAT"),
        contentAfter: "<div>ab[cd]ef</div>",
    });
});
test("should remove italic format (6)", async () => {
    await testEditor({
        contentBefore: "<div>a<i>b[cd]e</i>f</div>",
        stepFunction: (editor) => editor.dispatch("FORMAT_REMOVE_FORMAT"),
        contentAfter: "<div>a<i>b</i>[cd]<i>e</i>f</div>",
    });
});
test("should remove italic format (7)", async () => {
    await testEditor({
        contentBefore: "<div>a<i>b[c</i>d]ef</div>",
        stepFunction: (editor) => editor.dispatch("FORMAT_REMOVE_FORMAT"),
        contentAfter: "<div>a<i>b</i>[cd]ef</div>",
    });
});
test("should remove italic format (8)", async () => {
    await testEditor({
        contentBefore: '<div>ab<font style="font-style: italic">[cd]</font>ef</div>',
        stepFunction: (editor) => editor.dispatch("FORMAT_REMOVE_FORMAT"),
        contentAfter: "<div>ab[cd]ef</div>",
    });
});
test("should remove italic format (9)", async () => {
    await testEditor({
        contentBefore: '<div>a<font style="font-style: italic">b[cd]e</font>f</div>',
        stepFunction: (editor) => editor.dispatch("FORMAT_REMOVE_FORMAT"),
        contentAfter:
            '<div>a<font style="font-style: italic">b</font>[cd]<font style="font-style: italic">e</font>f</div>',
    });
});
test("should remove underline format (1)", async () => {
    await testEditor({
        contentBefore: "<div>ab<u>[cd]</u>ef</div>",
        stepFunction: (editor) => editor.dispatch("FORMAT_REMOVE_FORMAT"),
        contentAfter: "<div>ab[cd]ef</div>",
    });
});
test("should remove underline format (2)", async () => {
    await testEditor({
        contentBefore: "<div>ab[<u>cd]</u>ef</div>",
        stepFunction: (editor) => editor.dispatch("FORMAT_REMOVE_FORMAT"),
        contentAfter: "<div>ab[cd]ef</div>",
    });
});
test("should remove underline format (3)", async () => {
    await testEditor({
        contentBefore: "<div>ab<u>[cd</u>]ef</div>",
        stepFunction: (editor) => editor.dispatch("FORMAT_REMOVE_FORMAT"),
        contentAfter: "<div>ab[cd]ef</div>",
    });
});
test("should remove underline format (4)", async () => {
    await testEditor({
        contentBefore: "<div>ab[<u>cd</u>]ef</div>",
        stepFunction: (editor) => editor.dispatch("FORMAT_REMOVE_FORMAT"),
        contentAfter: "<div>ab[cd]ef</div>",
    });
});
test("should remove underline format (5)", async () => {
    await testEditor({
        contentBefore: "<div>ab[<u>cd</u>]ef</div>",
        stepFunction: (editor) => editor.dispatch("FORMAT_REMOVE_FORMAT"),
        contentAfter: "<div>ab[cd]ef</div>",
    });
});
test("should remove underline format (6)", async () => {
    await testEditor({
        contentBefore: "<div>a<u>b[cd]e</u>f</div>",
        stepFunction: (editor) => editor.dispatch("FORMAT_REMOVE_FORMAT"),
        contentAfter: "<div>a<u>b</u>[cd]<u>e</u>f</div>",
    });
});
test("should remove underline format (7)", async () => {
    await testEditor({
        contentBefore: "<div>a<u>b[c</u>d]ef</div>",
        stepFunction: (editor) => editor.dispatch("FORMAT_REMOVE_FORMAT"),
        contentAfter: "<div>a<u>b</u>[cd]ef</div>",
    });
});
test("should remove underline format (8)", async () => {
    await testEditor({
        contentBefore: '<div>ab<font style="text-decoration: underline">[cd]</font>ef</div>',
        stepFunction: (editor) => editor.dispatch("FORMAT_REMOVE_FORMAT"),
        contentAfter: "<div>ab[cd]ef</div>",
    });
});
test("should remove underline format (9)", async () => {
    await testEditor({
        contentBefore: '<div>a<font style="text-decoration: underline">b[cd]e</font>f</div>',
        stepFunction: (editor) => editor.dispatch("FORMAT_REMOVE_FORMAT"),
        contentAfter:
            '<div>a<font style="text-decoration: underline">b</font>[cd]<font style="text-decoration: underline">e</font>f</div>',
    });
});
test("should remove underline format (10)", async () => {
    await testEditor({
        contentBefore: '<div>a<font style="text-decoration-line: underline">b[cd]e</font>f</div>',
        stepFunction: (editor) => editor.dispatch("FORMAT_REMOVE_FORMAT"),
        contentAfter:
            '<div>a<font style="text-decoration-line: underline">b</font>[cd]<font style="text-decoration-line: underline">e</font>f</div>',
    });
});
test("should remove striketrough format (1)", async () => {
    await testEditor({
        contentBefore: "<div>ab<s>[cd]</s>ef</div>",
        stepFunction: (editor) => editor.dispatch("FORMAT_REMOVE_FORMAT"),
        contentAfter: "<div>ab[cd]ef</div>",
    });
});
test("should remove striketrough format (2)", async () => {
    await testEditor({
        contentBefore: "<div>ab[<s>cd]</s>ef</div>",
        stepFunction: (editor) => editor.dispatch("FORMAT_REMOVE_FORMAT"),
        contentAfter: "<div>ab[cd]ef</div>",
    });
});
test("should remove striketrough format (3)", async () => {
    await testEditor({
        contentBefore: "<div>ab<s>[cd</s>]ef</div>",
        stepFunction: (editor) => editor.dispatch("FORMAT_REMOVE_FORMAT"),
        contentAfter: "<div>ab[cd]ef</div>",
    });
});
test("should remove striketrough format (4)", async () => {
    await testEditor({
        contentBefore: "<div>ab[<s>cd</s>]ef</div>",
        stepFunction: (editor) => editor.dispatch("FORMAT_REMOVE_FORMAT"),
        contentAfter: "<div>ab[cd]ef</div>",
    });
});
test("should remove striketrough format (5)", async () => {
    await testEditor({
        contentBefore: "<div>ab[<s>cd</s>]ef</div>",
        stepFunction: (editor) => editor.dispatch("FORMAT_REMOVE_FORMAT"),
        contentAfter: "<div>ab[cd]ef</div>",
    });
});
test("should remove striketrough format (6)", async () => {
    await testEditor({
        contentBefore: "<div>a<s>b[cd]e</s>f</div>",
        stepFunction: (editor) => editor.dispatch("FORMAT_REMOVE_FORMAT"),
        contentAfter: "<div>a<s>b</s>[cd]<s>e</s>f</div>",
    });
});
test("should remove striketrough format (7)", async () => {
    await testEditor({
        contentBefore: "<div>a<s>b[c</s>d]ef</div>",
        stepFunction: (editor) => editor.dispatch("FORMAT_REMOVE_FORMAT"),
        contentAfter: "<div>a<s>b</s>[cd]ef</div>",
    });
});
test("should remove striketrough format (8)", async () => {
    await testEditor({
        contentBefore: '<div>ab<font style="text-decoration: line-through">[cd]</font>ef</div>',
        stepFunction: (editor) => editor.dispatch("FORMAT_REMOVE_FORMAT"),
        contentAfter: "<div>ab[cd]ef</div>",
    });
});
test("should remove striketrough format (9)", async () => {
    await testEditor({
        contentBefore: '<div>a<font style="text-decoration: line-through">b[cd]e</font>f</div>',
        stepFunction: (editor) => editor.dispatch("FORMAT_REMOVE_FORMAT"),
        contentAfter:
            '<div>a<font style="text-decoration: line-through">b</font>[cd]<font style="text-decoration: line-through">e</font>f</div>',
    });
});
test("should remove striketrough format (10)", async () => {
    await testEditor({
        contentBefore:
            '<div>a<font style="text-decoration-line: line-through">b[cd]e</font>f</div>',
        stepFunction: (editor) => editor.dispatch("FORMAT_REMOVE_FORMAT"),
        contentAfter:
            '<div>a<font style="text-decoration-line: line-through">b</font>[cd]<font style="text-decoration-line: line-through">e</font>f</div>',
    });
});
test("should remove text color (1)", async () => {
    await testEditor({
        contentBefore: '<div>ab<font style="color: rgb(255, 0, 0);">[cd]</font>ef</div>',
        stepFunction: (editor) => editor.dispatch("FORMAT_REMOVE_FORMAT"),
        contentAfter: "<div>ab[cd]ef</div>",
    });
});
test("should remove text color (2)", async () => {
    await testEditor({
        contentBefore: '<div>ab<font style="color: red">[cd]</font>ef</div>',
        stepFunction: (editor) => editor.dispatch("FORMAT_REMOVE_FORMAT"),
        contentAfter: "<div>ab[cd]ef</div>",
    });
});
test("should remove text color (3)", async () => {
    await testEditor({
        contentBefore: '<div>ab<font style="color: #ff0000">[cd]</font>ef</div>',
        stepFunction: (editor) => editor.dispatch("FORMAT_REMOVE_FORMAT"),
        contentAfter: "<div>ab[cd]ef</div>",
    });
});
test("should remove text color (4)", async () => {
    await testEditor({
        contentBefore: '<div>ab<font class="text-o-color-1">[cd]</font>ef</div>',
        stepFunction: (editor) => editor.dispatch("FORMAT_REMOVE_FORMAT"),
        contentAfter: "<div>ab[cd]ef</div>",
    });
});
test("should remove text color (5)", async () => {
    await testEditor({
        contentBefore: '<div>a<font style="color: rgb(255, 0, 0);">b[cd]e</font>f</div>',
        stepFunction: (editor) => editor.dispatch("FORMAT_REMOVE_FORMAT"),
        contentAfter:
            '<div>a<font style="color: rgb(255, 0, 0);">b[</font>cd]<font style="color: rgb(255, 0, 0);">e</font>f</div>',
    });
});
test("should remove text color (6)", async () => {
    await testEditor({
        contentBefore: '<div>a<font style="color: red">b[cd]e</font>f</div>',
        stepFunction: (editor) => editor.dispatch("FORMAT_REMOVE_FORMAT"),
        contentAfter:
            '<div>a<font style="color: red">b[</font>cd]<font style="color: red">e</font>f</div>',
    });
});
test("should remove text color (7)", async () => {
    await testEditor({
        contentBefore: '<div>a<font style="color: #ff0000">b[cd]e</font>f</div>',
        stepFunction: (editor) => editor.dispatch("FORMAT_REMOVE_FORMAT"),
        contentAfter:
            '<div>a<font style="color: #ff0000">b[</font>cd]<font style="color: #ff0000">e</font>f</div>',
    });
});
test("should remove text color (8)", async () => {
    await testEditor({
        contentBefore: '<div>a<font class="text-o-color-1">b[cd]e</font>f</div>',
        stepFunction: (editor) => editor.dispatch("FORMAT_REMOVE_FORMAT"),
        contentAfter:
            '<div>a<font class="text-o-color-1">b</font>[cd]<font class="text-o-color-1">e</font>f</div>',
    });
});
test("should remove background color (1)", async () => {
    await testEditor({
        contentBefore: '<div>ab<font style="background: rgb(0, 0, 255);">[cd]</font>ef</div>',
        stepFunction: (editor) => editor.dispatch("FORMAT_REMOVE_FORMAT"),
        contentAfter: "<div>ab[cd]ef</div>",
    });
});
test("should remove background color (2)", async () => {
    await testEditor({
        contentBefore: '<div>ab<font style="background: blue">[cd]</font>ef</div>',
        stepFunction: (editor) => editor.dispatch("FORMAT_REMOVE_FORMAT"),
        contentAfter: "<div>ab[cd]ef</div>",
    });
});
test("should remove background color (3)", async () => {
    await testEditor({
        contentBefore: '<div>ab<font style="background: #00f">[cd]</font>ef</div>',
        stepFunction: (editor) => editor.dispatch("FORMAT_REMOVE_FORMAT"),
        contentAfter: "<div>ab[cd]ef</div>",
    });
});
test("should remove background color (4)", async () => {
    await testEditor({
        contentBefore: '<div>ab<font style="background-color: #00f">[cd]</font>ef</div>',
        stepFunction: (editor) => editor.dispatch("FORMAT_REMOVE_FORMAT"),
        contentAfter: "<div>ab[cd]ef</div>",
    });
});
test("should remove background color (5)", async () => {
    await testEditor({
        contentBefore: '<div>ab<font class="bg-o-color-1">[cd]</font>ef</div>',
        stepFunction: (editor) => editor.dispatch("FORMAT_REMOVE_FORMAT"),
        contentAfter: "<div>ab[cd]ef</div>",
    });
});
test("should remove background color (6)", async () => {
    await testEditor({
        contentBefore: '<div>a<font style="background: rgb(255, 0, 0);">b[cd]e</font>f</div>',
        stepFunction: (editor) => editor.dispatch("FORMAT_REMOVE_FORMAT"),
        contentAfter:
            '<div>a<font style="background: rgb(255, 0, 0);">b[</font>cd]<font style="background: rgb(255, 0, 0);">e</font>f</div>',
    });
});
test("should remove background color (7)", async () => {
    await testEditor({
        contentBefore: '<div>a<font style="background: red">b[cd]e</font>f</div>',
        stepFunction: (editor) => editor.dispatch("FORMAT_REMOVE_FORMAT"),
        contentAfter:
            '<div>a<font style="background: red">b[</font>cd]<font style="background: red">e</font>f</div>',
    });
});
test("should remove background color (8)", async () => {
    await testEditor({
        contentBefore: '<div>a<font style="background: #ff0000">b[cd]e</font>f</div>',
        stepFunction: (editor) => editor.dispatch("FORMAT_REMOVE_FORMAT"),
        contentAfter:
            '<div>a<font style="background: #ff0000">b[</font>cd]<font style="background: #ff0000">e</font>f</div>',
    });
});
test("should remove background color (9)", async () => {
    await testEditor({
        contentBefore: '<div>a<font style="background-color: #ff0000">b[cd]e</font>f</div>',
        stepFunction: (editor) => editor.dispatch("FORMAT_REMOVE_FORMAT"),
        contentAfter:
            '<div>a<font style="background-color: #ff0000">b[</font>cd]<font style="background-color: #ff0000">e</font>f</div>',
    });
});
test("should remove background color (10)", async () => {
    await testEditor({
        contentBefore: '<div>a<font class="bg-o-color-1">b[cd]e</font>f</div>',
        stepFunction: (editor) => editor.dispatch("FORMAT_REMOVE_FORMAT"),
        contentAfter:
            '<div>a<font class="bg-o-color-1">b</font>[cd]<font class="bg-o-color-1">e</font>f</div>',
    });
});
test("should remove the background image when clear the format", async () => {
    await testEditor({
        contentBefore:
            '<div><p><font class="text-gradient" style="background-image: linear-gradient(135deg, rgb(255, 204, 51) 0%, rgb(226, 51, 255) 100%);">[ab]</font></p></div>',
        stepFunction: (editor) => editor.dispatch("FORMAT_REMOVE_FORMAT"),
        contentAfter: "<div><p>[ab]</p></div>",
    });
});
test("should remove all the colors for the text separated by Shift+Enter when using removeFormat button", async () => {
    await testEditor({
        contentBefore: `<div><h1><font style="color: red">[ab</font><br><font style="color: red">cd</font><br><font style="color: red">ef]</font></h1></div>`,
        stepFunction: (editor) => editor.dispatch("FORMAT_REMOVE_FORMAT"),
        contentAfter: `<div><h1>[ab<br>cd<br>ef]</h1></div>`,
    });
    await testEditor({
        contentBefore: `<div><h1><font style="color: red">[ab</font><br><font style="color: red">cd</font><br><font style="color: red">]ef</font></h1></div>`,
        stepFunction: (editor) => editor.dispatch("FORMAT_REMOVE_FORMAT"),
        contentAfter: `<div><h1>[ab<br>cd]<br><font style="color: red">ef</font></h1></div>`,
    });
});
test("should remove all the colors for the text separated by Enter when using removeFormat button", async () => {
    await testEditor({
        contentBefore: `<div><h1><font style="background-color: red">[ab</font></h1><h1><font style="background-color: red">cd</font></h1><h1><font style="background-color: red">ef]</font></h1></div>`,
        stepFunction: (editor) => editor.dispatch("FORMAT_REMOVE_FORMAT"),
        contentAfter: `<div><h1>[ab</h1><h1>cd</h1><h1>ef]</h1></div>`,
    });
    await testEditor({
        contentBefore: `<div><h1><font style="color: red">[ab</font></h1><h1><font style="color: red">cd</font></h1><h1><font style="color: red">ef]</font></h1></div>`,
        stepFunction: (editor) => editor.dispatch("FORMAT_REMOVE_FORMAT"),
        contentAfter: `<div><h1>[ab</h1><h1>cd</h1><h1>ef]</h1></div>`,
    });
});
