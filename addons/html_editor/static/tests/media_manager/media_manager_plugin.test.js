import { animationFrame, describe, expect, test } from "@odoo/hoot";
import { click, waitFor } from "@odoo/hoot-dom";
import { defineModels, onRpc, patchWithCleanup } from "@web/../tests/web_test_helpers";
import { MediaManagerPlugin } from "@html_editor/backend/media_manager/media_manager_plugin";
import { MediaPlugin } from "@html_editor/main/media/media_plugin";
import { MAIN_PLUGINS } from "@html_editor/plugin_sets";
import { setupEditor } from "../_helpers/editor";
import { execCommand } from "../_helpers/userCommands";
import {
    card,
    getCardNames,
    mediaManagerModels,
    PARTNER_MEDIA_NAMES,
    PNG_DATA_URL,
} from "./media_manager_test_helpers";

describe.current.tags("desktop");
defineModels(mediaManagerModels);

/** An editor on partner 1, opening the media manager on the media command. */
function setupMediaManagerEditor(content) {
    return setupEditor(content, {
        config: {
            includePlugins: [MediaManagerPlugin],
            excludePlugins: [MediaPlugin],
            getRecordInfo: () => ({ resModel: "res.partner", resId: 1 }),
        },
    });
}

async function openFromMediaCommand(editor) {
    execCommand(editor, "insertMedia");
    await waitFor(".media-manager-kanban-view");
    await animationFrame();
}

async function clickCard(name) {
    await click(`${card(name)} .o_kanban_image`);
    await animationFrame();
}

test("the media manager replaces the media dialog in the backend editors", () => {
    expect(MAIN_PLUGINS).toInclude(MediaManagerPlugin);
    expect(MAIN_PLUGINS).not.toInclude(MediaPlugin);
});

test("the media command opens the media manager on the images of the edited record", async () => {
    const { editor } = await setupMediaManagerEditor("<p>[]<br></p>");
    await openFromMediaCommand(editor);
    expect(".o_select_media_dialog").toHaveCount(0);
    expect(getCardNames()).toEqual(PARTNER_MEDIA_NAMES);
});

test("the old media dialog remains available (temporary)", async () => {
    onRpc("ir.attachment", "search_read", () => []);
    const { editor } = await setupMediaManagerEditor("<p>[]<br></p>");
    execCommand(editor, "insertMediaOLD");
    await waitFor(".o_select_media_dialog");
    expect(".media-manager-kanban-view").toHaveCount(0);
});

test("getDomain can be overridden to choose the displayed images", async () => {
    patchWithCleanup(MediaManagerPlugin.prototype, {
        getDomain: () => [["id", "=", 3]],
    });
    const { editor } = await setupMediaManagerEditor("<p>[]<br></p>");
    await openFromMediaCommand(editor);
    expect(getCardNames()).toEqual(["partner.jpg"]);
});

test("insert the selected images", async () => {
    const { el, editor } = await setupMediaManagerEditor("<p>[]<br></p>");
    await openFromMediaCommand(editor);
    await clickCard("banner.png");
    await clickCard("logo.png");
    await click(".o_select_button");
    await waitFor("img[alt='logo.png']", { root: el });

    const images = [...el.querySelectorAll("img")];
    expect(images.map((img) => img.alt)).toEqual(["banner.png", "logo.png"]);
    expect(images[0]).toHaveAttribute("src", PNG_DATA_URL);
});

test("replace an image: a single image is selected", async () => {
    const { el, plugins } = await setupMediaManagerEditor(
        `<p>[]<img class="img-fluid" src="${PNG_DATA_URL}" alt="old"></p>`
    );
    plugins.get("media").openMediaDialog({ node: el.querySelector("img") });
    await waitFor(".media-manager-kanban-view");
    await animationFrame();
    expect(".o_select_button").toHaveCount(0, { message: "single selection" });

    await clickCard("logo.png");
    await waitFor("img[alt='logo.png']", { root: el });
    expect(el.querySelectorAll("img")).toHaveLength(1);
});
