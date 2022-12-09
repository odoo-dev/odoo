/** @odoo-module **/

import { start, startServer } from "@mail/../tests/helpers/test_utils";

import testUtils from "web.test_utils";
import { selectDropdownItem } from "@web/../tests/helpers/utils";

QUnit.module("FieldMany2ManyTagsEmail");

QUnit.test("fieldmany2many tags email (edition)", async function (assert) {
    assert.expect(17);

    const pyEnv = await startServer();
    const [resPartnerId1, resPartnerId2] = pyEnv["res.partner"].create([
        { name: "gold", email: "coucou@petite.perruche" },
        { name: "silver", email: "" },
    ]);
    const mailMessageId1 = pyEnv["mail.message"].create({
        partner_ids: [resPartnerId1],
    });
    const views = {
        "mail.message,false,form":
            '<form string="Partners">' +
            "<sheet>" +
            '<field name="body"/>' +
            '<field name="partner_ids" widget="many2many_tags_email"/>' +
            "</sheet>" +
            "</form>",
        "res.partner,false,form":
            '<form string="Types"><field name="name"/><field name="email"/></form>',
    };
    var { openView } = await start({
        serverData: { views },
        mockRPC: function (route, args) {
            if (args.method === "read" && args.model === "res.partner") {
                assert.step(JSON.stringify(args.args[0]));
                assert.ok(args.args[1].includes("email"), "should read the email");
            } else if (args.method === "get_formview_id") {
                return false;
            }
        },
    });
    await openView(
        {
            res_id: mailMessageId1,
            res_model: "mail.message",
            views: [[false, "form"]],
        },
        {
            mode: "edit",
        }
    );

    assert.verifySteps([`[${resPartnerId1}]`]);
    assert.containsOnce(
        document.body,
        '.o_field_many2many_tags_email[name="partner_ids"] .badge.o_tag_color_0',
        "should contain one tag"
    );

    // add an other existing tag
    await selectDropdownItem(document.body, "partner_ids", "silver");

    assert.strictEqual(
        document.querySelectorAll(".modal-content .o_form_view").length,
        1,
        "there should be one modal opened to edit the empty email"
    );
    assert.strictEqual(
        document.querySelector(".modal-content .o_form_view .o_input#name").value,
        "silver",
        "the opened modal in edit mode should be a form view dialog with the res.partner 14"
    );
    assert.strictEqual(
        document.querySelectorAll(".modal-content .o_form_view .o_input#email").length,
        1,
        "there should be an email field in the modal"
    );

    // set the email and save the modal (will rerender the form view)
    await testUtils.fields.editInput(
        $(".modal-content .o_form_view .o_input#email"),
        "coucou@petite.perruche"
    );
    await testUtils.dom.click($(".modal-content .o_form_button_save"));

    assert.containsN(
        document.body,
        '.o_field_many2many_tags_email[name="partner_ids"] .badge.o_tag_color_0',
        2,
        "should contain the second tag"
    );
    const firstTag = document.querySelector(
        '.o_field_many2many_tags_email[name="partner_ids"] .badge.o_tag_color_0'
    );
    assert.strictEqual(
        firstTag.querySelector(".o_badge_text").innerText,
        "gold",
        "tag should only show name"
    );
    assert.hasAttrValue(
        firstTag.querySelector(".o_badge_text"),
        "title",
        "coucou@petite.perruche",
        "tag should show email address on mouse hover"
    );
    // should have read resPartnerId2 three times: when opening the dropdown, when opening the modal, and
    // after the save
    assert.verifySteps([`[${resPartnerId2}]`, `[${resPartnerId2}]`, `[${resPartnerId2}]`]);
});

QUnit.test("many2many_tags_email widget can load more than 40 records", async function (assert) {
    assert.expect(3);

    const pyEnv = await startServer();
    const messagePartnerIds = [];
    for (let i = 100; i < 200; i++) {
        messagePartnerIds.push(pyEnv["res.partner"].create({ display_name: `partner${i}` }));
    }
    const mailMessageId1 = pyEnv["mail.message"].create({
        partner_ids: messagePartnerIds,
    });
    const views = {
        "mail.message,false,form":
            '<form><field name="partner_ids" widget="many2many_tags"/></form>',
    };
    var { openView } = await start({
        serverData: { views },
    });
    await openView({
        res_id: mailMessageId1,
        res_model: "mail.message",
        views: [[false, "form"]],
    });

    assert.strictEqual(
        document.querySelectorAll('.o_field_widget[name="partner_ids"] .badge').length,
        100
    );

    assert.containsOnce(document.body, ".o_form_editable");

    // add a record to the relation
    await selectDropdownItem(document.body, "partner_ids", "Public user");

    assert.strictEqual(
        document.querySelectorAll('.o_field_widget[name="partner_ids"] .badge').length,
        101
    );
});
