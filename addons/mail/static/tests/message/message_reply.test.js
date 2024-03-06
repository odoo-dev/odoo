/** @odoo-module alias=@mail/../tests/message/message_reply_tests default=false */

import { startServer } from "@bus/../tests/helpers/mock_python_environment";

import { openDiscuss, start } from "@mail/../tests/helpers/test_utils";

import { deserializeDateTime } from "@web/core/l10n/dates";
import { getOrigin } from "@web/core/utils/urls";
import { patchWithCleanup } from "@web/../tests/helpers/utils";
import { click, contains } from "@web/../tests/utils";

QUnit.module("message reply");

QUnit.test("click on message in reply to highlight the parent message", async () => {
    const pyEnv = await startServer();
    const channelId = pyEnv["discuss.channel"].create({ name: "general" });
    const messageId = pyEnv["mail.message"].create({
        body: "Hey lol",
        message_type: "comment",
        model: "discuss.channel",
        res_id: channelId,
    });
    pyEnv["mail.message"].create({
        body: "Reply to Hey",
        message_type: "comment",
        model: "discuss.channel",
        parent_id: messageId,
        res_id: channelId,
    });
    await start();
    await openDiscuss(channelId);
    await click(".o-mail-MessageInReply-message", {
        parent: [".o-mail-Message", { text: "Reply to Hey" }],
    });
    await contains(".o-mail-Message.o-highlighted .o-mail-Message-content", { text: "Hey lol" });
});

QUnit.test("click on message in reply to scroll to the parent message", async () => {
    // make scroll behavior instantaneous.
    patchWithCleanup(Element.prototype, {
        scrollIntoView() {
            return super.scrollIntoView(true);
        },
    });
    const pyEnv = await startServer();
    const channelId = pyEnv["discuss.channel"].create({ name: "general" });
    const [oldestMessageId] = pyEnv["mail.message"].create(
        Array(20)
            .fill(0)
            .map(() => ({
                body: "Non Empty Body ".repeat(25),
                message_type: "comment",
                model: "discuss.channel",
                res_id: channelId,
            }))
    );
    pyEnv["mail.message"].create({
        body: "Response to first message",
        message_type: "comment",
        model: "discuss.channel",
        parent_id: oldestMessageId,
        res_id: channelId,
    });
    await start();
    await openDiscuss(channelId);
    await click(".o-mail-MessageInReply-message", {
        parent: [".o-mail-Message", { text: "Response to first message" }],
    });
    await contains(":nth-child(1 of .o-mail-Message)", { visible: true });
});

QUnit.test("reply shows correct author avatar", async (assert) => {
    const pyEnv = await startServer();
    const channelId = pyEnv["discuss.channel"].create({ name: "general" });
    const messageId = pyEnv["mail.message"].create({
        body: "Hey there",
        message_type: "comment",
        model: "discuss.channel",
        res_id: channelId,
    });
    const partnerId = pyEnv["res.partner"].create({ name: "John Doe" });
    const partner = pyEnv["res.partner"].searchRead([["id", "=", pyEnv.currentPartnerId]])[0];
    pyEnv["mail.message"].create({
        body: "Howdy",
        message_type: "comment",
        model: "discuss.channel",
        author_id: partnerId,
        parent_id: messageId,
        res_id: channelId,
    });
    await start();
    await openDiscuss(channelId);
    await contains(
        `.o-mail-MessageInReply-avatar[data-src='${`${getOrigin()}/web/image/res.partner/${
            pyEnv.currentPartnerId
        }/avatar_128?unique=${deserializeDateTime(partner.write_date).ts}`}`
    );
});
