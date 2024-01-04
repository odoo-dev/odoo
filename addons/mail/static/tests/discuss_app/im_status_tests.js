/* @odoo-module */

import { UPDATE_BUS_PRESENCE_DELAY } from "@bus/im_status_service";
import { startServer } from "@bus/../tests/helpers/mock_python_environment";

import { Command } from "@mail/../tests/helpers/command";
<<<<<<< HEAD
import { start } from "@mail/../tests/helpers/test_utils";

import { click, contains } from "@web/../tests/utils";
||||||| parent of 7b4bb2b17280 (temp)
import { afterNextRender, click, start, startServer } from "@mail/../tests/helpers/test_utils";
=======
import { click, start, startServer } from "@mail/../tests/helpers/test_utils";

import { contains } from "@web/../tests/utils";
>>>>>>> 7b4bb2b17280 (temp)

QUnit.module("im status");

QUnit.test("initially online", async () => {
    const pyEnv = await startServer();
    const partnerId = pyEnv["res.partner"].create({ name: "Demo", im_status: "online" });
    const channelId = pyEnv["discuss.channel"].create({
        channel_member_ids: [
            Command.create({ partner_id: pyEnv.currentPartnerId }),
            Command.create({ partner_id: partnerId }),
        ],
        channel_type: "chat",
    });
    const { openDiscuss } = await start();
<<<<<<< HEAD
    openDiscuss(channelId);
    await contains(".o-mail-ImStatus i[title='Online']");
||||||| parent of 7b4bb2b17280 (temp)
    await openDiscuss(channelId);
    assert.containsOnce($, ".o-mail-ImStatus i[title='Online']");
=======
    await openDiscuss(channelId);
    await contains(".o-mail-ImStatus i[title='Online']");
>>>>>>> 7b4bb2b17280 (temp)
});

QUnit.test("initially offline", async () => {
    const pyEnv = await startServer();
    const partnerId = pyEnv["res.partner"].create({ name: "Demo", im_status: "offline" });
    const channelId = pyEnv["discuss.channel"].create({
        channel_member_ids: [
            Command.create({ partner_id: pyEnv.currentPartnerId }),
            Command.create({ partner_id: partnerId }),
        ],
        channel_type: "chat",
    });
    const { openDiscuss } = await start();
<<<<<<< HEAD
    openDiscuss(channelId);
    await contains(".o-mail-ImStatus i[title='Offline']");
||||||| parent of 7b4bb2b17280 (temp)
    await openDiscuss(channelId);
    assert.containsOnce($, ".o-mail-ImStatus i[title='Offline']");
=======
    await openDiscuss(channelId);
    await contains(".o-mail-ImStatus i[title='Offline']");
>>>>>>> 7b4bb2b17280 (temp)
});

QUnit.test("initially away", async () => {
    const pyEnv = await startServer();
    const partnerId = pyEnv["res.partner"].create({ name: "Demo", im_status: "away" });
    const channelId = pyEnv["discuss.channel"].create({
        channel_member_ids: [
            Command.create({ partner_id: pyEnv.currentPartnerId }),
            Command.create({ partner_id: partnerId }),
        ],
        channel_type: "chat",
    });
    const { openDiscuss } = await start();
<<<<<<< HEAD
    openDiscuss(channelId);
    await contains(".o-mail-ImStatus i[title='Idle']");
||||||| parent of 7b4bb2b17280 (temp)
    await openDiscuss(channelId);
    assert.containsOnce($, ".o-mail-ImStatus i[title='Idle']");
=======
    await openDiscuss(channelId);
    await contains(".o-mail-ImStatus i[title='Idle']");
>>>>>>> 7b4bb2b17280 (temp)
});

QUnit.test("change icon on change partner im_status", async () => {
    const pyEnv = await startServer();
    const partnerId = pyEnv["res.partner"].create({ name: "Demo", im_status: "online" });
    const channelId = pyEnv["discuss.channel"].create({
        channel_member_ids: [
            Command.create({ partner_id: pyEnv.currentPartnerId }),
            Command.create({ partner_id: partnerId }),
        ],
        channel_type: "chat",
    });
    const { advanceTime, openDiscuss } = await start({ hasTimeControl: true });
<<<<<<< HEAD
    openDiscuss(channelId);
    await contains(".o-mail-ImStatus i[title='Online']");
||||||| parent of 7b4bb2b17280 (temp)
    await openDiscuss(channelId);
    assert.containsOnce($, ".o-mail-ImStatus i[title='Online']");
=======
    await openDiscuss(channelId);
    await contains(".o-mail-ImStatus i[title='Online']");
>>>>>>> 7b4bb2b17280 (temp)

    pyEnv["res.partner"].write([partnerId], { im_status: "offline" });
<<<<<<< HEAD
    advanceTime(UPDATE_BUS_PRESENCE_DELAY);
    await contains(".o-mail-ImStatus i[title='Offline']");
||||||| parent of 7b4bb2b17280 (temp)
    await afterNextRender(() => advanceTime(UPDATE_BUS_PRESENCE_DELAY));
    assert.containsOnce($, ".o-mail-ImStatus i[title='Offline']");
=======
    await advanceTime(UPDATE_BUS_PRESENCE_DELAY);
    await contains(".o-mail-ImStatus i[title='Offline']");
>>>>>>> 7b4bb2b17280 (temp)

    pyEnv["res.partner"].write([partnerId], { im_status: "away" });
<<<<<<< HEAD
    advanceTime(UPDATE_BUS_PRESENCE_DELAY);
    await contains(".o-mail-ImStatus i[title='Idle']");
||||||| parent of 7b4bb2b17280 (temp)
    await afterNextRender(() => advanceTime(UPDATE_BUS_PRESENCE_DELAY));
    assert.containsOnce($, ".o-mail-ImStatus i[title='Idle']");
=======
    await advanceTime(UPDATE_BUS_PRESENCE_DELAY);
    await contains(".o-mail-ImStatus i[title='Idle']");
>>>>>>> 7b4bb2b17280 (temp)

    pyEnv["res.partner"].write([partnerId], { im_status: "online" });
<<<<<<< HEAD
    advanceTime(UPDATE_BUS_PRESENCE_DELAY);
    await contains(".o-mail-ImStatus i[title='Online']");
||||||| parent of 7b4bb2b17280 (temp)
    await afterNextRender(() => advanceTime(UPDATE_BUS_PRESENCE_DELAY));
    assert.containsOnce($, ".o-mail-ImStatus i[title='Online']");
=======
    await advanceTime(UPDATE_BUS_PRESENCE_DELAY);
    await contains(".o-mail-ImStatus i[title='Online']");
>>>>>>> 7b4bb2b17280 (temp)
});

QUnit.test("show im status in messaging menu preview of chat", async () => {
    const pyEnv = await startServer();
    const partnerId = pyEnv["res.partner"].create({ name: "Demo", im_status: "online" });
    pyEnv["discuss.channel"].create({
        channel_member_ids: [
            Command.create({ partner_id: pyEnv.currentPartnerId }),
            Command.create({ partner_id: partnerId }),
        ],
        channel_type: "chat",
    });
    await start();
    await click(".o_menu_systray i[aria-label='Messages']");
    await contains(".o-mail-NotificationItem", {
        text: "Demo",
        contains: ["i[aria-label='User is online']"],
    });
});
