import {
    click,
    createVideoStream,
    defineMailModels,
    MENU_ACTIVE_IDS,
    mockGetMedia,
    mockPermissionsPrompt,
    openDiscuss,
    start,
    startServer,
} from "@mail/../tests/mail_test_helpers";
import { getService } from "@web/../tests/web_test_helpers";

import {
    animationFrame,
    beforeEach,
    describe,
    expect,
    test,
    waitFor,
    waitForNone,
} from "@odoo/hoot";
import { CallPermissionDialog } from "@mail/discuss/call/common/call_permission_dialog";
import { patch } from "@web/core/utils/patch";

describe.current.tags("desktop");
defineMailModels();

function mockCapabilityElements({ usermedia = false, microphone = false, camera = false } = {}) {
    const capabilityConstructor = class {
        setConstraints() {}
    };
    patch(window, {
        HTMLUserMediaElement: usermedia ? capabilityConstructor : undefined,
        HTMLMicrophoneElement: microphone ? capabilityConstructor : undefined,
        HTMLCameraElement: camera ? capabilityConstructor : undefined,
    });
    patch(HTMLElement.prototype, {
        setConstraints(constraints) {
            this.constraints = constraints;
        },
    });
}

beforeEach(() => mockCapabilityElements());

test("Starting a video call asks for permissions", async () => {
    const pyEnv = await startServer();
    const channelId = pyEnv["discuss.channel"].create({ name: "General" });
    mockGetMedia();
    mockPermissionsPrompt();
    await start();
    const rtc = getService("discuss.rtc");
    await openDiscuss(channelId);
    await click("[title='Start Video Call']");
    await waitFor(".modal[role='dialog']:count(1)");
    rtc.cameraPermission = "granted";
    await click(".modal-footer button:text('Use camera')");
    await waitFor(".o-discuss-CallActionList button[title='Turn camera off']:count(1)");
});

test("Starting a meeting asks for microphone permission", async () => {
    await startServer();
    mockGetMedia();
    mockPermissionsPrompt();
    await start();
    const rtc = getService("discuss.rtc");
    await openDiscuss(MENU_ACTIVE_IDS.MEETING);
    await click("[title='New Meeting']");
    await click(".o-dropdown-item:text('Start Now')");
    await waitFor(".modal-footer button:count(2)");
    await waitFor(".modal-footer button:text('Use microphone and camera'):count(1)");
    await waitFor(".modal-footer button:text('Use microphone'):count(1)");
    rtc.microphonePermission = "granted";
    await click(".modal-footer button:text('Use microphone')");
    await waitFor(".o-discuss-CallActionList button[title='Mute']:count(1)");
    await waitFor(".o-discuss-CallActionList button[title='Turn camera on']:count(1)");
});

test("Starting a meeting with camera granted asks for microphone permission", async () => {
    await startServer();
    mockGetMedia();
    mockPermissionsPrompt();
    await start();
    const rtc = getService("discuss.rtc");
    await openDiscuss(MENU_ACTIVE_IDS.MEETING);
    rtc.cameraPermission = "granted";
    await click("[title='New Meeting']");
    await click(".o-dropdown-item:text('Start Now')");
    await waitFor(".o-discuss-CallActionList button[title='Turn camera off']:count(1)");
    await waitFor(".modal-footer button:count(1)");
    await waitFor(".modal-footer button:text('Use microphone'):count(1)");
});

test("Starting a meeting with microphone granted asks for camera permission", async () => {
    await startServer();
    mockGetMedia();
    mockPermissionsPrompt();
    await start();
    const rtc = getService("discuss.rtc");
    await openDiscuss(MENU_ACTIVE_IDS.MEETING);
    rtc.microphonePermission = "granted";
    await click("[title='New Meeting']");
    await click(".o-dropdown-item:text('Start Now')");
    await waitFor(".modal-footer button:count(1)");
    await waitFor(".modal-footer button:text('Use camera'):count(1)");
});

test("Turning on the microphone asks for permissions", async () => {
    const pyEnv = await startServer();
    const channelId = pyEnv["discuss.channel"].create({ name: "General" });
    mockGetMedia();
    mockPermissionsPrompt();
    await start();
    const rtc = getService("discuss.rtc");
    await openDiscuss(channelId);
    await click("[title='Start Call']");
    await waitFor(".o-discuss-CallActionList button[title='Turn camera on']:count(1)");
    await click(".o-discuss-CallActionList button[title='Unmute']");
    await waitFor(".modal[role='dialog']:count(1)");
    rtc.microphonePermission = "granted";
    await click(".modal-footer button:text('Use microphone')");
    await waitFor(".o-discuss-CallActionList button[title='Mute']:count(1)");
    await waitFor(".o-discuss-CallActionList button[title='Turn camera on']:count(1)");
});

test("Turning on the camera asks for permissions", async () => {
    const pyEnv = await startServer();
    const channelId = pyEnv["discuss.channel"].create({ name: "General" });
    mockGetMedia();
    mockPermissionsPrompt();
    await start();
    const rtc = getService("discuss.rtc");
    await openDiscuss(channelId);
    await click("[title='Start Call']");
    await click(".o-discuss-CallActionList button[title='Turn camera on']");
    await waitFor(".modal[role='dialog']:count(1)");
    rtc.cameraPermission = "granted";
    await click(".modal-footer button:text('Use camera')");
    await waitFor(".o-discuss-CallActionList button[title='Turn camera off']:count(1)");
});

test("Turn on both microphone and camera from permission dialog", async () => {
    const pyEnv = await startServer();
    const channelId = pyEnv["discuss.channel"].create({ name: "General" });
    mockGetMedia();
    mockPermissionsPrompt();
    await start();
    const rtc = getService("discuss.rtc");
    await openDiscuss(channelId);
    await click("[title='Start Call']");
    await waitFor(".o-discuss-CallActionList button[title='Turn camera on']:count(1)");
    await click(".o-discuss-CallActionList button[title='Turn camera on']");
    await waitFor(".modal[role='dialog']:count(1)");
    rtc.microphonePermission = "granted";
    rtc.cameraPermission = "granted";
    await click(".modal-footer button:text('Use microphone and camera')");
    await waitFor(".o-discuss-CallActionList button[title='Turn camera off']:count(1)");
    await waitFor(".o-discuss-CallActionList button[title='Mute']:count(1)");
});

test("Combined mic+camera button only shown when both permissions not granted", async () => {
    const pyEnv = await startServer();
    const channelId = pyEnv["discuss.channel"].create({ name: "General" });
    mockGetMedia();
    mockPermissionsPrompt();
    await start();
    const rtc = getService("discuss.rtc");
    await openDiscuss(channelId);
    await click("[title='Start Call']");
    await click(".o-discuss-CallActionList button[title='Turn camera on']");
    await waitFor(".modal-footer button:count(2)");
    await waitFor(".modal-footer button:text('Use microphone and camera'):count(1)");
    await waitFor(".modal-footer button:text('Use camera'):count(1)");
    rtc.cameraPermission = "granted";
    await click(".modal-footer button:text('Use camera')");
    await click(".o-discuss-CallActionList button[title='Unmute']");
    await waitFor(".modal-footer button:count(1)");
    await waitFor(".modal-footer button:text('Use microphone'):count(1)");
});

test("Microphone permission warning is hidden while the permission dialog is open", async () => {
    const pyEnv = await startServer();
    const channelId = pyEnv["discuss.channel"].create({ name: "General" });
    mockGetMedia();
    mockPermissionsPrompt();
    await start();
    const rtc = getService("discuss.rtc");
    await openDiscuss(channelId);
    await click("[title='Start Call']");
    await waitFor(".o_popover:text('No microphone permissions'):count(1)");
    await click(".o-discuss-CallActionList button[title='Turn camera on']");
    await waitFor(".modal:has(:text('Do you want people to see you in the meeting?')):count(1)");
    await waitForNone(".o_popover");
    // leaving the call closes the permission dialog, the warning comes back in the next call
    await click(".o-discuss-CallActionList button[aria-label='Disconnect']");
    await waitForNone(".modal");
    await click("[title='Start Call']");
    await waitFor(".o_popover:text('No microphone permissions'):count(1)");
    // dismissing the dialog without granting the permission brings the warning back
    await click(".o-discuss-CallActionList button[title='Turn camera on']");
    await waitFor(".modal:has(:text('Do you want people to see you in the meeting?')):count(1)");
    await waitForNone(".o_popover");
    await click(".modal .btn-close");
    await waitForNone(".modal");
    await waitFor(".o_popover:text('No microphone permissions'):count(1)");
    // granting the permissions from the dialog leaves no warning behind
    await click(".o-discuss-CallActionList button[title='Turn camera on']");
    await waitFor(".modal:has(:text('Do you want people to see you in the meeting?')):count(1)");
    rtc.cameraPermission = "granted";
    rtc.microphonePermission = "granted";
    await click(".modal-footer button:text('Use microphone and camera')");
    await waitFor(".o-discuss-CallActionList button[title='Turn camera off']:count(1)");
    await waitForNone(".o_popover");
});

test("capability elements replace only the supported permission buttons", async () => {
    mockCapabilityElements({ usermedia: true });
    await startServer();
    mockGetMedia();
    mockPermissionsPrompt();
    await start();
    const store = getService("mail.store");
    getService("dialog").add(CallPermissionDialog, {
        media: "microphone",
        useMicrophone: () => {},
        useCamera: () => {},
    });
    await waitFor(".modal-footer usermedia:count(1)");
    await waitFor(".modal-footer button:text('Use microphone'):count(1)");
    const usermedia = document.querySelector(".modal-footer usermedia");
    expect(".modal-footer usermedia").toHaveClass("btn");
    expect(".modal-footer usermedia").not.toHaveClass("btn-primary");
    expect(usermedia.parentElement).toHaveClass(
        "o_mail_call_permission_button_variables btn btn-primary"
    );
    expect(getComputedStyle(usermedia.parentElement).display).toBe("contents");
    expect(".modal-footer button:text('Use microphone')").toHaveClass("btn btn-secondary");
    expect(usermedia.constraints).toEqual({
        audio: store.settings.audioConstraints,
        video: store.settings.cameraConstraints,
    });
    expect(document.querySelector(".modal-footer microphone")).toBe(null);
    const rtc = getService("discuss.rtc");
    rtc.cameraPermission = "granted";
    rtc.microphonePermission = "granted";
    await animationFrame();
    expect(document.querySelector(".modal-footer usermedia")).not.toBe(null);
});

test("combined native control only mounts when both permissions are needed", async () => {
    mockCapabilityElements({ usermedia: true });
    await startServer();
    mockGetMedia();
    mockPermissionsPrompt();
    await start();
    const rtc = getService("discuss.rtc");
    rtc.cameraPermission = "granted";
    const dialog = getService("dialog");
    const close = dialog.add(CallPermissionDialog, {
        media: "microphone",
        useMicrophone: () => {},
        useCamera: () => {},
    });
    await waitFor(".modal-footer button:text('Use microphone'):count(1)");
    expect(document.querySelector(".modal-footer usermedia")).toBe(null);

    close();
    await waitForNone(".modal");
    rtc.cameraPermission = "prompt";
    dialog.add(CallPermissionDialog, {
        media: "microphone",
        suggestAllMedias: false,
        useMicrophone: () => {},
        useCamera: () => {},
    });
    await waitFor(".modal-footer button:text('Use microphone'):count(1)");
    expect(document.querySelector(".modal-footer usermedia")).toBe(null);
});

test("combined fallback button disappears when a permission is granted", async () => {
    await startServer();
    mockGetMedia();
    mockPermissionsPrompt();
    await start();
    const rtc = getService("discuss.rtc");
    getService("dialog").add(CallPermissionDialog, {
        media: "microphone",
        useMicrophone: () => {},
        useCamera: () => {},
    });
    await waitFor(".modal-footer button:text('Use microphone and camera'):count(1)");
    rtc.cameraPermission = "granted";
    await waitForNone(".modal-footer button:text('Use microphone and camera')");
});

test("single-device elements hand off their tracks and release unclaimed tracks", async () => {
    mockCapabilityElements({ microphone: true, camera: true });
    await startServer();
    mockGetMedia();
    mockPermissionsPrompt();
    await start();
    const dialog = getService("dialog");
    const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const audioTrack = audioStream.getAudioTracks()[0];
    let receivedAudio;
    dialog.add(CallPermissionDialog, {
        media: "microphone",
        suggestAllMedias: false,
        useMicrophone: (stream) => (receivedAudio = stream),
        useCamera: () => {},
    });
    await waitFor(".modal-footer microphone:count(1)");
    expect(".modal-footer microphone").toHaveClass("btn");
    expect(document.querySelector(".modal-footer microphone").parentElement).toHaveClass(
        "o_mail_call_permission_button_variables btn btn-secondary"
    );
    const microphone = document.querySelector(".modal-footer microphone");
    Object.defineProperty(microphone, "track", { value: audioTrack });
    microphone.dispatchEvent(new Event("track"));
    await waitForNone(".modal");
    expect(receivedAudio.getAudioTracks()).toEqual([audioTrack]);
    expect(audioTrack.readyState).toBe("live");

    const videoTrack = createVideoStream().getVideoTracks()[0];
    const close = dialog.add(CallPermissionDialog, {
        media: "camera",
        suggestAllMedias: false,
        useMicrophone: () => {},
        useCamera: () => {},
    });
    await waitFor(".modal-footer camera:count(1)");
    expect(".modal-footer camera").toHaveClass("btn");
    expect(document.querySelector(".modal-footer camera").parentElement).toHaveClass(
        "o_mail_call_permission_button_variables btn btn-secondary"
    );
    const camera = document.querySelector(".modal-footer camera");
    Object.defineProperty(camera, "track", { value: videoTrack });
    close();
    await waitForNone(".modal");
    expect(videoTrack.readyState).toBe("ended");
    audioTrack.stop();
});

test("native capture starts a call without reopening either device", async () => {
    mockCapabilityElements({ usermedia: true, microphone: true, camera: true });
    const pyEnv = await startServer();
    const channelId = pyEnv["discuss.channel"].create({ name: "General" });
    const streams = mockGetMedia();
    mockPermissionsPrompt();
    await start();
    const rtc = getService("discuss.rtc");
    await openDiscuss(channelId);
    await click("[title='Start Call']");
    await click(".o-discuss-CallActionList button[title='Turn camera on']");
    await waitFor(".modal-footer usermedia:count(1)");
    const audioTrack = (
        await navigator.mediaDevices.getUserMedia({ audio: true })
    ).getAudioTracks()[0];
    const videoTrack = createVideoStream().getVideoTracks()[0];
    const streamCount = streams.length;
    const usermedia = document.querySelector(".modal-footer usermedia");
    Object.defineProperty(usermedia, "stream", {
        value: new MediaStream([audioTrack, videoTrack]),
    });
    rtc.cameraPermission = "granted";
    rtc.microphonePermission = "granted";
    await animationFrame();
    expect(document.querySelector(".modal-footer usermedia")).toBe(usermedia);
    usermedia.dispatchEvent(new Event("stream"));
    await waitFor(".o-discuss-CallActionList button[title='Turn camera off']:count(1)");
    await waitFor(".o-discuss-CallActionList button[title='Mute']:count(1)");
    expect(rtc.micAudioTrack).toBe(audioTrack);
    expect(rtc.cameraTrack).toBe(videoTrack);
    expect(streams).toHaveLength(streamCount);
});

test("denied permissions use native recovery when available", async () => {
    mockCapabilityElements({ camera: true });
    await startServer();
    mockGetMedia();
    mockPermissionsPrompt();
    await start();
    const rtc = getService("discuss.rtc");
    rtc.cameraPermission = "denied";
    rtc.showMediaPermissionDialog("camera");
    await waitFor(".modal-footer camera:count(1)");
    document.querySelector(".modal-footer camera").dispatchEvent(new Event("cancel"));
    await waitForNone(".modal");

    const warnings = [];
    patch(rtc, {
        showMediaUnavailableWarning(media) {
            warnings.push(media);
        },
    });
    rtc.microphonePermission = "denied";
    rtc.showMediaPermissionDialog("microphone");
    expect(warnings).toEqual([{ microphone: true }]);
    await waitForNone(".modal");
});

test("capability element errors show the existing unavailable warning", async () => {
    mockCapabilityElements({ camera: true });
    await startServer();
    mockGetMedia();
    mockPermissionsPrompt();
    await start();
    const warnings = [];
    patch(getService("discuss.rtc"), {
        showMediaUnavailableWarning(media) {
            warnings.push(media);
        },
    });
    getService("dialog").add(CallPermissionDialog, {
        media: "camera",
        suggestAllMedias: false,
        useMicrophone: () => {},
        useCamera: () => {},
    });
    await waitFor(".modal-footer camera:count(1)");
    document.querySelector(".modal-footer camera").dispatchEvent(new Event("error"));
    await waitForNone(".modal");
    expect(warnings).toEqual([{ microphone: false, camera: true }]);
});
