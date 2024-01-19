/** @odoo-module */

import { test } from "@odoo/hoot";
import { testEditor } from "../helpers";

test.todo("should remove comment node inside editable content during sanitize", async () => {
    await testEditor({
        contentBefore: "<p>ab<!-- comment -->cd</p>",
        contentAfter: "<p>abcd</p>",
    });
});
