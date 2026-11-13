import { animationFrame, describe, expect, test } from "@odoo/hoot";
import {
    click,
    edit,
    manuallyDispatchProgrammaticEvent,
    queryAll,
    queryOne,
    waitFor,
} from "@odoo/hoot-dom";
import {
    defineModels,
    makeMockServer,
    mockService,
    MockServer,
    onRpc,
    toggleMenuItem,
    toggleSearchBarMenu,
} from "@web/../tests/web_test_helpers";
import { getMediaManagertDialogProps } from "@html_editor/backend/media_manager/media_manager_dialog";
import {
    getRecordDomain,
    MY_MEDIA_DOMAIN,
} from "@html_editor/main/media/media_manager/domain_helper";
import {
    card,
    CARD,
    getCardNames,
    mediaManagerModels,
    openMediaManager,
    PARTNER_MEDIA_NAMES,
    PNG_DATA_URL,
} from "./media_manager_test_helpers";

describe.current.tags("desktop");
defineModels(mediaManagerModels);

/** @param {string} name */
async function openCardMenu(name) {
    await click(`${card(name)} .o_dropdown_kanban button`);
    await waitFor(".o-dropdown--kanban-record-menu");
}

/** @param {number} id */
function getServerAttachment(id) {
    return MockServer.env["ir.attachment"].browse(id)[0];
}

/** Mock the upload route, creating the attachment on the mock server. */
function mockUpload() {
    onRpc("/html_editor/attachment/add_data", async (request) => {
        const { params } = await request.json();
        expect.step(`upload ${params.name} on ${params.res_model},${params.res_id}`);
        const [id] = MockServer.env["ir.attachment"].create({
            name: params.name,
            mimetype: "image/png",
            type: "binary",
            public: false,
            res_model: params.res_model,
            res_id: params.res_id,
            local_url: PNG_DATA_URL,
            image_src: PNG_DATA_URL,
        });
        return { id, name: params.name, image_src: PNG_DATA_URL, mimetype: "image/png" };
    });
}

describe("dialog props", () => {
    test("for a saved record", () => {
        const props = getMediaManagertDialogProps({ resModel: "res.partner", resId: 4 });
        expect(props.resModel).toBe("ir.attachment");
        expect(props.baseResModel).toBe("res.partner");
        expect(props.baseResId).toBe(4);
        expect(props.noCreate).toBe(true);
        expect(props.domain).toEqual(getRecordDomain("res.partner", 4));
        expect(props.context).toEqual({
            kanban_view_ref: "html_editor.mediamanager_media_kanban",
            search_view_ref: "html_editor.mediamanager_media_search",
        });
    });

    test("for a record that is not saved", () => {
        const props = getMediaManagertDialogProps({ resModel: "res.partner" });
        expect(props.baseResModel).toBe("res.partner");
        expect(props.baseResId).toBe(-1);
        expect(props.domain).toEqual(getRecordDomain("res.partner"));
    });

    test("without any record", () => {
        const props = getMediaManagertDialogProps({});
        expect(props.baseResModel).toBe("ir.attachment");
        expect(props.baseResId).toBe(-1);
    });

    test("side panel filters", () => {
        const { filters } = getMediaManagertDialogProps({ resModel: "res.partner", resId: 4 });
        expect(filters.map((filter) => filter.label)).toEqual([
            "uploaded last week",
            "uploaded by me",
            "favorites",
        ]);
        const [lastWeek, mine, favorites] = filters;
        expect(lastWeek.domain[0].slice(0, 2)).toEqual(["create_date", ">"]);
        const lastWeekDate = luxon.DateTime.fromFormat(lastWeek.domain[0][2], "yyyy-MM-dd HH:mm:ss");
        expect(lastWeekDate.isValid).toBe(true);
        expect(Math.round(luxon.DateTime.now().diff(lastWeekDate, "days").days)).toBe(7);
        expect(mine.domain).toEqual(MY_MEDIA_DOMAIN);
        expect(favorites.domain).toEqual([["is_favorite", "=", true]]);
    });
});

describe("records", () => {
    test("displays the images of the record and the public images", async () => {
        await openMediaManager();
        expect(".modal-dialog.modal-xl .media-manager-kanban-view").toHaveCount(1);
        expect(getCardNames()).toEqual(PARTNER_MEDIA_NAMES);
    });

    test("displays only the public images for a record that is not saved", async () => {
        await openMediaManager({}, { resModel: "res.partner" });
        expect(getCardNames()).toEqual(["banner.png", "logo.png"]);
    });

    test("displays the images given by the domain prop", async () => {
        await openMediaManager({ domain: [["id", "in", [3, 4]]] });
        expect(getCardNames()).toEqual(["partner.jpg", "other_partner.png"]);
    });

    test("cards display their tags", async () => {
        await openMediaManager();
        expect(`${card("banner.png")} .o_media_tags .o_tag`).toHaveCount(1);
        expect(`${card("banner.png")} .o_media_tags .o_tag`).toHaveText("Banner");
        expect(`${card("logo.png")} .o_media_tags`).toHaveCount(0);
    });

    test("cards of favorite images are starred", async () => {
        await openMediaManager();
        expect(`${card("logo.png")}`).toHaveClass("o_record_starred");
        expect(`${card("logo.png")} .o_record_box_star [data-icon=star_filled]`).toHaveCount(1);
        expect(`${card("banner.png")}`).not.toHaveClass("o_record_starred");
        expect(`${card("banner.png")} .o_record_box_star [data-icon=star]`).toHaveCount(1);
    });

    test("cards do not grow to fill the row", async () => {
        await openMediaManager();
        expect(`${card("banner.png")}`).toHaveClass("flex-grow-0 flex-md-shrink-0");
        expect(`${card("banner.png")}`).not.toHaveClass("flex-grow-1");
        expect(`${card("banner.png")}`).not.toHaveClass("flex-md-shrink-1");
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
            onSelected: (resIds, records) => {
                expect.step({ resIds, names: records.map((r) => r.name) });
            },
        });
        expect(".o_select_button").toHaveCount(0);
        await click(`${card("logo.png")} .o_kanban_image`);
        await animationFrame();
        expect.verifySteps([{ resIds: [2], names: ["logo.png"] }]);
        expect(".media-manager-kanban-view").toHaveCount(0);
    });

    test("multi selection: select several cards then validate", async () => {
        await openMediaManager({
            multiSelect: true,
            onSelected: (resIds, records) => {
                expect.step({ resIds, names: records.map((r) => r.name) });
            },
        });
        expect(".o_select_button").toHaveAttribute("disabled");

        await click(`${card("banner.png")} .o_kanban_image`);
        await animationFrame();
        expect(".o_select_button").not.toHaveAttribute("disabled");
        await click(`${card("partner.jpg")} .o_kanban_image`);
        await animationFrame();
        expect(".media-manager-kanban-view").toHaveCount(1, {
            message: "selecting does not close the dialog in multi selection",
        });
        expect.verifySteps([]);

        await click(".o_select_button");
        await animationFrame();
        expect.verifySteps([{ resIds: [1, 3], names: ["banner.png", "partner.jpg"] }]);
        expect(".media-manager-kanban-view").toHaveCount(0);
    });

    test("multi selection: clicking a selected card unselects it", async () => {
        await openMediaManager({
            onSelected: (resIds) => expect.step(resIds),
        });
        await click(`${card("banner.png")} .o_kanban_image`);
        await animationFrame();
        await click(`${card("partner.jpg")} .o_kanban_image`);
        await animationFrame();
        await click(`${card("banner.png")} .o_kanban_image`);
        await animationFrame();
        await click(".o_select_button");
        await animationFrame();
        expect.verifySteps([[3]]);
    });

    test("selected records give the data needed to insert them", async () => {
        await openMediaManager({
            multiSelect: false,
            onSelected: (resIds, [record]) => {
                expect.step([record.id, record.display_name, record.local_url]);
            },
        });
        await click(`${card("partner.jpg")} .o_kanban_image`);
        await animationFrame();
        expect.verifySteps([[3, "partner.jpg", PNG_DATA_URL]]);
    });

    test("closing the dialog does not select anything", async () => {
        await openMediaManager({
            onSelected: () => expect.step("selected"),
        });
        await click(`${card("banner.png")} .o_kanban_image`);
        await animationFrame();
        await click(".modal-footer .o_form_button_cancel");
        await animationFrame();
        expect(".media-manager-kanban-view").toHaveCount(0);
        expect.verifySteps([]);
    });
});

describe("favorites", () => {
    test("star an image", async () => {
        onRpc("web_save", ({ args }) => expect.step(args[1]));
        await openMediaManager({ onSelected: () => expect.step("selected") });

        await click(`${card("banner.png")} .o_record_box_star`);
        await animationFrame();
        expect.verifySteps([{ is_favorite: true }]);
        expect(getServerAttachment(1).is_favorite).toBe(true);
        expect(`${card("banner.png")}`).toHaveClass("o_record_starred");
        expect(`${card("banner.png")} .o_record_box_star [data-icon=star_filled]`).toHaveCount(1);
    });

    test("unstar an image", async () => {
        onRpc("web_save", ({ args }) => expect.step(args[1]));
        await openMediaManager();

        await click(`${card("logo.png")} .o_record_box_star`);
        await animationFrame();
        expect.verifySteps([{ is_favorite: false }]);
        expect(getServerAttachment(2).is_favorite).toBe(false);
        expect(`${card("logo.png")}`).not.toHaveClass("o_record_starred");
    });

    test("starring an image does not select it", async () => {
        await openMediaManager({
            multiSelect: false,
            onSelected: () => expect.step("selected"),
        });
        await click(`${card("banner.png")} .o_record_box_star`);
        await animationFrame();
        expect(".media-manager-kanban-view").toHaveCount(1);
        expect.verifySteps([]);
    });
});

describe("side panel filters", () => {
    test("are displayed", async () => {
        await openMediaManager();
        expect(".media-manager-side-panel-filters a").toHaveCount(4);
        expect(queryAll(".media-manager-side-panel-filters a").map((a) => a.textContent)).toEqual([
            "Reset Filters",
            "uploaded last week",
            "uploaded by me",
            "favorites",
        ]);
    });

    test("are not displayed without filters", async () => {
        await openMediaManager({ filters: undefined });
        expect(".media-manager-side-panel-filters").toHaveCount(0);
    });

    test("filter the favorites, then reset", async () => {
        await openMediaManager();
        await click(".media-manager-side-panel-filters a:contains(favorites)");
        await animationFrame();
        expect(getCardNames()).toEqual(["logo.png"]);

        await click(".media-manager-side-panel-filters a:contains(Reset Filters)");
        await animationFrame();
        expect(getCardNames()).toEqual(PARTNER_MEDIA_NAMES);
    });

    test("filters are combined with the dialog domain", async () => {
        // banner.webp is a favorite, but an optimized copy hidden by the domain
        await makeMockServer();
        MockServer.env["ir.attachment"].write([7], { is_favorite: true });
        await openMediaManager();
        await click(".media-manager-side-panel-filters a:contains(favorites)");
        await animationFrame();
        expect(getCardNames()).toEqual(["logo.png"]);
    });
});

describe("card menu", () => {
    test("contains the preview, the tags editor and the delete action", async () => {
        await openMediaManager();
        await openCardMenu("banner.png");
        expect(".o-dropdown--kanban-record-menu .dropdown-item:contains(Preview image)").toHaveCount(1);
        expect(".o-dropdown--kanban-record-menu .o_media_tags_menu input").toHaveCount(1);
        expect(".o-dropdown--kanban-record-menu .o_media_tags_menu .o_tag").toHaveText("Banner");
        expect(".o-dropdown--kanban-record-menu .dropdown-item:contains(Delete)").toHaveCount(1);
    });

    test("opening the menu does not select the card", async () => {
        await openMediaManager({
            multiSelect: false,
            onSelected: () => expect.step("selected"),
        });
        await openCardMenu("banner.png");
        expect(".media-manager-kanban-view").toHaveCount(1);
        expect.verifySteps([]);
    });

    test("preview an image", async () => {
        mockService("fileViewer", () => () => ({
            open: (file) => expect.step(file),
            close: () => {},
        }));
        await openMediaManager();
        await openCardMenu("logo.png");
        await click(".o-dropdown--kanban-record-menu .dropdown-item:contains(Preview image)");
        await animationFrame();
        expect.verifySteps([
            {
                isImage: true,
                isViewable: true,
                name: "logo.png",
                defaultSource: "/web/image/2",
                downloadUrl: "/web/image/2",
            },
        ]);
    });

    test("preview is not available for non images", async () => {
        mockService("fileViewer", () => () => ({
            open: () => expect.step("open"),
            close: () => {},
        }));
        await makeMockServer();
        MockServer.env["ir.attachment"].write([1], { mimetype: "application/pdf" });
        await openMediaManager({ domain: [["id", "=", 1]] });
        await openCardMenu("banner.png");
        await click(".o-dropdown--kanban-record-menu .dropdown-item:contains(Preview image)");
        await animationFrame();
        expect.verifySteps([]);
    });

    test("delete an image after confirmation", async () => {
        onRpc("unlink", ({ args }) => expect.step(["unlink", args[0]]));
        await openMediaManager();
        await openCardMenu("banner.png");
        await click(".o-dropdown--kanban-record-menu .dropdown-item:contains(Delete)");
        await animationFrame();
        expect.verifySteps([]);

        await click(".modal-footer button:contains(Delete)");
        await animationFrame();
        expect.verifySteps([["unlink", [1]]]);
        expect(getCardNames()).toEqual(["logo.png", "partner.jpg"]);
    });

    test("cancel the deletion of an image", async () => {
        onRpc("unlink", () => expect.step("unlink"));
        await openMediaManager();
        await openCardMenu("banner.png");
        await click(".o-dropdown--kanban-record-menu .dropdown-item:contains(Delete)");
        await animationFrame();
        await click(".modal-footer button:contains(Cancel)");
        await animationFrame();
        expect.verifySteps([]);
        expect(getCardNames()).toEqual(PARTNER_MEDIA_NAMES);
    });
});

describe("tags", () => {
    test("tags can be edited although the view is readonly", async () => {
        await openMediaManager();
        await openCardMenu("logo.png");
        expect(".o_media_tags_menu .o_field_many2many_tags input").toHaveCount(1);
        expect(".o_media_tags_menu input").toHaveAttribute("placeholder", "Add a tag...");
        expect(`${card("logo.png")} .o_media_tags`).toHaveCount(0);
    });

    test("add an existing tag from the card menu", async () => {
        onRpc("web_save", ({ args }) => expect.step(["web_save", args[0]]));
        await openMediaManager();
        await openCardMenu("logo.png");
        await click(".o_media_tags_menu input");
        await edit("Log", { confirm: false });
        await waitFor(".o-autocomplete--dropdown-item:contains(Logo)");
        await click(".o-autocomplete--dropdown-item:contains(Logo)");
        await animationFrame();

        expect.verifySteps([["web_save", [2]]]);
        expect(getServerAttachment(2).media_tag_ids).toEqual([2], {
            message: "the tag should be saved right away",
        });
        expect(`${card("logo.png")} .o_media_tags .o_tag`).toHaveText("Logo");
    });

    test("the input keeps the focus while typing", async () => {
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

    test("remove a tag from the card menu", async () => {
        onRpc("web_save", ({ args }) => expect.step(["web_save", args[0]]));
        await openMediaManager();
        await openCardMenu("banner.png");
        await click(".o_media_tags_menu .o_tag .o_delete");
        await animationFrame();

        expect.verifySteps([["web_save", [1]]]);
        expect(getServerAttachment(1).media_tag_ids).toEqual([]);
        expect(`${card("banner.png")} .o_media_tags`).toHaveCount(0);
    });

    test("create a tag from the card menu", async () => {
        onRpc("name_create", ({ args }) => expect.step(["name_create", args[0]]));
        onRpc("web_save", ({ args }) => expect.step(["web_save", args[0]]));
        await openMediaManager();
        await openCardMenu("logo.png");
        await click(".o_media_tags_menu input");
        await edit("Hero", { confirm: false });
        await waitFor(".o-autocomplete--dropdown-item:contains(Create)");
        expect(".o-autocomplete--dropdown-item:contains(Create and edit)").toHaveCount(0, {
            message: "no_create_edit: the full tag form is never opened",
        });
        await click(".o-autocomplete--dropdown-item:contains(Create)");
        await animationFrame();

        expect.verifySteps([
            ["name_create", "Hero"],
            ["web_save", [2]],
        ]);
        const [hero] = MockServer.env["html_editor.media.tag"].search_read([["name", "=", "Hero"]]);
        expect(getServerAttachment(2).media_tag_ids).toEqual([hero.id]);
        expect(`${card("logo.png")} .o_media_tags .o_tag`).toHaveText("Hero");
    });

    test("tags of an image do not leak on the other ones", async () => {
        await openMediaManager();
        await openCardMenu("logo.png");
        await click(".o_media_tags_menu input");
        await edit("Log", { confirm: false });
        await waitFor(".o-autocomplete--dropdown-item:contains(Logo)");
        await click(".o-autocomplete--dropdown-item:contains(Logo)");
        await animationFrame();

        expect(getServerAttachment(1).media_tag_ids).toEqual([1]);
        expect(getServerAttachment(3).media_tag_ids).toEqual([]);
        expect(`${card("banner.png")} .o_media_tags .o_tag`).toHaveText("Banner");
        expect(`${card("partner.jpg")} .o_media_tags`).toHaveCount(0);
    });

    test("tags are kept after reloading", async () => {
        await openMediaManager();
        await openCardMenu("logo.png");
        await click(".o_media_tags_menu input");
        await edit("Log", { confirm: false });
        await waitFor(".o-autocomplete--dropdown-item:contains(Logo)");
        await click(".o-autocomplete--dropdown-item:contains(Logo)");
        await animationFrame();

        // reload through the side panel filters
        await click(".media-manager-side-panel-filters a:contains(favorites)");
        await animationFrame();
        expect(`${card("logo.png")} .o_media_tags .o_tag`).toHaveText("Logo");
    });
});

describe("upload", () => {
    test("upload an image from the file input", async () => {
        mockUpload();
        await openMediaManager();
        const fileInput = queryOne(".media-manager-side-panel input.o_file_input");
        Object.defineProperty(fileInput, "files", {
            value: [new File(["x"], "uploaded.png", { type: "image/png" })],
        });
        await manuallyDispatchProgrammaticEvent(fileInput, "change");
        await expect.waitForSteps(["upload uploaded.png on res.partner,1"]);
        await waitFor(card("uploaded.png"));
        expect(getCardNames()).toEqual([...PARTNER_MEDIA_NAMES, "uploaded.png"]);
    });

    test("the upload button opens the file selector", async () => {
        await openMediaManager();
        const fileInput = queryOne(".media-manager-side-panel input.o_file_input");
        fileInput.addEventListener("click", (ev) => {
            ev.preventDefault();
            expect.step("file selector");
        });
        await click(".media-manager-side-panel-buttons button:contains(Upload)");
        expect.verifySteps(["file selector"]);
    });

    test("upload for a record that is not saved", async () => {
        mockUpload();
        await openMediaManager({}, { resModel: "res.partner" });
        const fileInput = queryOne(".media-manager-side-panel input.o_file_input");
        Object.defineProperty(fileInput, "files", {
            value: [new File(["x"], "uploaded.png", { type: "image/png" })],
        });
        await manuallyDispatchProgrammaticEvent(fileInput, "change");
        await expect.waitForSteps(["upload uploaded.png on res.partner,-1"]);
    });

    test("dragging a file over the view displays the drop zone", async () => {
        await openMediaManager();
        expect(".media-manager-drop-zone").not.toHaveClass("active");
        await manuallyDispatchProgrammaticEvent(queryOne(".o_kanban_renderer"), "dragenter");
        await animationFrame();
        expect(".media-manager-drop-zone").toHaveClass("active");
        await manuallyDispatchProgrammaticEvent(queryOne(".media-manager-drop-zone"), "dragleave");
        await animationFrame();
        expect(".media-manager-drop-zone").not.toHaveClass("active");
    });

    test("dropping files uploads the images only", async () => {
        mockUpload();
        await openMediaManager();
        await manuallyDispatchProgrammaticEvent(queryOne(".o_kanban_renderer"), "dragenter");
        await animationFrame();

        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(new File(["x"], "dropped.png", { type: "image/png" }));
        dataTransfer.items.add(new File(["x"], "dropped.pdf", { type: "application/pdf" }));
        dataTransfer.items.add(new File(["xx"], "dropped.webp", { type: "image/webp" }));
        await manuallyDispatchProgrammaticEvent(queryOne(".media-manager-drop-zone"), "drop", {
            dataTransfer,
        });
        await expect.waitForSteps([
            "upload dropped.png on res.partner,1",
            "upload dropped.webp on res.partner,1",
        ]);
        expect(".media-manager-drop-zone").not.toHaveClass("active");
        await waitFor(card("dropped.webp"));
        expect(card("dropped.pdf")).toHaveCount(0);
    });
});

describe("import from url", () => {
    test("the url input is displayed on demand", async () => {
        await openMediaManager();
        expect(".media-manager-side-panel input[name=url]").not.toBeVisible();
        await click(".btn-import-url");
        await animationFrame();
        expect(".media-manager-side-panel input[name=url]").toBeVisible();
        expect(".media-manager-side-panel input[name=url]").toBeFocused();
        expect(".btn-import-url").toHaveClass("btn-primary");
    });

    test("an invalid url displays a notification", async () => {
        onRpc("/html_editor/attachment/add_url", () => expect.step("add_url"));
        mockUpload();
        await openMediaManager();
        await click(".btn-import-url");
        await animationFrame();
        queryOne(".media-manager-side-panel input[name=url]").value = "not_an_url";
        await click(".btn-import-url");
        await waitFor(".o_notification:contains(The provided URL is not valid.)");
        expect.verifySteps([]);
    });
});
