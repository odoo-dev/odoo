import { test } from "@odoo/hoot";
import { testEditor } from "../test_helpers/editor";

test("should remove comment node inside editable content during sanitize", async () => {
    await testEditor({
        contentBefore: "<p>ab<!-- comment -->cd</p>",
        contentAfter: "<p>abcd</p>",
    });
});
