import { describe, test } from "@odoo/hoot";
import { Command, serverState } from "@web/../tests/web_test_helpers";
import { contains, openDiscuss, start, startServer } from "@mail/../tests/mail_test_helpers";
import { defineHrModels } from "@hr/../tests/hr_test_helpers";

describe.current.tags("desktop");
defineHrModels();

test("off-hours takes precedence over the planned work location", async () => {
    const pyEnv = await startServer();
    const partnerId = pyEnv["res.partner"].create({ name: "Demo" });
    const userId = pyEnv["res.users"].create({ partner_id: partnerId, im_status: "online" });
    pyEnv["hr.employee"].create({
        is_outside_working_hours: true,
        user_id: userId,
        work_location_type: "home",
    });
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
        ".o-mail-DiscussContent-header .o-mail-ImStatus[data-icon='bedtime'][title='User is outside working hours and online']"
    );
});
