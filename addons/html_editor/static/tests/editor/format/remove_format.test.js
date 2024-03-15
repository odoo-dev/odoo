import { test } from "@odoo/hoot";
import { testEditor } from "../../test_helpers/editor";

test.todo("should remove the background image when clear the format", async () => {
    await testEditor({
        contentBefore:
            '<div><p><font class="text-gradient" style="background-image: linear-gradient(135deg, rgb(255, 204, 51) 0%, rgb(226, 51, 255) 100%);">[ab]</font></p></div>',
        stepFunction: (editor) => editor.dispatch("FORMAT_REMOVE_FORMAT"),
        contentAfter: "<div><p>[ab]</p></div>",
    });
});

test.todo(
    "should remove all the colors for the text separated by Shift+Enter when using removeFormat button",
    async () => {
        await testEditor({
            contentBefore: `<div><h1><font style="color: rgb(255, 0, 0);">[abc</font><br><font style="color: rgb(255, 0, 0);">abc</font><br><font style="color: rgb(255, 0, 0);">abc</font><br><font style="color: rgb(255, 0, 0);">abc]</font></h1></div>`,
            stepFunction: (editor) => editor.dispatch("FORMAT_REMOVE_FORMAT"),
            contentAfter: `<div><h1>[abc<br>abc<br>abc<br>abc]</h1></div>`,
        });
        await testEditor({
            contentBefore: `<div><h1><font style="background-color: rgb(255, 0, 0);">[abc</font><br><font style="background-color: rgb(255, 0, 0);">abc</font><br><font style="background-color: rgb(255, 0, 0);">abc]</font></h1></div>`,
            stepFunction: (editor) => editor.dispatch("FORMAT_REMOVE_FORMAT"),
            contentAfter: `<div><h1>[abc<br>abc<br>abc]</h1></div>`,
        });
    }
);
test.todo(
    "should remove all the colors for the text separated by Enter when using removeFormat button",
    async () => {
        await testEditor({
            contentBefore: `<div><h1><font style="background-color: rgb(255, 0, 0);">[abc</font></h1><h1><font style="background-color: rgb(255, 0, 0);">abc</font></h1><h1><font style="background-color: rgb(255, 0, 0);">abc]</font></h1></div>`,
            stepFunction: (editor) => editor.dispatch("FORMAT_REMOVE_FORMAT"),
            contentAfter: `<div><h1>[abc</h1><h1>abc</h1><h1>abc]</h1></div>`,
        });
        await testEditor({
            contentBefore: `<div><h1><font style="color: rgb(255, 0, 0);">[abc</font></h1><h1><font style="color: rgb(255, 0, 0);">abc</font></h1><h1><font style="color: rgb(255, 0, 0);">abc]</font></h1></div>`,
            stepFunction: (editor) => editor.dispatch("FORMAT_REMOVE_FORMAT"),
            contentAfter: `<div><h1>[abc</h1><h1>abc</h1><h1>abc]</h1></div>`,
        });
    }
);
