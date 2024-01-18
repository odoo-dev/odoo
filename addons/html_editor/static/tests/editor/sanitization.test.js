/** @odoo-module */

import { test } from "@odoo/hoot";
import { testEditor } from "../helpers";

test("should remove empty class attribute", async () => {
    // content after is compared after cleaning up DOM
    await testEditor({
        contentBefore: "<div class=''></div>",
        contentAfter: "<div></div>",
    });
});
