/** @odoo-module */

import { test } from "@odoo/hoot";
import { testEditor } from "../../helpers";

test.todo("should remove the background image when clear the format", async () => {
    await testEditor({
        contentBefore:
            '<div><p><font class="text-gradient" style="background-image: linear-gradient(135deg, rgb(255, 204, 51) 0%, rgb(226, 51, 255) 100%);">[ab]</font></p></div>',
        stepFunction: (editor) => editor.dispatch("FORMAT_REMOVE_FORMAT"),
        contentAfter: "<div><p>[ab]</p></div>",
    });
});
