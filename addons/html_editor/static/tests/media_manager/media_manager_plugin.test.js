import { describe, expect, press, queryAll, test, waitFor, waitForNone } from "@odoo/hoot";
import { clickSave, contains, onRpc } from "@web/../tests/web_test_helpers";
import { MediaManagerPlugin } from "@html_editor/backend/media_manager/media_manager_plugin";
import { MediaPlugin } from "@html_editor/main/media/media_plugin";
import { MAIN_PLUGINS } from "@html_editor/plugin_sets";
import { setSelection } from "../_helpers/selection";
import { expectElementCount } from "../_helpers/ui_expectations";
import { insertText } from "../_helpers/user_actions";
import {
    card,
    defineMediaManagerModels,
    EDITED_PARTNER_ID,
    getCardNames,
    openMediaManagerFromImageToolbar,
    openMediaManagerFromPowerbox,
    openPartnerForm,
    OTHER_PARTNER_ID,
    PARTNER_IMAGES,
    PARTNER_WITH_IMAGE_ID,
    PNG_DATA_URL,
} from "./media_manager_test_helpers";

describe.current.tags("desktop");
defineMediaManagerModels();

const NOTES = "[name='comment'] .odoo-editor-editable";

async function clickCard(name) {
    await contains(`${card(name)} .o_kanban_image`).click();
}

test("the media manager replaces the media dialog in the backend editors", () => {
    expect(MAIN_PLUGINS).toInclude(MediaManagerPlugin);
    expect(MAIN_PLUGINS).not.toInclude(MediaPlugin);
});

test("the media command opens the media manager on the images of the edited record", async () => {
    const { editor } = await openPartnerForm();
    await openMediaManagerFromPowerbox(editor);
    expect(".modal-title").toHaveText("Select a media");
    expect(".o_select_media_dialog").toHaveCount(0);
    expect(getCardNames()).toEqual(PARTNER_IMAGES);
});

test("a new record only shows the public images", async () => {
    const { editor } = await openPartnerForm({ resId: false });
    await openMediaManagerFromPowerbox(editor);
    expect(getCardNames()).toEqual(["banner.png", "logo.png", "link.png"]);
});

test("the media manager follows the record displayed in the form", async () => {
    const form = await openPartnerForm({ resIds: [EDITED_PARTNER_ID, OTHER_PARTNER_ID] });
    await contains(".o_pager_next").click();
    expect(`${NOTES} p`).toHaveText("Other notes");
    await openMediaManagerFromPowerbox(form.editor);
    expect(getCardNames()).toEqual(["banner.png", "logo.png", "other_partner.png", "link.png"]);
});

test("insert the selected images in the notes, then save them", async () => {
    onRpc("res.partner", "web_save", ({ args }) => {
        expect.step("save");
        expect(args[0]).toEqual([EDITED_PARTNER_ID]);
        expect(args[1].comment).toInclude(`alt="banner.png"`);
        expect(args[1].comment).toInclude(`alt="logo.png"`);
    });
    const { editor } = await openPartnerForm();
    await openMediaManagerFromPowerbox(editor);
    expect(".modal .o_select_button").toHaveAttribute("disabled");

    await clickCard("banner.png");
    await clickCard("logo.png");
    await clickCard("partner.jpg");
    await clickCard("partner.jpg"); // unselect
    await contains(".modal .o_select_button").click();
    await waitFor(`${NOTES} img[alt='logo.png']`);
    expect(".modal").toHaveCount(0);
    expect(queryAll(`${NOTES} img`).map((img) => img.alt)).toEqual(["banner.png", "logo.png"]);
    expect(`${NOTES} img[alt='banner.png']`).toHaveAttribute("src", PNG_DATA_URL);

    await clickSave();
    expect.verifySteps(["save"]);
});

test("replace an image from the toolbar: clicking an image replaces it", async () => {
    await openPartnerForm({ resId: PARTNER_WITH_IMAGE_ID });
    await openMediaManagerFromImageToolbar("img[alt='old']");
    expect(".modal .o_select_button").toHaveCount(0, { message: "a single image is selected" });

    await clickCard("logo.png");
    await waitForNone(".modal");
    expect(queryAll(`${NOTES} img`).map((img) => img.alt)).toEqual(["logo.png"]);
});

test("closing the media manager inserts nothing", async () => {
    const { editor } = await openPartnerForm();
    await openMediaManagerFromPowerbox(editor);
    await clickCard("banner.png");
    await contains(".modal .btn-close").click();
    expect(".modal").toHaveCount(0);
    expect(`${NOTES} img`).toHaveCount(0);
});

test("the old media dialog remains available (temporary)", async () => {
    onRpc("ir.attachment", "search_read", () => []);
    const { editor } = await openPartnerForm();
    setSelection({ anchorNode: editor.editable.querySelector("p"), anchorOffset: 0 });
    await insertText(editor, "/media");
    await expectElementCount(".o-we-powerbox", 1);
    await contains(".o-we-powerbox .o-we-command-name:contains(/^OLD Media$/)").click();
    await waitFor(".o_select_media_dialog");
    expect(".media-manager-kanban-view").toHaveCount(0);
    await press("Escape");
});
