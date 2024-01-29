/** @odoo-module */

import { test } from "@odoo/hoot";
import { testEditor } from "../../test_helpers/editor";

test.todo("should remove transient elements children during cleaning", async () => {
    await testEditor({
        contentBefore: '<div><p>a</p></div><div data-oe-transient-content="true"><p>a</p></div>',
        contentAfter: '<div><p>a</p></div><div data-oe-transient-content="true"></div>',
    });
});

test.todo("should ignore transient elements children during serialization", async () => {
    await testEditor({
        contentBefore: '<div><p>a</p></div><div data-oe-transient-content="true"><p>a</p></div>',
        stepFunction: async (editor) => {
            const elements = [];
            for (const element of [...editor.editable.children]) {
                elements.push(editor.unserializeNode(editor.serializeNode(element)));
            }
            const container = document.createElement("DIV");
            container.append(...elements);
            editor.resetContent(container.innerHTML);
        },
        contentAfter: '<div><p>a</p></div><div data-oe-transient-content="true"></div>',
    });
});
