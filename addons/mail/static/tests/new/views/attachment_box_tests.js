/** @odoo-module **/

import { start, startServer } from "@mail/../tests/helpers/test_utils";

QUnit.module("attachment box");

QUnit.test("base empty rendering", async function (assert) {
    assert.expect(4);

    const pyEnv = await startServer();
    const resPartnerId1 = pyEnv["res.partner"].create({});
    const views = {
        "res.partner,false,form": `<form>
        <div class="oe_chatter">
            <field name="message_ids"  options="{'open_attachments': True}"/>
        </div>
    </form>`,
    };
    const { openView } = await start({ serverData: { views } });
    await openView({
        res_id: resPartnerId1,
        res_model: "res.partner",
        views: [[false, "form"]],
    });
    assert.containsOnce(document.body, ".o-mail-attachment-box", "should have an attachment box");
    assert.containsOnce(
        document.body,
        "button:contains('Attach files')",
        "should have a button add"
    );
    assert.containsOnce(
        document.body,
        ".o-mail-chatter input[type='file']",
        "should have a file uploader"
    );
    assert.containsNone(
        document.body,
        ".o-mail-chatter .o-mail-attachment-image",
        "should not have any attachment"
    );
});

QUnit.test("base non-empty rendering", async function (assert) {
    assert.expect(4);

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
        "res.partner,false,form": `<form>
        <div class="oe_chatter">
            <field name="message_ids"  options="{'open_attachments': True}"/>
        </div>
    </form>`,
    };
    const { openView } = await start({ serverData: { views } });
    await openView({
        res_id: resPartnerId1,
        res_model: "res.partner",
        views: [[false, "form"]],
    });
    assert.containsOnce(document.body, ".o-mail-attachment-box", "should have an attachment box");
    assert.containsOnce(
        document.body,
        "button:contains('Attach files')",
        "should have a button add"
    );
    assert.containsOnce(
        document.body,
        ".o-mail-chatter input[type='file']",
        "should have a file uploader"
    );
    assert.containsOnce(document.body, ".o-mail-attachment-list", "should have an attachment list");
});

QUnit.test("remove attachment should ask for confirmation", async function (assert) {
    assert.expect(4);

    const pyEnv = await startServer();
    const resPartnerId1 = pyEnv["res.partner"].create({});
    pyEnv["ir.attachment"].create({
        mimetype: "text/plain",
        name: "Blah.txt",
        res_id: resPartnerId1,
        res_model: "res.partner",
    });
    const views = {
        "res.partner,false,form": `<form>
        <div class="oe_chatter">
            <field name="message_ids"  options="{'open_attachments': True}"/>
        </div>
    </form>`,
    };
    const { click, openView } = await start({ serverData: { views } });
    await openView({
        res_id: resPartnerId1,
        res_model: "res.partner",
        views: [[false, "form"]],
    });

    assert.containsOnce(document.body, ".o-mail-attachment-image", "should have an attachment");
    assert.containsOnce(
        document.body,
        "button[title='Remove']",
        "attachment should have a delete button"
    );

    await click("button[title='Remove']");
    assert.containsOnce(
        document.body,
        ".modal-body:contains('Do you really want to delete \"Blah.txt\"?')"
    );

    // Confirm the deletion
    await click(".modal-footer .btn-primary");
    assert.containsNone(
        document.body,
        ".o-mail-attachment-images",
        "should no longer have an attachment"
    );
});
