import {
    click,
    contains,
    defineMailModels,
    mockGetMedia,
    openDiscuss,
    start,
    startServer,
} from "@mail/../tests/mail_test_helpers";

import { describe, test } from "@odoo/hoot";

import { patchWithCleanup } from "@web/../tests/web_test_helpers";
import { browser } from "@web/core/browser/browser";

describe.current.tags("desktop");
defineMailModels();

function mockPermissionsPrompt() {
    patchWithCleanup(browser.navigator, {
        permissions: {
            async query(descriptor) {
                const state =
                    descriptor.name === "microphone"
                        ? "prompt"
                        : descriptor.name === "camera"
                        ? "prompt"
                        : "granted";
                return {
                    state,
                    addEventListener: () => {},
                    removeEventListener: () => {},
                    onchange: null,
                };
            },
        },
    });
}

function mockGetUserMediaWithFailures(failAtCalls = [1, 3]) {
    let cameraCallCount = 0;
    let microphoneCallCount = 0;
    const originalGetUserMedia = browser.navigator.mediaDevices.getUserMedia;
    patchWithCleanup(browser.navigator.mediaDevices, {
        async getUserMedia(constraints) {
            if (constraints.video) {
                cameraCallCount++;
            } else if (constraints.audio) {
                microphoneCallCount++;
            }
            if (
                failAtCalls.includes(cameraCallCount) ||
                failAtCalls.includes(microphoneCallCount)
            ) {
                throw new Error("Failed to get user media");
            }
            return originalGetUserMedia.call(browser.navigator.mediaDevices, constraints);
        },
    });
}

test("Starting a video call and turning on camera asks for permissions", async () => {
    const pyEnv = await startServer();
    const channelId = pyEnv["discuss.channel"].create({ name: "General" });
    mockGetMedia();
    mockGetUserMediaWithFailures();
    mockPermissionsPrompt();
    const env = await start();
    const rtc = env.services["discuss.rtc"];
    await openDiscuss(channelId);
    // case 1: Use Camera
    await click("[title='Start Video Call']");
    await contains(".modal[role='dialog']", { count: 1 });
    rtc.state.videoPermission = "granted";
    await click(".modal-footer button", { text: "Use Camera" });
    await contains(".modal", { count: 0 });
    await contains(".o-discuss-CallActionList button.bg-danger[aria-label='Turn camera on']", {
        count: 0,
    });
    await click("[title='Disconnect']");
    rtc.state.videoPermission = "prompt";
    // case 2: Use Camera and Microphone
    await click("[title='Start Video Call']");
    await contains(".modal[role='dialog']", { count: 1 });
    rtc.state.audioPermission = "granted";
    await click(".modal-footer button", { text: "Join without camera" });
    await contains(".modal", { count: 0 });
    await contains(".o-discuss-CallActionList button.bg-danger[aria-label='Turn camera on']", {
        count: 1,
    });
    await contains(".o-discuss-CallActionList button.bg-danger[aria-label='Unmute']", {
        count: 0,
    });
});

test("Using microphone asks for permissions", async () => {
    const pyEnv = await startServer();
    const channelId = pyEnv["discuss.channel"].create({ name: "General" });
    mockGetMedia();
    mockGetUserMediaWithFailures();
    mockPermissionsPrompt();
    const env = await start();
    const rtc = env.services["discuss.rtc"];
    await openDiscuss(channelId);
    // case 1: Use Microphone
    await click("[title='Start Call']");
    await contains(".o-discuss-CallActionList button.bg-danger[aria-label='Turn camera on']", {
        count: 0,
    });
    await click(".o-discuss-CallActionList button.bg-danger[aria-label='Unmute']");
    await contains(".modal[role='dialog']", { count: 1 });
    rtc.state.audioPermission = "granted";
    await click(".modal-footer button", { text: "Use Microphone" });
    await contains(".modal", { count: 0 });
    // case 2: use microphone and camera
    rtc.state.audioPermission = "prompt";
    await click(".o-discuss-CallActionList button.bg-danger[aria-label='Unmute']");
    await contains(".modal[role='dialog']", { count: 1 });
    rtc.state.audioPermission = "granted";
    rtc.state.videoPermission = "granted";
    await click(".modal-footer button", { text: "Use Microphone and Camera" });
    await contains(".modal", { count: 0 });
    await contains(".o-discuss-CallActionList button.bg-danger", { count: 0 });
});
