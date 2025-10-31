import { describe, test, expect } from "@odoo/hoot";
import {
    click,
    contains,
    defineMailModels,
    openFormView,
    start,
    startServer,
} from "@mail/../tests/mail_test_helpers";
import {
    defineModels,
    fields,
    models,
    onRpc,
    patchWithCleanup,
} from "@web/../tests/web_test_helpers";
import { CallDebrief } from "@mail/views/fields/call_debrief/call_debrief";

describe.current.tags("desktop");

class CallDebriefTest extends models.Model {
    _name = "call.record";
    name = fields.Char();
    start_date = fields.Datetime();
    end_date = fields.Datetime();
    transcript = fields.Text();
    media_id = fields.Many2one({ relation: "ir.attachment" });
}

defineMailModels();
defineModels([CallDebriefTest]);

let pyEnv, callId, callAudioRecordingId;

const FORM_ARCH = `
    <form>
        <field name="media_id" widget="call_debrief" options="{'callStartDateField': 'start_date', 'callEndDateField': 'end_date', 'transcriptField': 'transcript'}"/>
        <field name="start_date" invisible="1"/>
        <field name="end_date" invisible="1"/>
        <field name="transcript" invisible="1"/>
    </form>
`;

// OGG container used here exceptionally, as its base64 minimal version is smaller than the webm version
const AUDIO_100ms_SILENCE_OGG_OPUS_BASE64 = `T2dnUwACAAAAAAAAAAD0OSqJAAAAAGCMs10BE09wdXNIZWFkAQE4AYC7AAAAAABPZ2dTAAAAAAAA
AAAAAPQ5KokBAAAAF70VnQE/T3B1c1RhZ3MNAAAATGF2ZjU4Ljc2LjEwMAEAAAAeAAAAZW5jb2Rl
cj1MYXZjNTguMTM0LjEwMCBsaWJvcHVzT2dnUwAE+BMAAAAAAAD0OSqJAgAAAI2SBUQCDw4YAvmO
yOHPlL6XHvqCbrAYAissw4zYC9cFtr0Q0g==
`;

function b64ToBlob(b64) {
    const binary = atob(b64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: "audio/ogg" });
}

async function setupCallData(transcript, mimetype = "audio/ogg") {
    pyEnv = await startServer();
    const start = "2023-01-01 10:00:00.000";
    const end = "2023-01-01 10:00:00.100";
    callId = pyEnv["call.record"].create({
        name: "Test Call",
        start_date: start,
        end_date: end,
        transcript: transcript,
    });
    callAudioRecordingId = pyEnv["ir.attachment"].create({
        name: "recording.ogg",
        mimetype: mimetype,
        res_model: "call.record",
        res_id: callId,
    });
    pyEnv["call.record"].write([callId], { media_id: callAudioRecordingId });

    onRpc("ir.attachment", "read", (args) => {
        if (args.args[0][0] === callAudioRecordingId) {
            return [{ id: callAudioRecordingId, mimetype: "audio/ogg" }];
        }
    });

    const blobUrl = URL.createObjectURL(b64ToBlob(AUDIO_100ms_SILENCE_OGG_OPUS_BASE64));
    patchWithCleanup(CallDebrief.prototype, {
        _updateState(mediaObj, transcriptText) {
            if (mediaObj && mediaObj.type === "audio") {
                mediaObj.mediaUrl = blobUrl;
            }
            super._updateState(mediaObj, transcriptText);
        },
    });
}

test("Call Debrief: Clicking transcripts line performs seek", async () => {
    const transcript = [
        "WEBVTT",
        "",
        "00:00:00.010 --> 00:00:00.040",
        "Hello, this is a test.",
        "",
        "00:00:00.050 --> 00:00:00.080",
        "We are testing the debrief widget.",
    ].join("\n");
    await setupCallData(transcript);
    await start();
    await openFormView("call.record", callId, { arch: FORM_ARCH });

    await contains("audio");

    // Click the first line (starts at 0.01s)
    await click(".o-CallDebrief-transcript-text:first");

    // The widget should highlight the line
    await contains(".o-CallDebrief-transcript-highlight:contains('Hello, this is a test.')");

    // The media player should have seeked to 0.01s
    expect(document.querySelector("audio").currentTime).toBe(0.01);
});

test("Call Debrief: Playing media moves the playhead", async () => {
    const transcript = [
        "WEBVTT",
        "",
        "00:00:00.010 --> 00:00:00.040",
        "First segment.",
        "",
        "00:00:00.050 --> 00:00:00.080",
        "Second segment.",
    ].join("\n");
    await setupCallData(transcript);
    await start();
    await openFormView("call.record", callId, { arch: FORM_ARCH });

    const audio = document.querySelector("audio");

    // Simulate audio playing
    audio.currentTime = 0.02;
    audio.dispatchEvent(new Event("timeupdate"));

    // First line should be highlighted
    await contains(".o-CallDebrief-transcript-highlight:contains('First segment.')");

    // Playhead should have moved (0.02 / 0.1 = 20%)
    await contains(".o-CallDebriefTimeline-playhead", {
        style: {
            left: "20%",
        },
    });

    // Manually trigger timeupdate to 0.06s
    audio.currentTime = 0.06;
    audio.dispatchEvent(new Event("timeupdate"));

    // Second line should be highlighted
    await contains(".o-CallDebrief-transcript-highlight:contains('Second segment.')");

    // Playhead should have moved (0.06 / 0.1 = 60%)
    await contains(".o-CallDebriefTimeline-playhead", {
        style: {
            left: "60%",
        },
    });
});

test("Call Debrief: Negative callDuration renders error", async () => {
    pyEnv = await startServer();
    const start_date = "2023-01-01 10:00:00.100";
    const end_date = "2023-01-01 10:00:00.000";
    callId = pyEnv["call.record"].create({
        name: "Test Call",
        start_date: start_date,
        end_date: end_date,
    });
    await start();
    await openFormView("call.record", callId, { arch: FORM_ARCH });

    await contains(".text-danger");
    await contains("audio", { count: 0 });
});

test("Call Debrief: Switching records resets play state", async () => {
    const transcript = "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello";
    await setupCallData(transcript);

    const callId2 = pyEnv["call.record"].create({
        name: "Test Call 2",
        start_date: "2023-01-01 11:00:00.000",
        end_date: "2023-01-01 11:00:00.100",
        transcript: transcript,
    });
    const attachmentId2 = pyEnv["ir.attachment"].create({
        name: "recording2.ogg",
        mimetype: "audio/ogg",
        res_model: "call.record",
        res_id: callId2,
    });
    pyEnv["call.record"].write([callId2], { media_id: attachmentId2 });

    await start();
    await openFormView("call.record", callId, {
        arch: FORM_ARCH,
        resIds: [callId, callId2],
    });

    await contains("audio");

    // Start playing
    await click("button[title='Play/Pause (k, space)']");
    // Verify playing state (icon changes from play to pause)
    await contains(".fa-pause");

    // Switch to next record    await click(".o_pager_next");

    // Wait for the second record to load (audio element should be present)
    await contains("audio");

    // Verify play state is reset (icon should be play)
    await contains(".fa-play");
    await contains(".fa-pause", { count: 0 });
});
