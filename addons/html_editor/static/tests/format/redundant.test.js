import { describe, test } from "@odoo/hoot";
import { testEditor } from "../_helpers/editor";
import { unformat } from "../_helpers/format";

describe("redundant element normalization", () => {
    test("should not unwrap inner font if intermediate span overrides color", async () => {
        await testEditor({
            contentBefore: unformat(`
                <p><font style="color:red"><span style="color:blue">
                    <font style="color:red">[]child</font>
                </span></font></p>
            `),
            contentAfter: unformat(`
                <p><font style="color:red"><span style="color:blue">
                    <font style="color:red">[]child</font>
                </span></font></p>
            `),
        });
    });
    test("should unwrap font if outer span provides identical styling", async () => {
        await testEditor({
            contentBefore: unformat(`
                <p><span style="color:red">
                    <font style="color:red">[]child</font>
                </span></p>
            `),
            contentAfter: unformat(`
                <p><span style="color:red">
                    child[]
                </span></p>
            `),
        });
    });
    test("should unwrap strong inside span with font-weight bold", async () => {
        await testEditor({
            contentBefore: unformat(`
                <p><span style="font-weight:bold">
                    <strong>[]child</strong>
                </span></p>
            `),
            contentAfter: unformat(`
                <p><span style="font-weight:bold">
                    child[]
                </span></p>
            `),
        });
    });
});
