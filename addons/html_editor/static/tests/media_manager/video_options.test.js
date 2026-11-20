import { describe, expect, hover, queryOne, test, waitFor, waitForNone } from "@odoo/hoot";
import { contains } from "@web/../tests/web_test_helpers";
import {
    defineMediaManagerModels,
    openMediaManagerFromPowerbox,
    openPartnerForm,
    PARTNER_WITH_EMBEDDED_VIDEO_ID,
    PARTNER_WITH_VIDEO_ID,
    videoCard,
    YOUTUBE_URL,
} from "./media_manager_test_helpers";

describe.current.tags("desktop");
defineMediaManagerModels();

const NOTES = "[name='comment'] .odoo-editor-editable";
const DIALOG = ".modal .o_video_options_dialog";
const EMBEDDED_VIDEO = `${NOTES} [data-embedded='video']`;

/** @param {string} id */
function option(id) {
    return `${DIALOG} [data-option='${id}']`;
}

/** @param {string} id */
async function toggleOption(id) {
    await contains(`${option(id)} input[type=checkbox]`).click();
}

/** The props of the embedded video of the notes (the html field has the embedded components). */
function getEmbeddedVideoProps() {
    return JSON.parse(queryOne(EMBEDDED_VIDEO).dataset.embeddedProps);
}

/** Choose the YouTube video in the media manager: its options are displayed. */
async function chooseYoutubeVideo() {
    const { editor } = await openPartnerForm();
    await openMediaManagerFromPowerbox(editor);
    await contains(`${videoCard("YouTube - dQw4w9WgXcQ")} .o_kanban_image`).click();
    await contains(".modal .o_select_button:enabled").click();
    await waitFor(DIALOG);
}

describe("insert a video", () => {
    test("the options of the platform are displayed with a preview", async () => {
        await chooseYoutubeVideo();
        expect(`${DIALOG} .modal-title`).toHaveText("YouTube");
        expect(
            [...document.querySelectorAll(`${DIALOG} [data-option]`)].map((el) => el.dataset.option)
        ).toEqual(["autoplay", "loop", "hideControls", "hideFullscreen", "isVertical", "startFrom"]);
        // (hoot empties the src of the external iframes)
        expect(`${DIALOG} .o_video_options_preview iframe`).toHaveCount(1);
    });

    test("insert it with the chosen options", async () => {
        await chooseYoutubeVideo();
        await toggleOption("autoplay");
        await contains(`${DIALOG} .modal-footer .btn-primary:contains(Insert)`).click();
        await waitFor(EMBEDDED_VIDEO);
        expect(".modal").toHaveCount(0);
        expect(getEmbeddedVideoProps()).toMatchObject({
            baseUrl: YOUTUBE_URL,
            platform: "youtube",
            videoId: "dQw4w9WgXcQ",
            params: { autoplay: true, muted: true, loop: false },
        });
    });

    test("hiding the controls hides the fullscreen option", async () => {
        await chooseYoutubeVideo();
        await toggleOption("hideControls");
        expect(option("hideFullscreen")).toHaveCount(0);
        await toggleOption("hideControls");
        expect(option("hideFullscreen")).toHaveCount(1);
    });

    test("set the start time", async () => {
        await chooseYoutubeVideo();
        expect(`${option("startFrom")} input[type=text]`).toHaveCount(0);
        await toggleOption("startFrom");
        expect(`${option("startFrom")} input[type=text]`).toHaveValue("0:00");
        await contains(`${option("startFrom")} input[type=text]`).edit("1:30");
        await contains(`${DIALOG} .modal-footer .btn-primary`).click();
        await waitFor(EMBEDDED_VIDEO);
        expect(getEmbeddedVideoProps().params.startFrom).toBe(90);
    });

    test("discarding the options inserts nothing", async () => {
        await chooseYoutubeVideo();
        await contains(`${DIALOG} .modal-footer .btn-secondary:contains(Discard)`).click();
        await waitForNone(".modal");
        expect(EMBEDDED_VIDEO).toHaveCount(0);
    });
});

describe("edit a video", () => {
    test("an embedded video, from its Replace button", async () => {
        await openPartnerForm({ resId: PARTNER_WITH_EMBEDDED_VIDEO_ID });
        await waitFor(`${EMBEDDED_VIDEO} iframe`);
        await hover(EMBEDDED_VIDEO);
        await contains("button.video-options-button").click();
        await contains(".video-replace-button").click();
        await waitFor(DIALOG);
        // the current options
        expect(`${option("autoplay")} input[type=checkbox]`).toBeChecked();
        expect(`${option("loop")} input[type=checkbox]`).not.toBeChecked();

        await toggleOption("autoplay");
        await toggleOption("loop");
        await contains(`${DIALOG} .modal-footer .btn-primary:contains(Save)`).click();
        await waitForNone(".modal");
        expect(EMBEDDED_VIDEO).toHaveCount(1);
        expect(getEmbeddedVideoProps().params).toMatchObject({ autoplay: false, loop: true });
    });

    test("a video of an editor without the embedded components", async () => {
        const { editor } = await openPartnerForm({ resId: PARTNER_WITH_VIDEO_ID });
        const videoEl = queryOne(`${NOTES} .media_iframe_video`);
        // e.g. the website builder, when double-clicking a video
        editor.shared.media.openMediaDialog({ node: videoEl });
        await waitFor(DIALOG);
        expect(".media-manager-kanban-view").toHaveCount(0);
        // the options are read from the video
        expect(`${option("loop")} input[type=checkbox]`).toBeChecked();

        await toggleOption("autoplay");
        await contains(`${DIALOG} .modal-footer .btn-primary:contains(Save)`).click();
        await waitForNone(".modal");
        // replaced by the video of the editor (here, an embedded one)
        expect(`${NOTES} .media_iframe_video`).toHaveCount(0);
        expect(getEmbeddedVideoProps().params).toMatchObject({ autoplay: true, loop: true });
    });
});
