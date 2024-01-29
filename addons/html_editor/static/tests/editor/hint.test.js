/** @odoo-module */

import { expect, test } from "@odoo/hoot";
import { setupEditor } from "../test_helpers/editor";
import { getContent } from "../test_helpers/selection";

test("hints are removed when editor is destroyed", async () => {
    const { el, editor } = await setupEditor("<p>[]</p>", {});
    expect(getContent(el)).toBe(`<p placeholder="Type "/" for commands" class="o-we-hint">[]</p>`);
    editor.destroy();
    expect(getContent(el)).toBe("<p>[]</p>");
});
