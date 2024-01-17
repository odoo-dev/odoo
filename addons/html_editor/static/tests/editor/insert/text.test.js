/** @odoo-module */

import { describe, test } from "@odoo/hoot";
import { deleteBackward, insertText, testEditor } from "../../helpers";

describe("not collapsed selection", () => {
    test.todo(
        "should insert a character in a fully selected font in a heading, preserving its style",
        async () => {
            await testEditor({
                contentBefore:
                    '<h1><font style="background-color: red;">[abc</font><br></h1><p>]def</p>',
                stepFunction: async (editor) => insertText(editor, "g"),
                contentAfter:
                    '<h1><font style="background-color: red;">g[]</font><br></h1><p>def</p>',
            });
            await testEditor({
                contentBefore:
                    '<h1><font style="background-color: red;">[abc</font><br></h1><p>]def</p>',
                stepFunction: async (editor) => {
                    await deleteBackward(editor);
                    await insertText(editor, "g");
                },
                contentAfter:
                    '<h1><font style="background-color: red;">g[]</font><br></h1><p>def</p>',
            });
        }
    );
});
