import {
    createVideoStream,
    defineMailModels,
    mockGetMedia,
    start,
} from "@mail/../tests/mail_test_helpers";
import { describe, expect, test, waitFor } from "@odoo/hoot";
import { mountWithCleanup } from "@web/../tests/web_test_helpers";

import { CallPreview } from "@mail/discuss/call/common/call_preview";

describe.current.tags("desktop");
defineMailModels();

test("enabling the camera preview reports the camera state even before the video element mounts", async () => {
    mockGetMedia();
    await start();
    const settings = [];
    await mountWithCleanup(CallPreview, {
        props: {
            activateCamera: 1,
            onSettingsChanged: (s) => settings.push(s),
        },
    });
    // The <video> element only renders once the stream is set, so the camera is enabled before the
    // element exists. The parent must still be told the camera is on, otherwise a guest whose camera
    // is on in the preview joins the call with the camera off.
    await waitFor("video:count(1)");
    expect(settings).toEqual([{ camera: true }]);
});

test("the preview uses media captured by a capability element", async () => {
    const streams = mockGetMedia();
    await start();
    const preview = await mountWithCleanup(CallPreview);
    const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const videoStream = createVideoStream();
    const streamCount = streams.length;
    await preview.enableMicrophone(audioStream);
    await preview.enableCamera(videoStream);
    await waitFor("video:count(1)");
    expect(document.querySelector(".o-mail-CallPreview audio").srcObject).toBe(audioStream);
    expect(document.querySelector(".o-mail-CallPreview video").srcObject).toBe(videoStream);
    expect(streams).toHaveLength(streamCount);
});
