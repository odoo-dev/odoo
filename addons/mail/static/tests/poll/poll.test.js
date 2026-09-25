import {
    click,
    contains,
    defineMailModels,
    openDiscuss,
    start,
    startServer,
} from "@mail/../tests/mail_test_helpers";
import { describe, expect, test } from "@odoo/hoot";
import { mockDate } from "@odoo/hoot-mock";
import { formatDateTime } from "@web/core/l10n/dates";

describe.current.tags("desktop");
defineMailModels();

test("applying the initial custom poll end time displays it in duration", async () => {
    mockDate("2026-09-25 12:00:00");
    const pyEnv = await startServer();
    const channelId = pyEnv["discuss.channel"].create({ name: "General" });
    await start();
    await openDiscuss(channelId);
    await click(".o-mail-Composer button[title='More Actions']");
    await click(".o-dropdown-item:text('Create Poll')");
    const endDateLabel = formatDateTime(
        luxon.DateTime.now().plus({ minutes: 10 }).startOf("minute"),
        { showSeconds: false }
    );
    await click("button[name='poll_duration']");
    await click(".o-dropdown-item:text('Custom')");
    expect("button[name='poll_duration']").toHaveText("Custom");
    await contains(".o_datetime_buttons button[title='Clear']", { count: 0 });
    await click(".o_datetime_buttons button:text('Apply')");
    expect("button[name='poll_duration']").toHaveText(endDateLabel);
    await click("button[name='poll_duration']");
    await click(`.o-dropdown-item:text('${endDateLabel}')`);
    expect("button[name='poll_duration']").toHaveText(endDateLabel);
    await contains(".o_datetime_buttons");
    await click("button[name='poll_duration']");
    await contains(".o_datetime_buttons", { count: 0 });
    await contains(".o-dropdown--menu", { count: 0 });
    await click("button[name='poll_duration']");
    await click(".o-dropdown-item:text('1 hour')");
    expect("button[name='poll_duration']").toHaveText("1 hour");
});

test("a poll cannot end in the past", async () => {
    mockDate("2026-09-25 12:00:00");
    const pyEnv = await startServer();
    const channelId = pyEnv["discuss.channel"].create({ name: "General" });
    await start();
    await openDiscuss(channelId);
    await click(".o-mail-Composer button[title='More Actions']");
    await click(".o-dropdown-item:text('Create Poll')");
    await click("button[name='poll_duration']");
    await click(".o-dropdown-item:text('Custom')");
    await click(".o_date_item_cell:not(.o_out_of_range):text('24')");
    await click(".o_datetime_buttons button:text('Apply')");
    await click(".modal-footer button:text('Post')");
    await contains(".form-text:text('Choose an end time in the future.')");
});

test("can add, replace, and remove emojis to a poll option", async () => {
    const pyEnv = await startServer();
    const channelId = pyEnv["discuss.channel"].create({ name: "General" });
    await start();
    await openDiscuss(channelId);
    await click(".o-mail-Composer button[title='More Actions']");
    await click(".o-dropdown-item:text('Create Poll')");
    await contains(".modal-header:text('Create Poll')");
    await click(".o-mail-CreatePollOptionDialog:first [data-icon='sentiment_satisfied']");
    await click(".o-Emoji:text('😀')");
    await click(".o-mail-CreatePollOptionDialog:first span:text('😀')");
    await click(".o-dropdown-item:text('Replace Emoji')");
    await click(".o-Emoji:text('😁')");
    await click(".o-mail-CreatePollOptionDialog:first span:text('😁')");
    await click(".o-dropdown-item:text('Remove Emoji')");
    await contains(".o-mail-CreatePollOptionDialog:first [data-icon='sentiment_satisfied']");
});

test("poll creation should be disabled during message editing", async () => {
    const pyEnv = await startServer();
    const channelId = pyEnv["discuss.channel"].create({ name: "General" });
    pyEnv["mail.message"].create({
        body: "Hello world",
        model: "discuss.channel",
        res_id: channelId,
        message_type: "comment",
    });
    await start();
    await openDiscuss(channelId);
    await click(".o-mail-Composer button[title='More Actions']");
    await contains(".o-dropdown-item:text('Create Poll')");
    await click(".o-mail-Message [title='Expand']");
    await click(".o-dropdown-item:text('Edit')");
    await click(".o-mail-Message .o-mail-Composer button[title='More Actions']");
    await contains(".o-dropdown-item:text('Attach Files')");
    await contains(".o-dropdown-item:text('Create Poll')", { count: 0 });
});
