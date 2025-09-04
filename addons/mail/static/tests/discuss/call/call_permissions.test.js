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

test("Microphone permission dialog provides correct interaction options", async () => {
    const pyEnv = await startServer();
    const channelId = pyEnv["discuss.channel"].create({ name: "General" });
    let micCallCount = 0;
    mockGetMedia();
    const originalGetUserMediaMic = browser.navigator.mediaDevices.getUserMedia;
    patchWithCleanup(browser.navigator.mediaDevices, {
        async getUserMedia(constraints) {
            if (constraints.audio || constraints.video) {
                micCallCount++;
                if (micCallCount === 1 || micCallCount === 3) {
                    throw new DOMException("Permission denied", "NotAllowedError");
                }
            }
            return originalGetUserMediaMic.call(browser.navigator.mediaDevices, constraints);
        },
    });
    patchWithCleanup(browser.navigator, {
        permissions: {
            async query(descriptor) {
                const state =
                    descriptor.name === "microphone"
                        ? rtc.state.permissionState.microphone
                        : descriptor.name === "camera"
                        ? rtc.state.permissionState.camera
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
    const env = await start();
    const rtc = env.services["discuss.rtc"];
    rtc.state.permissionState = { microphone: "prompt", camera: "prompt" };
    await openDiscuss(channelId);
    await click("[title='Start Call']"); // Case 1 : Join with microphone
    await contains(".modal[role='dialog']", { count: 1 });
    await click(".modal-footer button", { text: "Use Microphone" });
    await contains(".modal", { count: 0 });
    rtc.state.permissionState.microphone = "granted";
    await contains(".o-discuss-CallActionList button.bg-danger[aria-label='Turn camera on']");
    await contains(".o-discuss-CallActionList button.bg-danger[aria-label='Unmute']", { count: 0 });
    rtc.state.permissionState.microphone = "prompt";
    rtc.state.permissionState.camera = "prompt";
    await contains(
        ".o-discuss-CallActionList button.bg-danger[aria-label='Turn camera on'] .bg-warning .fa-exclamation-triangle"
    );
    await contains(
        ".o-discuss-CallActionList button.bg-danger[aria-label='Unmute'] .bg-warning .fa-exclamation-triangle"
    );
    await click(".o-discuss-CallActionList button[aria-label='Unmute']");
    await contains(".modal[role='dialog']", { count: 1 });
    await click(".modal-footer button", { text: "Use Microphone and Camera" });
    await contains(".modal", { count: 0 });
    rtc.state.permissionState = {
        camera: "granted",
        microphone: "granted",
    };
    await contains(".o-discuss-CallActionList button.bg-danger", { count: 0 });
});

test("Camera permission dialog provides correct interaction options", async () => {
    const pyEnv = await startServer();
    const channelId = pyEnv["discuss.channel"].create({ name: "General" });
    let cameraCallCount = 0;
    mockGetMedia();
    const originalGetUserMedia = browser.navigator.mediaDevices.getUserMedia;
    patchWithCleanup(browser.navigator.mediaDevices, {
        async getUserMedia(constraints) {
            if (constraints.video) {
                cameraCallCount++;
                if (cameraCallCount === 1 || cameraCallCount === 3) {
                    throw new DOMException("Permission denied", "NotAllowedError");
                }
            }
            return originalGetUserMedia.call(browser.navigator.mediaDevices, constraints);
        },
    });
    patchWithCleanup(browser.navigator, {
        permissions: {
            async query(descriptor) {
                const state =
                    descriptor.name === "camera"
                        ? rtc.state.permissionState.camera
                        : descriptor.name === "microphone"
                        ? rtc.state.permissionState.microphone
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
    const env = await start();
    const rtc = env.services["discuss.rtc"];
    rtc.state.permissionState = { camera: "prompt", microphone: "granted" };
    await openDiscuss(channelId);
    await click("[title='Start Call']");
    await click(".o-discuss-CallActionList button[aria-label='Turn camera on']"); // Case 1: Use camera test
    await contains(".modal[role='dialog']", { count: 1 });
    await click(".modal-footer button", { text: "Use Camera" });
    await contains(".modal", { count: 0 });
    rtc.state.permissionState.microphone = "prompt"; // Case 2: Join without camera test
    rtc.state.permissionState.camera = "prompt";
    await click(".o-discuss-CallActionList button.bg-danger[aria-label='Turn camera on']");
    await contains(".modal[role='dialog']", { count: 1 });
    rtc.state.permissionState.microphone = "granted";
    await click(".modal-footer button", { text: "Join without camera" });
    await contains(".modal", { count: 0 });
    await contains(".o-discuss-CallActionList button.bg-danger[aria-label='Turn camera on']");
    await contains(".o-discuss-CallActionList button.bg-danger[aria-label='Unmute']", { count: 0 });
});
