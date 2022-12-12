/** @odoo-module **/

import { start, startServer } from "@mail/../tests/helpers/test_utils";
import { getFixture } from "@web/../tests/helpers/utils";

let target;
QUnit.module("attachment box", {
    async beforeEach() {
        target = getFixture();
    },
});

QUnit.test("base empty rendering", async function (assert) {
    const pyEnv = await startServer();
    const resPartnerId1 = pyEnv["res.partner"].create({});
    const views = {
        "res.partner,false,form": `
            <form>
                <div class="oe_chatter">
                    <field name="message_ids"  options="{'open_attachments': True}"/>
                </div>
            </form>
        `,
    };
    const { openView } = await start({ serverData: { views } });
    await openView({
        res_id: resPartnerId1,
        res_model: "res.partner",
        views: [[false, "form"]],
    });
    assert.containsOnce(target, ".o-mail-attachment-box");
    assert.containsOnce(target, "button:contains('Attach files')");
    assert.containsOnce(target, ".o-mail-chatter input[type='file']");
    assert.containsNone(target, ".o-mail-chatter .o-mail-attachment-image");
});

QUnit.test("base non-empty rendering", async function (assert) {
    const pyEnv = await startServer();
    const resPartnerId1 = pyEnv["res.partner"].create({});
    pyEnv["ir.attachment"].create([
        {
            mimetype: "text/plain",
            name: "Blah.txt",
            res_id: resPartnerId1,
            res_model: "res.partner",
        },
        {
            mimetype: "text/plain",
            name: "Blu.txt",
            res_id: resPartnerId1,
            res_model: "res.partner",
        },
    ]);
    const views = {
        "res.partner,false,form": `
            <form>
                <div class="oe_chatter">
                    <field name="message_ids"  options="{'open_attachments': True}"/>
                </div>
            </form>
        `,
    };
    const { openView } = await start({ serverData: { views } });
    await openView({
        res_id: resPartnerId1,
        res_model: "res.partner",
        views: [[false, "form"]],
    });
    assert.containsOnce(target, ".o-mail-attachment-box");
    assert.containsOnce(target, "button:contains('Attach files')");
    assert.containsOnce(target, ".o-mail-chatter input[type='file']");
    assert.containsOnce(target, ".o-mail-attachment-list");
});

QUnit.test("remove attachment should ask for confirmation", async function (assert) {
    const pyEnv = await startServer();
    const resPartnerId1 = pyEnv["res.partner"].create({});
    pyEnv["ir.attachment"].create({
        mimetype: "text/plain",
        name: "Blah.txt",
        res_id: resPartnerId1,
        res_model: "res.partner",
    });
    const views = {
        "res.partner,false,form": `
            <form>
                <div class="oe_chatter">
                    <field name="message_ids"  options="{'open_attachments': True}"/>
                </div>
            </form>
        `,
    };
    const { click, openView } = await start({ serverData: { views } });
    await openView({
        res_id: resPartnerId1,
        res_model: "res.partner",
        views: [[false, "form"]],
    });
    assert.containsOnce(target, ".o-mail-attachment-image");
    assert.containsOnce(target, "button[title='Remove']");

    await click("button[title='Remove']");
    assert.containsOnce(
        target,
        ".modal-body:contains('Do you really want to delete \"Blah.txt\"?')"
    );

    // Confirm the deletion
    await click(".modal-footer .btn-primary");
    assert.containsNone(target, ".o-mail-attachment-images");
});
