import {
    click,
    defineMailModels,
    mockGetMedia,
    openDiscuss,
    start,
    startServer,
} from "@mail/../tests/mail_test_helpers";
import { getService, onRpc } from "@web/../tests/web_test_helpers";

import { advanceTime, beforeEach, describe, expect, test } from "@odoo/hoot";

describe.current.tags("desktop");
defineMailModels();

beforeEach(() => {
    mockGetMedia();
});

/**
 * Joins a call and returns the rtc service, with the microphone already muted.
 */
async function startMutedCall() {
    const pyEnv = await startServer();
    onRpc("/mail/rtc/channel/upgrade_connection", () => {});
    const channelId = pyEnv["discuss.channel"].create({ name: "General" });
    pyEnv["discuss.channel.rtc.session"].create({
        channel_member_id: pyEnv["discuss.channel.member"].create({
            channel_id: channelId,
            partner_id: pyEnv["res.partner"].create({ name: "Alice" }),
        }),
        channel_id: channelId,
    });
    await start();
    await openDiscuss(channelId);
    await click("[title='Join Call']");
    const rtc = getService("discuss.rtc");
    await rtc.setMute(true);
    return rtc;
}

test("talking while unmuted never warns", async () => {
    const rtc = await startMutedCall();
    await rtc.setMute(false);
    rtc.localSession.isTalking = true;
    await advanceTime(10_000);
    expect(rtc.showMicrophoneMuteWarning).toBe(false);
});

test("talking while muted warns", async () => {
    const rtc = await startMutedCall();
    rtc.localSession.isTalking = true;
    await advanceTime(4_000);
    expect(rtc.showMicrophoneMuteWarning).toBe(true);
});

test("talking briefly while muted does not warn", async () => {
    const rtc = await startMutedCall();
    rtc.localSession.isTalking = true;
    await advanceTime(1_000);
    rtc.localSession.isTalking = false;
    await advanceTime(5_000);
    expect(rtc.showMicrophoneMuteWarning).toBe(false);
});

test("unmuting clears the warning", async () => {
    const rtc = await startMutedCall();
    rtc.localSession.isTalking = true;
    await advanceTime(4_000);
    expect(rtc.showMicrophoneMuteWarning).toBe(true);
    await rtc.setMute(false);
    expect(rtc.showMicrophoneMuteWarning).toBe(false);
});

test("talking continuously does not spin on timers", async () => {
    const rtc = await startMutedCall();
    rtc.localSession.isTalking = true;
    await advanceTime(60_000);
    expect(rtc.showMicrophoneMuteWarning).toBe(true);
});
