import {
    click,
    defineMailModels,
    mockGetMedia,
    openDiscuss,
    start,
    startServer,
} from "@mail/../tests/mail_test_helpers";
import { advanceTime, describe, expect, freezeTime, test } from "@odoo/hoot";
import { waitFor } from "@odoo/hoot-dom";
import { getService } from "@web/../tests/web_test_helpers";

describe.current.tags("desktop");
defineMailModels();

async function startMutedPttCall() {
    mockGetMedia();
    const pyEnv = await startServer();
    const channelId = pyEnv["discuss.channel"].create({ name: "General" });
    await start();
    await openDiscuss(channelId);
    await click("[title='Start Call']");
    await waitFor(".o-discuss-Call");
    const rtc = getService("discuss.rtc");
    rtc.store.settings.usePushToTalk = true;
    rtc.store.settings.voiceActiveDuration = 200;
    rtc.localSession.is_muted = true;
    await advanceTime(0, { animationFrame: false });
    freezeTime();
    return rtc;
}

function extensionPress() {
    window.dispatchEvent(
        new MessageEvent("message", {
            source: window,
            origin: location.origin,
            data: { from: "discuss-push-to-talk", type: "push-to-talk-pressed" },
        })
    );
}

test("muted extension tap does not show a warning", async () => {
    const rtc = await startMutedPttCall();
    extensionPress();
    await advanceTime(750, { animationFrame: false });
    expect(rtc.localSession.isTalking).toBe(false);
    expect(rtc.showPttMutedWarning).toBe(false);
});

test("muted extension hold warns 500 ms after the first repeat", async () => {
    const rtc = await startMutedPttCall();
    extensionPress();
    await advanceTime(600, { animationFrame: false });
    expect(rtc.showPttMutedWarning).toBe(false);
    extensionPress();
    for (let i = 0; i < 4; i++) {
        await advanceTime(100, { animationFrame: false });
        extensionPress();
    }
    await advanceTime(99, { animationFrame: false });
    expect(rtc.showPttMutedWarning).toBe(false);
    await advanceTime(1, { animationFrame: false });
    expect(rtc.showPttMutedWarning).toBe(true);
});

test("voice duration does not delay cancellation or make a new tap count as a repeat", async () => {
    const rtc = await startMutedPttCall();
    rtc.store.settings.voiceActiveDuration = 2000;
    extensionPress();
    await advanceTime(100, { animationFrame: false });
    extensionPress();
    await advanceTime(200, { animationFrame: false });
    expect(rtc.localSession.isTalking).toBe(false);
    expect(rtc.pttMutedWarningDelayTimeout).toBe(undefined);
    extensionPress();
    await advanceTime(750, { animationFrame: false });
    expect(rtc.showPttMutedWarning).toBe(false);
    expect(rtc.localSession.isTalking).toBe(false);
});
