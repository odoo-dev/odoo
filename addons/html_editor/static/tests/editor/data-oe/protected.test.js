import { setSelection } from "@html_editor/editor/utils/selection";
import { test } from "@odoo/hoot";
import { testEditor } from "../../test_helpers/editor";
import { unformat } from "../../test_helpers/format";
import { insertText } from "../../test_helpers/user_actions";

test.todo("should ignore protected elements children mutations (true)", async () => {
    await testEditor({
        contentBefore: unformat(`
                <div><p>a[]</p></div>
                <div data-oe-protected="true"><p>a</p></div>
                `),
        stepFunction: async (editor) => {
            await insertText(editor, "bc");
            const protectedParagraph = editor.editable.querySelector(
                '[data-oe-protected="true"] > p'
            );
            protectedParagraph.append(document.createTextNode("b"));
            editor.historyStep();
            editor.historyUndo();
        },
        contentAfterEdit: unformat(`
                <div><p>ab[]</p></div>
                <div data-oe-protected="true"><p>ab</p></div>
                `),
    });
});

test.todo("should not ignore unprotected elements children mutations (false)", async () => {
    await testEditor({
        contentBefore: unformat(`
                <div><p>a[]</p></div>
                <div data-oe-protected="true"><div data-oe-protected="false"><p>a</p></div></div>
                `),
        stepFunction: async (editor) => {
            await insertText(editor, "bc");
            const unProtectedParagraph = editor.editable.querySelector(
                '[data-oe-protected="false"] > p'
            );
            setSelection(unProtectedParagraph, 1);
            await insertText(editor, "bc");
            editor.historyUndo();
        },
        contentAfterEdit: unformat(`
                <div><p>abc</p></div>
                <div data-oe-protected="true"><div data-oe-protected="false"><p>ab[]</p></div></div>
                `),
    });
});

test.todo("should not sanitize (sanitize.js) protected elements children (true)", async () => {
    await testEditor({
        contentBefore: unformat(`
                <div>
                    <p><i class="fa"></i></p>
                    <ul><li><p><br></p></li></ul>
                </div>
                <div data-oe-protected="true">
                    <p><i class="fa"></i></p>
                    <ul><li><p><br></p></li></ul>
                </div>
                `),
        stepFunction: async (editor) => editor.sanitize(),
        contentAfterEdit: unformat(`
                <div>
                    <p><i class="fa" contenteditable="false">\u200B</i></p>
                    <ul><li><br></li></ul>
                </div>
                <div data-oe-protected="true">
                    <p><i class="fa"></i></p>
                    <ul><li><p><br></p></li></ul>
                </div>
                `),
    });
});

test.todo("should sanitize (sanitize.js) unprotected elements children (false)", async () => {
    await testEditor({
        contentBefore: unformat(`
                <div data-oe-protected="true">
                    <p><i class="fa"></i></p>
                    <ul><li><p><br></p></li></ul>
                    <div data-oe-protected="false">
                        <p><i class="fa"></i></p>
                        <ul><li><p><br></p></li></ul>
                    </div>
                </div>
                `),
        stepFunction: async (editor) => editor.sanitize(),
        contentAfterEdit: unformat(`
                <div data-oe-protected="true">
                    <p><i class="fa"></i></p>
                    <ul><li><p><br></p></li></ul>
                    <div data-oe-protected="false">
                        <p><i class="fa" contenteditable="false">\u200B</i></p>
                        <ul><li><br></li></ul>
                    </div>
                </div>
                `),
    });
});

test("should not handle table selection in protected elements children (true)", async () => {
    await testEditor({
        contentBefore: unformat(`
                <div data-oe-protected="true">
                    <p>a[bc</p><table><tbody><tr><td>a]b</td><td>cd</td><td>ef</td></tr></tbody></table>
                </div>
                `),
        contentAfterEdit: unformat(`
                <div data-oe-protected="true">
                    <p>a[bc</p><table><tbody><tr><td>a]b</td><td>cd</td><td>ef</td></tr></tbody></table>
                </div>
                `),
    });
});

test.todo("should handle table selection in unprotected elements children (false)", async () => {
    await testEditor({
        contentBefore: unformat(`
                <div data-oe-protected="true">
                    <div data-oe-protected="false">
                        <p>a[bc</p><table><tbody><tr><td>a]b</td><td>cd</td><td>ef</td></tr></tbody></table>
                    </div>
                </div>
                `),
        contentAfterEdit: unformat(`
                <div data-oe-protected="true">
                    <div data-oe-protected="false">
                        <p>a[bc</p>
                        <table class="o_selected_table"><tbody><tr>
                            <td class="o_selected_td">a]b</td>
                            <td class="o_selected_td">cd</td>
                            <td class="o_selected_td">ef</td>
                        </tr></tbody></table>
                    </div>
                </div>
                `),
    });
});

test.todo("should not select a protected table (true)", async () => {
    // Individually protected cells are not yet supported for simplicity
    // since there is no need for that currently.
    await testEditor({
        contentBefore: unformat(`
                    <table data-oe-protected="true"><tbody><tr>
                        <td>[ab</td>
                    </tr></tbody></table>
                    <table><tbody><tr>
                        <td>cd]</td>
                    </tr></tbody></table>
                `),
        contentAfterEdit: unformat(`
                    <table data-oe-protected="true"><tbody><tr>
                        <td>[ab</td>
                    </tr></tbody></table>
                    <table class="o_selected_table"><tbody><tr>
                        <td class="o_selected_td">cd]</td>
                    </tr></tbody></table>
                `),
    });
});
