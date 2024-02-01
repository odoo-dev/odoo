import { describe, test } from "@odoo/hoot";
import { testEditor } from "../test_helpers/editor";
import { unformat } from "../test_helpers/format";
import { deleteBackward } from "../test_helpers/user_actions";

describe("monetary field", () => {
    test.todo("should make a span inside a monetary field be unremovable", async () => {
        const content = unformat(`
            <p>
                <span data-oe-model="product.template" data-oe-id="27" data-oe-field="list_price" data-oe-type="monetary" data-oe-expression="product.list_price" data-oe-xpath="/t[1]/div[1]/h3[2]/span[1]" class="o_editable">
                    $&nbsp;
                    <span class="oe_currency_value">[]</span>
                </span>
            </p>
        `);
        await testEditor({
            contentBefore: content,
            stepFunction: deleteBackward,
            contentAfter: content,
        });
    });
});
