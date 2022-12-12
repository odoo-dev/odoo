/** @odoo-module **/

import { afterNextRender, start, startServer } from "@mail/../tests/helpers/test_utils";
import { getFixture } from "@web/../tests/helpers/utils";

let target;

QUnit.module("attachment list", {
    async beforeEach() {
        target = getFixture();
    },
});

QUnit.test("simplest layout", async function (assert) {
    const pyEnv = await startServer();
    const channelId = pyEnv["mail.channel"].create({
        channel_type: "channel",
        name: "channel1",
    });
    const messageAttachmentId = pyEnv["ir.attachment"].create({
        name: "test.txt",
        mimetype: "text/plain",
    });
    pyEnv["mail.message"].create({
        attachment_ids: [messageAttachmentId],
        body: "<p>Test</p>",
        model: "mail.channel",
        res_id: channelId,
    });
    const { openDiscuss } = await start({
        discuss: {
            context: { active_id: `mail.channel_${channelId}` },
        },
    });
    await openDiscuss();
    assert.containsOnce(target, ".o-mail-message .o-mail-attachment-list");
    assert.hasAttrValue($(target).find(".o-mail-attachment-card"), "title", "test.txt");
    assert.containsOnce(target, ".o-mail-attachment-image");
    assert.hasClass($(".o-mail-attachment-image"), "o_image"); // required for mimetype.scss style
    assert.hasAttrValue($(".o-mail-attachment-image"), "data-mimetype", "text/plain"); // required for mimetype.scss style
    assert.containsN(target, ".o-mail-attachment-card-aside button", 2);
    assert.containsOnce(target, ".o-mail-attachment-card-aside-unlink");
    assert.containsOnce(target, ".o-mail-attachment-card-aside button[title='Download']");
});

QUnit.test("layout with card details and filename and extension", async function (assert) {
    const pyEnv = await startServer();
    const channelId = pyEnv["mail.channel"].create({
        channel_type: "channel",
        name: "channel1",
    });
    const messageAttachmentId = pyEnv["ir.attachment"].create({
        name: "test.txt",
        mimetype: "text/plain",
    });
    pyEnv["mail.message"].create({
        attachment_ids: [messageAttachmentId],
        body: "<p>Test</p>",
        model: "mail.channel",
        res_id: channelId,
    });
    const { openDiscuss } = await start({
        discuss: {
            context: { active_id: `mail.channel_${channelId}` },
        },
    });
    await openDiscuss();
    assert.containsOnce(target, ".o-mail-attachment-card:contains('test.txt')");
    assert.containsOnce(target, ".o-mail-attachment-card small:contains('txt')");
});

QUnit.test(
    "clicking on the delete attachment button multiple times should do the rpc only once",
    async function (assert) {
        const pyEnv = await startServer();
        const channelId = pyEnv["mail.channel"].create({
            channel_type: "channel",
            name: "channel1",
        });
        const messageAttachmentId = pyEnv["ir.attachment"].create({
            name: "test.txt",
            mimetype: "text/plain",
        });
        pyEnv["mail.message"].create({
            attachment_ids: [messageAttachmentId],
            body: "<p>Test</p>",
            model: "mail.channel",
            res_id: channelId,
        });
        const { click, openDiscuss } = await start({
            discuss: {
                context: { active_id: `mail.channel_${channelId}` },
            },
            async mockRPC(route, args) {
                if (route === "/mail/attachment/delete") {
                    assert.step("attachment_unlink");
                }
            },
        });
        await openDiscuss();

        await click(".o-mail-attachment-card-aside-unlink");
        await afterNextRender(() => {
            document.querySelector(".modal-footer .btn-primary").click();
            document.querySelector(".modal-footer .btn-primary").click();
            document.querySelector(".modal-footer .btn-primary").click();
        });
        assert.verifySteps(["attachment_unlink"], "The unlink method must be called once");
    }
);
