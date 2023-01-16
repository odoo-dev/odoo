/** @odoo-module **/

import { start, startServer } from "@mail/../tests/helpers/test_utils";

import { getFixture } from "@web/../tests/helpers/utils";

let target;

const views = {
    "res.fake,false,form": `
    <form string="Fake">
        <div class="oe_chatter">
            <field name="message_follower_ids"/>
        </div>
    </form>`,
};

QUnit.module("suggested_recipients", {
    async beforeEach() {
        target = getFixture();
    },
});

QUnit.test("with 3 or less suggested recipients: no 'show more' button", async function (assert) {
    const pyEnv = await startServer();
    const resPartnerId1 = pyEnv["res.partner"].create({
        display_name: "John Jane",
        email: "john@jane.be",
    });
    const resFakeId1 = pyEnv["res.fake"].create({
        email_cc: "john@test.be",
        partner_ids: [resPartnerId1],
    });
    const { click, openView } = await start();
    await openView({
        res_id: resFakeId1,
        res_model: "res.fake",
        views: [[false, "form"]],
    });
    await click(`.o-mail-chatter-topbar-send-message-button`);
    assert.containsNone(target, ".o-mail-suggested-recipient-show-more");
});

QUnit.test(
    "more than 3 suggested recipients: display only 3 and 'show more' button",
    async function (assert) {
        const pyEnv = await startServer();
        const [resPartnerId1, resPartnerId2, resPartnerId3, resPartnerId4] = pyEnv[
            "res.partner"
        ].create([
            { display_name: "John Jane", email: "john@jane.be" },
            { display_name: "Jack Jone", email: "jack@jone.be" },
            { display_name: "jack sparrow", email: "jsparrow@blackpearl.bb" },
            { display_name: "jolly Roger", email: "Roger@skullflag.com" },
        ]);
        const resFakeId1 = pyEnv["res.fake"].create({
            partner_ids: [resPartnerId1, resPartnerId2, resPartnerId3, resPartnerId4],
        });
        const { click, openView } = await start({
            serverData: { views },
        });
        await openView({
            res_id: resFakeId1,
            res_model: "res.fake",
            views: [[false, "form"]],
        });

        await click(`.o-mail-chatter-topbar-send-message-button`);
        assert.containsOnce(target, ".o-mail-suggested-recipient-show-more");
    }
);

QUnit.test(
    "more than 3 suggested recipients: show all of them on click 'show more' button",
    async function (assert) {
        const pyEnv = await startServer();
        const [resPartnerId1, resPartnerId2, resPartnerId3, resPartnerId4] = pyEnv[
            "res.partner"
        ].create([
            { display_name: "John Jane", email: "john@jane.be" },
            { display_name: "Jack Jone", email: "jack@jone.be" },
            { display_name: "jack sparrow", email: "jsparrow@blackpearl.bb" },
            { display_name: "jolly Roger", email: "Roger@skullflag.com" },
        ]);
        const resFakeId1 = pyEnv["res.fake"].create({
            partner_ids: [resPartnerId1, resPartnerId2, resPartnerId3, resPartnerId4],
        });
        const { click, openView } = await start({
            serverData: { views },
        });
        await openView({
            res_id: resFakeId1,
            res_model: "res.fake",
            views: [[false, "form"]],
        });

        await click(`.o-mail-chatter-topbar-send-message-button`);
        await click(`.o-mail-suggested-recipient-show-more`);
        assert.containsN(target, ".o-mail-suggested-recipient", 4);
    }
);

QUnit.test(
    "more than 3 suggested recipients -> click 'show more' -> 'show less' button",
    async function (assert) {
        const pyEnv = await startServer();
        const [resPartnerId1, resPartnerId2, resPartnerId3, resPartnerId4] = pyEnv[
            "res.partner"
        ].create([
            { display_name: "John Jane", email: "john@jane.be" },
            { display_name: "Jack Jone", email: "jack@jone.be" },
            { display_name: "jack sparrow", email: "jsparrow@blackpearl.bb" },
            { display_name: "jolly Roger", email: "Roger@skullflag.com" },
        ]);
        const resFakeId1 = pyEnv["res.fake"].create({
            partner_ids: [resPartnerId1, resPartnerId2, resPartnerId3, resPartnerId4],
        });
        const { click, openView } = await start({
            serverData: { views },
        });
        await openView({
            res_id: resFakeId1,
            res_model: "res.fake",
            views: [[false, "form"]],
        });

        await click(`.o-mail-chatter-topbar-send-message-button`);
        await click(`.o-mail-suggested-recipient-show-more`);
        assert.containsOnce(target, ".o-mail-suggested-recipient-show-less");
    }
);

QUnit.test(
    "suggested recipients list display 3 suggested recipient and 'show more' button when 'show less' button is clicked",
    async function (assert) {
        const pyEnv = await startServer();
        const [resPartnerId1, resPartnerId2, resPartnerId3, resPartnerId4] = pyEnv[
            "res.partner"
        ].create([
            { display_name: "John Jane", email: "john@jane.be" },
            { display_name: "Jack Jone", email: "jack@jone.be" },
            { display_name: "jack sparrow", email: "jsparrow@blackpearl.bb" },
            { display_name: "jolly Roger", email: "Roger@skullflag.com" },
        ]);
        const resFakeId1 = pyEnv["res.fake"].create({
            partner_ids: [resPartnerId1, resPartnerId2, resPartnerId3, resPartnerId4],
        });
        const { click, openView } = await start({
            serverData: { views },
        });
        await openView({
            res_id: resFakeId1,
            res_model: "res.fake",
            views: [[false, "form"]],
        });

        await click(`.o-mail-chatter-topbar-send-message-button`);
        await click(`.o-mail-suggested-recipient-show-more`);
        await click(`.o-mail-suggested-recipient-show-less`);
        assert.containsN(target, ".o-mail-suggested-recipient", 3);
        assert.containsOnce(target, ".o-mail-suggested-recipient-show-more");
    }
);

QUnit.test("suggest recipient on 'Send message' composer", async function (assert) {
    const pyEnv = await startServer();
    const resPartnerId1 = pyEnv["res.partner"].create({
        display_name: "John Jane",
        email: "john@jane.be",
    });
    const resFakeId1 = pyEnv["res.fake"].create({
        email_cc: "john@test.be",
        partner_ids: [resPartnerId1],
    });
    const { click, openView } = await start({
        serverData: { views },
    });
    await openView({
        res_id: resFakeId1,
        res_model: "res.fake",
        views: [[false, "form"]],
    });
    await click(`.o-mail-chatter-topbar-send-message-button`);
    assert.containsOnce(target, ".o-mail-suggested-recipient input:checked");
});

QUnit.test("display reason for suggested recipient on mouse over", async function (assert) {
    const pyEnv = await startServer();
    const resPartnerId1 = pyEnv["res.partner"].create({
        display_name: "John Jane",
        email: "john@jane.be",
    });
    const resFakeId1 = pyEnv["res.fake"].create({ partner_ids: [resPartnerId1] });
    const { click, openView } = await start({
        serverData: { views },
    });
    await openView({
        res_id: resFakeId1,
        res_model: "res.fake",
        views: [[false, "form"]],
    });
    await click(`.o-mail-chatter-topbar-send-message-button`);
    const partnerTitle = target
        .querySelector(`.o-mail-suggested-recipient[data-partner-id="${resPartnerId1}"]`)
        .getAttribute("title");
    assert.strictEqual(partnerTitle, "Add as recipient and follower (reason: Email partner)");
});

QUnit.test("suggested recipient without partner are unchecked by default", async function (assert) {
    const pyEnv = await startServer();
    const resFakeId1 = pyEnv["res.fake"].create({ email_cc: "john@test.be" });
    const { click, openView } = await start({
        serverData: { views },
    });
    await openView({
        res_id: resFakeId1,
        res_model: "res.fake",
        views: [[false, "form"]],
    });
    await click(`.o-mail-chatter-topbar-send-message-button`);
    const checkboxUnchecked = target.querySelector(
        ".o-mail-suggested-recipient:not([data-partner-id]) input[type=checkbox]"
    );
    assert.notOk(checkboxUnchecked.checked);
});

QUnit.test("suggested recipient with partner are checked by default", async function (assert) {
    const pyEnv = await startServer();
    const resPartnerId1 = pyEnv["res.partner"].create({
        display_name: "John Jane",
        email: "john@jane.be",
    });
    const resFakeId1 = pyEnv["res.fake"].create({ partner_ids: [resPartnerId1] });
    const { click, openView } = await start({
        serverData: { views },
    });
    await openView({
        res_id: resFakeId1,
        res_model: "res.fake",
        views: [[false, "form"]],
    });
    await click(`.o-mail-chatter-topbar-send-message-button`);
    const checkboxChecked = document.querySelector(
        `.o-mail-suggested-recipient[data-partner-id="${resPartnerId1}"] input[type=checkbox]`
    );
    assert.ok(checkboxChecked.checked);
});

QUnit.test(
    "suggested recipients should not be notified when posting an internal note",
    async function (assert) {
        const pyEnv = await startServer();
        const resPartnerId1 = pyEnv["res.partner"].create({
            display_name: "John Jane",
            email: "john@jane.be",
        });
        const resFakeId1 = pyEnv["res.fake"].create({ partner_ids: [resPartnerId1] });
        const { click, insertText, openView } = await start({
            serverData: { views },
            async mockRPC(route, args) {
                if (route === "/mail/message/post") {
                    assert.strictEqual(
                        args.post_data.partner_ids.length,
                        0,
                        "post data should not contain suggested recipients when posting an internal note"
                    );
                }
            },
        });
        await openView({
            res_id: resFakeId1,
            res_model: "res.fake",
            views: [[false, "form"]],
        });
        await click(`.o-mail-chatter-topbar-log-note-button`);
        await insertText(".o-mail-composer-textarea", "Dummy Message");
        await click(".o-mail-composer-send-button");
    }
);
