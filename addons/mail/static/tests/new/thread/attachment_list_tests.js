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

QUnit.test("view attachment", async function (assert) {
    const pyEnv = await startServer();
    const channelId = pyEnv["mail.channel"].create({
        channel_type: "channel",
        name: "channel1",
    });
    const messageAttachmentId = pyEnv["ir.attachment"].create({
        name: "test.png",
        mimetype: "image/png",
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
    });
    await openDiscuss();
    assert.containsOnce(target, ".o-mail-attachment-image img");
    await click(".o-mail-attachment-image");
    assert.containsOnce(target, ".o-mail-attachment-viewer");
});

QUnit.test("close attachment viewer", async function (assert) {
    const pyEnv = await startServer();
    const channelId = pyEnv["mail.channel"].create({
        channel_type: "channel",
        name: "channel1",
    });
    const messageAttachmentId = pyEnv["ir.attachment"].create({
        name: "test.png",
        mimetype: "image/png",
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
    });
    await openDiscuss();
    assert.containsOnce(target, ".o-mail-attachment-image img");

    await click(".o-mail-attachment-image");
    assert.containsOnce(target, ".o-mail-attachment-viewer");

    await click(".o-mail-attachment-viewer-headerItemButtonClose");
    assert.containsNone(target, ".o-mail-attachment-viewer");
});

QUnit.test(
    "[technical] does not crash when the viewer is closed before image load",
    async function (assert) {
        /**
         * When images are displayed using `src` attribute for the 1st time, it fetches the resource.
         * In this case, images are actually displayed (fully fetched and rendered on screen) when
         * `<image>` intercepts `load` event.
         *
         * Current code needs to be aware of load state of image, to display spinner when loading
         * and actual image when loaded. This test asserts no crash from mishandling image becoming
         * loaded from being viewed for 1st time, but viewer being closed while image is loading.
         */
        const pyEnv = await startServer();
        const channelId = pyEnv["mail.channel"].create({
            channel_type: "channel",
            name: "channel1",
        });
        const messageAttachmentId = pyEnv["ir.attachment"].create({
            name: "test.png",
            mimetype: "image/png",
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
        });
        await openDiscuss();
        await click(".o-mail-attachment-image");
        const imageEl = document.querySelector(".o-mail-attachment-viewer-viewImage");
        await click(".o-mail-attachment-viewer-headerItemButtonClose");
        // Simulate image becoming loaded.
        let successfulLoad;
        try {
            imageEl.dispatchEvent(new Event("load", { bubbles: true }));
            successfulLoad = true;
        } catch {
            successfulLoad = false;
        } finally {
            assert.ok(successfulLoad);
        }
    }
);

QUnit.test("plain text file is viewable", async function (assert) {
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
    assert.hasClass($(target).find(".o-mail-attachment-card"), "o-mail-viewable");
});

QUnit.test("HTML file is viewable", async function (assert) {
    const pyEnv = await startServer();
    const channelId = pyEnv["mail.channel"].create({
        channel_type: "channel",
        name: "channel1",
    });
    const messageAttachmentId = pyEnv["ir.attachment"].create({
        name: "test.html",
        mimetype: "text/html",
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
    assert.hasClass($(target).find(".o-mail-attachment-card"), "o-mail-viewable");
});

QUnit.test("ODT file is not viewable", async function (assert) {
    const pyEnv = await startServer();
    const channelId = pyEnv["mail.channel"].create({
        channel_type: "channel",
        name: "channel1",
    });
    const messageAttachmentId = pyEnv["ir.attachment"].create({
        name: "test.odt",
        mimetype: "application/vnd.oasis.opendocument.text",
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
    assert.doesNotHaveClass($(target).find(".o-mail-attachment-card"), "o-mail-viewable");
});

QUnit.test("DOCX file is not viewable", async function (assert) {
    const pyEnv = await startServer();
    const channelId = pyEnv["mail.channel"].create({
        channel_type: "channel",
        name: "channel1",
    });
    const messageAttachmentId = pyEnv["ir.attachment"].create({
        name: "test.docx",
        mimetype: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
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
    assert.doesNotHaveClass($(target).find(".o-mail-attachment-card"), "o-mail-viewable");
});
