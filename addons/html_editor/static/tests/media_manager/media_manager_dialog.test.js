import { animationFrame, describe, expect, test } from "@odoo/hoot";
import { click, edit, manuallyDispatchProgrammaticEvent, queryOne, waitFor } from "@odoo/hoot-dom";
import { mockDate } from "@odoo/hoot-mock";
import {
    defineModels,
    makeMockServer,
    mockService,
    MockServer,
    onRpc,
    toggleMenuItem,
    toggleSearchBarMenu,
} from "@web/../tests/web_test_helpers";
import { user } from "@web/core/user";
import { getMediaManagertDialogProps } from "@html_editor/backend/media_manager/media_manager_dialog";
import {
    card,
    getCardNames,
    mediaManagerModels,
    openMediaManager,
    PARTNER_MEDIA_NAMES,
    PNG_DATA_URL,
} from "./media_manager_test_helpers";

describe.current.tags("desktop");
defineModels(mediaManagerModels);

const CARD_MENU = ".o-dropdown--kanban-record-menu";

async function clickCard(name) {
    await click(`${card(name)} .o_kanban_image`);
    await animationFrame();
}

async function openCardMenu(name) {
    await click(`${card(name)} .o_dropdown_kanban button`);
    await waitFor(CARD_MENU);
}

async function clickSidePanelFilter(label) {
    await click(`.media-manager-side-panel-filters a:contains(${label})`);
    await animationFrame();
}

/** Type in the tags input of the opened card menu, then pick a suggestion. */
async function addTag(text, suggestion) {
    await click(".o_media_tags_menu input");
    await edit(text, { confirm: false });
    await waitFor(`.o-autocomplete--dropdown-item:contains(${suggestion})`);
    await click(`.o-autocomplete--dropdown-item:contains(${suggestion})`);
    await animationFrame();
}

function getServerAttachment(id) {
    return MockServer.env["ir.attachment"].browse(id)[0];
}

/** Mock the upload route, creating the attachment on the mock server. */
function mockUpload() {
    onRpc("/html_editor/attachment/add_data", async (request) => {
        const { params } = await request.json();
        expect.step(`upload ${params.name} on ${params.res_model},${params.res_id}`);
        const id = MockServer.env["ir.attachment"].create({
            name: params.name,
            mimetype: "image/png",
            type: "binary",
            res_model: params.res_model,
            res_id: params.res_id,
            local_url: PNG_DATA_URL,
        });
        return { id, name: params.name, image_src: PNG_DATA_URL, mimetype: "image/png" };
    });
}

async function uploadFromFileInput(fileName) {
    const fileInput = queryOne(".media-manager-side-panel input.o_file_input");
    Object.defineProperty(fileInput, "files", {
        value: [new File(["x"], fileName, { type: "image/png" })],
    });
    await manuallyDispatchProgrammaticEvent(fileInput, "change");
}

describe("images", () => {
    test("displays the images of the record and the public images", async () => {
        await openMediaManager();
        expect(getCardNames()).toEqual(PARTNER_MEDIA_NAMES);
    });

    test("cards show the tags and the favorite star", async () => {
        await openMediaManager();
        expect(`${card("banner.png")} .o_media_tags .o_tag`).toHaveText("Banner");
        expect(card("banner.png")).not.toHaveClass("o_record_starred");
        expect(`${card("logo.png")} .o_media_tags`).toHaveCount(0);
        expect(card("logo.png")).toHaveClass("o_record_starred");
    });

    test("group the images by tag", async () => {
        await openMediaManager();
        await toggleSearchBarMenu();
        await toggleMenuItem("Tags");
        expect(".o_kanban_group").toHaveCount(2);
        expect(".o_kanban_group:contains(Banner) .o_media_name").toHaveText("banner.png");
    });
});

describe("selection", () => {
    test("single selection: clicking a card selects it and closes the dialog", async () => {
        await openMediaManager({
            multiSelect: false,
            onSelected: (resIds) => expect.step(resIds),
        });
        expect(".o_select_button").toHaveCount(0);
        await clickCard("logo.png");
        expect.verifySteps([[2]]);
        expect(".media-manager-kanban-view").toHaveCount(0);
    });

    test("multi selection: toggle cards, then validate", async () => {
        await openMediaManager({ onSelected: (resIds) => expect.step(resIds) });
        expect(".o_select_button").toHaveAttribute("disabled");

        await clickCard("banner.png");
        await clickCard("logo.png");
        await clickCard("partner.jpg");
        await clickCard("banner.png"); // unselect
        expect.verifySteps([]);

        await click(".o_select_button");
        await animationFrame();
        expect.verifySteps([[2, 3]]);
    });
});

describe("favorites", () => {
    test("star and unstar an image", async () => {
        await openMediaManager();
        await click(`${card("banner.png")} .o_record_box_star`);
        await animationFrame();
        expect(card("banner.png")).toHaveClass("o_record_starred");
        expect(getServerAttachment(1).is_favorite).toBe(true);

        await click(`${card("banner.png")} .o_record_box_star`);
        await animationFrame();
        expect(card("banner.png")).not.toHaveClass("o_record_starred");
        expect(getServerAttachment(1).is_favorite).toBe(false);
    });

    test("starring an image does not select it", async () => {
        await openMediaManager({
            multiSelect: false,
            onSelected: () => expect.step("selected"),
        });
        await click(`${card("banner.png")} .o_record_box_star`);
        await animationFrame();
        expect.verifySteps([]);
    });
});

describe("side panel filters", () => {
    test("filter the favorites, then reset", async () => {
        await openMediaManager();
        await clickSidePanelFilter("favorites");
        expect(getCardNames()).toEqual(["logo.png"]);

        await clickSidePanelFilter("Reset Filters");
        expect(getCardNames()).toEqual(PARTNER_MEDIA_NAMES);
    });

    test("filters are applied on top of the dialog domain", async () => {
        // banner.webp is a favorite, but an optimized copy: hidden by the domain
        await makeMockServer();
        MockServer.env["ir.attachment"].write([7], { is_favorite: true });
        await openMediaManager();
        await clickSidePanelFilter("favorites");
        expect(getCardNames()).toEqual(["logo.png"]);
    });

    test("the other filters: uploaded last week, uploaded by me", () => {
        mockDate("2026-11-17 10:00:00");
        const [lastWeek, mine] = getMediaManagertDialogProps({}).filters;
        expect(lastWeek.domain).toEqual([["create_date", ">", "2026-11-10 10:00:00"]]);
        expect(mine.domain).toEqual([["create_uid", "=", user.userId]]);
    });
});

describe("card menu", () => {
    test("opening the menu does not select the image", async () => {
        await openMediaManager({
            multiSelect: false,
            onSelected: () => expect.step("selected"),
        });
        await openCardMenu("banner.png");
        expect.verifySteps([]);
    });

    test("preview an image", async () => {
        mockService("fileViewer", () => () => ({
            open: (file) => expect.step(file.defaultSource),
            close: () => {},
        }));
        await openMediaManager();
        await openCardMenu("logo.png");
        await click(`${CARD_MENU} .dropdown-item:contains(Preview image)`);
        await animationFrame();
        expect.verifySteps(["/web/image/2"]);
    });

    test("the preview is only available for images", async () => {
        mockService("fileViewer", () => () => ({
            open: () => expect.step("open"),
            close: () => {},
        }));
        await makeMockServer();
        MockServer.env["ir.attachment"].write([1], { mimetype: "application/pdf" });
        await openMediaManager({ domain: [["id", "=", 1]] });
        await openCardMenu("banner.png");
        await click(`${CARD_MENU} .dropdown-item:contains(Preview image)`);
        await animationFrame();
        expect.verifySteps([]);
    });

    test("delete an image, after confirmation", async () => {
        await openMediaManager();
        await openCardMenu("banner.png");
        await click(`${CARD_MENU} .dropdown-item:contains(Delete)`);
        await animationFrame();
        expect(getCardNames()).toEqual(PARTNER_MEDIA_NAMES);

        await click(".modal-footer button:contains(Delete)");
        await animationFrame();
        expect(getCardNames()).toEqual(["logo.png", "partner.jpg"]);
    });
});

describe("tags", () => {
    // The kanban view is readonly, but the tags of the card menu are editable
    // and saved right away.

    test("add an existing tag", async () => {
        await openMediaManager();
        await openCardMenu("logo.png");
        await addTag("Log", "Logo");
        expect(getServerAttachment(2).media_tag_ids).toEqual([2]);
        expect(`${card("logo.png")} .o_media_tags .o_tag`).toHaveText("Logo");
    });

    test("create a tag (quick create only)", async () => {
        await openMediaManager();
        await openCardMenu("logo.png");
        await click(".o_media_tags_menu input");
        await edit("Hero", { confirm: false });
        await waitFor(".o-autocomplete--dropdown-item:contains(Create)");
        expect(".o-autocomplete--dropdown-item:contains(Create and edit)").toHaveCount(0);

        await click(".o-autocomplete--dropdown-item:contains(Create)");
        await animationFrame();
        const [hero] = MockServer.env["html_editor.media.tag"].search_read([["name", "=", "Hero"]]);
        expect(getServerAttachment(2).media_tag_ids).toEqual([hero.id]);
    });

    test("remove a tag", async () => {
        await openMediaManager();
        await openCardMenu("banner.png");
        await click(".o_media_tags_menu .o_tag .o_delete");
        await animationFrame();
        expect(getServerAttachment(1).media_tag_ids).toEqual([]);
        expect(`${card("banner.png")} .o_media_tags`).toHaveCount(0);
    });

    test("saving does not reload the card: the input keeps the focus while typing", async () => {
        await openMediaManager();
        await openCardMenu("logo.png");
        await click(".o_media_tags_menu input");
        await edit("B", { confirm: false });
        await animationFrame();
        await edit("Ba", { confirm: false });
        await animationFrame();
        expect(".o_media_tags_menu input").toBeFocused();
        expect(".o_media_tags_menu input").toHaveValue("Ba");
    });
});

describe("upload", () => {
    test("upload an image, attached to the record", async () => {
        mockUpload();
        await openMediaManager();
        await uploadFromFileInput("uploaded.png");
        await expect.waitForSteps(["upload uploaded.png on res.partner,1"]);
        await waitFor(card("uploaded.png"));
    });

    test("upload an image for a record that is not saved", async () => {
        mockUpload();
        await openMediaManager({}, { resModel: "res.partner" });
        await uploadFromFileInput("uploaded.png");
        await expect.waitForSteps(["upload uploaded.png on res.partner,-1"]);
    });

    test("drop files on the view: only the images are uploaded", async () => {
        mockUpload();
        await openMediaManager();
        await manuallyDispatchProgrammaticEvent(queryOne(".o_kanban_renderer"), "dragenter");
        await animationFrame();
        expect(".media-manager-drop-zone").toHaveClass("active");

        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(new File(["x"], "dropped.png", { type: "image/png" }));
        dataTransfer.items.add(new File(["x"], "dropped.pdf", { type: "application/pdf" }));
        await manuallyDispatchProgrammaticEvent(queryOne(".media-manager-drop-zone"), "drop", {
            dataTransfer,
        });
        await expect.waitForSteps(["upload dropped.png on res.partner,1"]);
        expect(".media-manager-drop-zone").not.toHaveClass("active");
    });

    test("import from an invalid url", async () => {
        onRpc("/html_editor/attachment/add_url", () => expect.step("add_url"));
        await openMediaManager();
        await click(".btn-import-url");
        await animationFrame();
        expect(".media-manager-side-panel input[name=url]").toBeFocused();

        queryOne(".media-manager-side-panel input[name=url]").value = "not_an_url";
        await click(".btn-import-url");
        await waitFor(".o_notification:contains(The provided URL is not valid.)");
        expect.verifySteps([]);
    });
});
