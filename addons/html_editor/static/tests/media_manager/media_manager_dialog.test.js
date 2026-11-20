import {
    animationFrame,
    beforeEach,
    click,
    describe,
    edit,
    expect,
    hover,
    manuallyDispatchProgrammaticEvent,
    queryOne,
    setInputFiles,
    test,
    waitFor,
} from "@odoo/hoot";
import { mockDate } from "@odoo/hoot-mock";
import {
    contains,
    editSearch,
    MockServer,
    onRpc,
    toggleMenuItem,
    toggleSearchBarMenu,
    validateSearch,
} from "@web/../tests/web_test_helpers";
import {
    card,
    defineMediaManagerModels,
    EDITED_PARTNER_ID,
    getCardNames,
    openMediaManagerFromPowerbox,
    openPartnerForm,
    PARTNER_IMAGES,
    PNG_DATA_URL,
    TAGS,
    YOUTUBE_URL,
} from "./media_manager_test_helpers";

describe.current.tags("desktop");
defineMediaManagerModels();

const CARD_MENU = ".o-dropdown--kanban-record-menu";
const SIDE_PANEL = ".modal .media-manager-side-panel";

/** The media manager, inserting media in the notes of the edited partner. */
async function openMediaManager({ resId } = {}) {
    const { editor } = await openPartnerForm({ resId });
    await openMediaManagerFromPowerbox(editor);
}

async function openCardMenu(name) {
    await contains(`${card(name)} .o_dropdown_kanban button`).click();
    await waitFor(CARD_MENU);
}

/** The star is displayed when hovering the card. */
async function clickStar(name) {
    await hover(card(name));
    await click(`${card(name)} .o_record_box_star`);
    await animationFrame();
}

async function clickSidePanelFilter(label) {
    await contains(`${SIDE_PANEL} .media-manager-side-panel-filters a:contains(${label})`).click();
    await animationFrame();
}

/** Type in the tags input of the opened card menu, then pick a suggestion. */
async function addTag(text, suggestion) {
    await contains(`${CARD_MENU} .o_media_tags_menu input`).click();
    await edit(text, { confirm: false });
    await contains(`.o-autocomplete--dropdown-item:contains(${suggestion})`).click();
}

function getServerAttachment(id) {
    return MockServer.env["ir.attachment"].browse(id)[0];
}

/** The upload route of the editor, creating the attachment on the server. */
function mockUploadRoute() {
    onRpc("/html_editor/attachment/add_data", async (request) => {
        const { params } = await request.json();
        expect.step(`upload ${params.name} on ${params.res_model},${params.res_id}`);
        const id = MockServer.env["ir.attachment"].create({
            name: params.name,
            mimetype: "image/png",
            type: "binary",
            res_model: params.res_model,
            // the server keeps the -1 of a new record, the mock server only
            // accepts the ids of existing records
            res_id: params.res_id > 0 ? params.res_id : false,
            local_url: PNG_DATA_URL,
            image_src: PNG_DATA_URL,
        });
        return MockServer.env["ir.attachment"].read([id], ["name", "mimetype", "image_src"])[0];
    });
}

beforeEach(() => {
    mockDate("2026-11-17 10:00:00");
});

describe("images", () => {
    test("cards show the tags and the favorite star", async () => {
        await openMediaManager();
        expect(`${card("banner.png")} .o_media_tags .o_tag`).toHaveText("Banner");
        expect(card("banner.png")).not.toHaveClass("o_record_starred");
        expect(`${card("logo.png")} .o_media_tags`).toHaveCount(0);
        expect(card("logo.png")).toHaveClass("o_record_starred");
    });

    test("search the images by name", async () => {
        await openMediaManager();
        await editSearch("logo");
        await validateSearch();
        expect(getCardNames()).toEqual(["logo.png"]);
    });

    test("group the images by tag", async () => {
        await openMediaManager();
        await toggleSearchBarMenu();
        await toggleMenuItem("Tags");
        expect(".modal .o_kanban_group").toHaveCount(2);
        expect(".modal .o_kanban_group:contains(Banner) img[alt='banner.png']").toHaveCount(1);
    });
});

describe("favorites", () => {
    test("star and unstar an image", async () => {
        await openMediaManager();
        await clickStar("banner.png");
        expect(card("banner.png")).toHaveClass("o_record_starred");
        expect(getServerAttachment(1).is_favorite).toBe(true);

        await clickStar("banner.png");
        expect(card("banner.png")).not.toHaveClass("o_record_starred");
        expect(getServerAttachment(1).is_favorite).toBe(false);
    });

    test("starring an image does not select it", async () => {
        await openMediaManager();
        await clickStar("banner.png");
        expect(".modal .o_select_button").toHaveAttribute("disabled");
    });
});

describe("side panel filters", () => {
    test("filter the favorites, then reset", async () => {
        await openMediaManager();
        await clickSidePanelFilter("favorites");
        // logo.webp is a favorite too, but an optimized copy: never displayed
        expect(getCardNames()).toEqual(["logo.png"]);

        await clickSidePanelFilter("Reset Filters");
        expect(getCardNames()).toEqual(PARTNER_IMAGES);
    });

    test("the images uploaded last week", async () => {
        await openMediaManager();
        await clickSidePanelFilter("uploaded last week");
        expect(getCardNames()).toEqual(["logo.png", "partner.jpg", "link.png"]);
    });

    test("the images uploaded by me", async () => {
        await openMediaManager();
        await clickSidePanelFilter("uploaded by me");
        expect(getCardNames()).toEqual(["banner.png", "logo.png", "link.png"]);
    });
});

describe("card menu", () => {
    test("opening the menu does not select the image", async () => {
        await openMediaManager();
        await openCardMenu("banner.png");
        expect(".modal .o_select_button").toHaveAttribute("disabled");
    });

    test("preview an image", async () => {
        await openMediaManager();
        await openCardMenu("logo.png");
        await contains(`${CARD_MENU} .dropdown-item:contains(Preview image)`).click();
        await waitFor(".o-FileViewer");
        expect(".o-FileViewer-header").toHaveText(/logo\.png/);
        expect(".o-FileViewer img").toHaveCount(1);
    });

    test("delete an image, after confirmation", async () => {
        await openMediaManager();
        await openCardMenu("banner.png");
        await contains(`${CARD_MENU} .dropdown-item:contains(Delete)`).click();
        expect(getCardNames()).toEqual(PARTNER_IMAGES);

        await contains(".modal-footer button:contains(Delete)").click();
        expect(getCardNames()).toEqual(["logo.png", "partner.jpg", "link.png"]);
        expect(MockServer.env["ir.attachment"].search([["id", "=", 1]])).toEqual([]);
    });
});

describe("tags", () => {
    // The kanban view is readonly, but the tags of the card menu are editable
    // and saved right away.

    test("add an existing tag", async () => {
        await openMediaManager();
        await openCardMenu("logo.png");
        await addTag("Log", "Logo");
        expect(getServerAttachment(2).media_tag_ids).toEqual([TAGS.logo]);
        expect(`${card("logo.png")} .o_media_tags .o_tag`).toHaveText("Logo");
    });

    test("create a tag (quick create only)", async () => {
        await openMediaManager();
        await openCardMenu("logo.png");
        await contains(`${CARD_MENU} .o_media_tags_menu input`).click();
        await edit("Hero", { confirm: false });
        await waitFor(".o-autocomplete--dropdown-item:contains(Create)");
        expect(".o-autocomplete--dropdown-item:contains(Create and edit)").toHaveCount(0);

        await contains(".o-autocomplete--dropdown-item:contains(Create)").click();
        const [hero] = MockServer.env["html_editor.media.tag"].search([["name", "=", "Hero"]]);
        expect(getServerAttachment(2).media_tag_ids).toEqual([hero]);
        await waitFor(`${card("logo.png")} .o_media_tags .o_tag:contains(Hero)`);
    });

    test("remove a tag", async () => {
        await openMediaManager();
        await openCardMenu("banner.png");
        await contains(`${CARD_MENU} .o_media_tags_menu .o_tag .o_delete`).click();
        expect(getServerAttachment(1).media_tag_ids).toEqual([]);
        expect(`${card("banner.png")} .o_media_tags`).toHaveCount(0);
    });

    test("saving does not reload the card: the input keeps the focus while typing", async () => {
        await openMediaManager();
        await openCardMenu("logo.png");
        await contains(`${CARD_MENU} .o_media_tags_menu input`).click();
        await edit("B", { confirm: false });
        await animationFrame();
        await edit("Ba", { confirm: false });
        await animationFrame();
        expect(`${CARD_MENU} .o_media_tags_menu input`).toBeFocused();
        expect(`${CARD_MENU} .o_media_tags_menu input`).toHaveValue("Ba");
    });
});

describe("upload", () => {
    test("upload an image: it is attached to the edited record and displayed", async () => {
        mockUploadRoute();
        await openMediaManager();
        await contains(`${SIDE_PANEL} button:contains(Upload)`).click();
        await setInputFiles([new File(["x"], "uploaded.png", { type: "image/png" })]);
        await expect.waitForSteps([`upload uploaded.png on res.partner,${EDITED_PARTNER_ID}`]);
        await waitFor(card("uploaded.png"));
    });

    test("upload an image for a new record", async () => {
        mockUploadRoute();
        await openMediaManager({ resId: false });
        await contains(`${SIDE_PANEL} button:contains(Upload)`).click();
        await setInputFiles([new File(["x"], "uploaded.png", { type: "image/png" })]);
        await expect.waitForSteps(["upload uploaded.png on res.partner,-1"]);
    });

    test("drop files on the images: only the images are uploaded", async () => {
        mockUploadRoute();
        await openMediaManager();
        await manuallyDispatchProgrammaticEvent(queryOne(".modal .o_kanban_renderer"), "dragenter");
        await animationFrame();
        expect(".modal .media-manager-drop-zone").toHaveClass("active");

        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(new File(["x"], "dropped.png", { type: "image/png" }));
        dataTransfer.items.add(new File(["x"], "dropped.pdf", { type: "application/pdf" }));
        await manuallyDispatchProgrammaticEvent(
            queryOne(".modal .media-manager-drop-zone"),
            "drop",
            { dataTransfer }
        );
        await expect.waitForSteps([`upload dropped.png on res.partner,${EDITED_PARTNER_ID}`]);
        await animationFrame();
        expect(".modal .media-manager-drop-zone").not.toHaveClass("active");
        await waitFor(card("dropped.png"));
    });

    test("import from an invalid url", async () => {
        onRpc("/html_editor/attachment/add_url", () => expect.step("add_url"));
        await openMediaManager();
        await contains(`${SIDE_PANEL} .btn-import-url`).click();
        expect(`${SIDE_PANEL} input[name=url]`).toBeFocused();

        await contains(`${SIDE_PANEL} input[name=url]`).edit("not_an_url", { confirm: false });
        await contains(`${SIDE_PANEL} .btn-import-url`).click();
        await waitFor(".o_notification:contains(The provided URL is not valid.)");
        expect.verifySteps([]);
    });

    test("import a video from the url of a platform", async () => {
        onRpc("/html_editor/attachment/add_url", async (request) => {
            const { params } = await request.json();
            expect.step("add_url");
            expect(params).toEqual({
                url: YOUTUBE_URL,
                res_model: "res.partner",
                res_id: EDITED_PARTNER_ID,
                name: "YouTube - dQw4w9WgXcQ",
                mimetype: "video/x-youtube",
            });
            return {};
        });
        await openMediaManager();
        await contains(`${SIDE_PANEL} .btn-import-url`).click();
        await contains(`${SIDE_PANEL} input[name=url]`).edit(YOUTUBE_URL, { confirm: false });
        await waitFor(`${SIDE_PANEL} .o_we_url_success`);
        await contains(`${SIDE_PANEL} .btn-import-url`).click();
        expect.verifySteps(["add_url"]);
    });
});
