import { describe, test } from "@odoo/hoot";
import { Command, serverState } from "@web/../tests/web_test_helpers";
import {
    contains,
    defineMailModels,
    openDiscuss,
    start,
    startServer,
} from "@mail/../tests/mail_test_helpers";

describe.current.tags("desktop");
defineMailModels();

test("Discuss calls display the call status", async () => {
    const pyEnv = await startServer();
    const partnerId = pyEnv["res.partner"].create({ name: "Demo" });
    pyEnv["res.users"].create({ partner_id: partnerId, im_status: "online" });
    const channelId = pyEnv["discuss.channel"].create({
        channel_member_ids: [
            Command.create({ partner_id: serverState.partnerId }),
            Command.create({ partner_id: partnerId }),
        ],
        channel_type: "chat",
    });
    const [memberId] = pyEnv["discuss.channel.member"].search([
        ["channel_id", "=", channelId],
        ["partner_id", "=", partnerId],
    ]);
    pyEnv["discuss.channel.rtc.session"].create({
        channel_id: channelId,
        channel_member_id: memberId,
    });
    await start();
    await openDiscuss(channelId);
    await contains(
        ".o-mail-DiscussContent-header .o-mail-ImStatus[data-icon='videocam'][title='User is in a Discuss meeting and online']"
    );
});
