import { describe, test } from "@odoo/hoot";
import { Command, serverState } from "@web/../tests/web_test_helpers";
import { contains, openDiscuss, start, startServer } from "@mail/../tests/mail_test_helpers";
import { defineCalendarModels } from "@calendar/../tests/calendar_test_helpers";

describe.current.tags("desktop");
defineCalendarModels();

test("accepted busy calendar event displays the meeting status", async () => {
    const pyEnv = await startServer();
    const partnerId = pyEnv["res.partner"].create({
        is_in_calendar_meeting: true,
        name: "Demo",
    });
    pyEnv["res.users"].create({ partner_id: partnerId, im_status: "online" });
    const channelId = pyEnv["discuss.channel"].create({
        channel_member_ids: [
            Command.create({ partner_id: serverState.partnerId }),
            Command.create({ partner_id: partnerId }),
        ],
        channel_type: "chat",
    });
    await start();
    await openDiscuss(channelId);
    await contains(
        ".o-mail-DiscussContent-header .o-mail-ImStatus[data-icon='calendar_month'][title='User is in a meeting and online']"
    );
});
