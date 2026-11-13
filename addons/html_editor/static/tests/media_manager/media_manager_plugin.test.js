import { animationFrame, describe, expect, test } from "@odoo/hoot";
import { click, waitFor } from "@odoo/hoot-dom";
import { defineModels, onRpc, patchWithCleanup } from "@web/../tests/web_test_helpers";
import { MediaManagerPlugin } from "@html_editor/backend/media_manager/media_manager_plugin";
import { MediaManagerDialog } from "@html_editor/backend/media_manager/media_manager_dialog";
import { getRecordDomain } from "@html_editor/main/media/media_manager/domain_helper";
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

const PARTNER_RECORD_INFO = { resModel: "res.partner", resId: 1 };

/**
 * @param {string} content
 * @param {Object} [config]
 */
function setupMediaManagerEditor(content, config = {}) {
    return setupEditor(content, {
        config: {
            includePlugins: [MediaManagerPlugin],
            excludePlugins: [MediaPlugin],
            getRecordInfo: () => PARTNER_RECORD_INFO,
            ...config,
        },
    });
}

/** Capture the props given to the media manager dialog. */
function spyDialogProps() {
    patchWithCleanup(MediaManagerDialog.prototype, {
        setup() {
            super.setup(...arguments);
            expect.step({
                baseResModel: this.props.baseResModel,
                baseResId: this.props.baseResId,
                multiSelect: this.props.multiSelect,
                domain: this.props.domain,
            });
        },
    });
}

test("the media manager plugin replaces the media plugin in the main plugins", () => {
    expect(MAIN_PLUGINS).toInclude(MediaManagerPlugin);
    expect(MAIN_PLUGINS).not.toInclude(MediaPlugin);
    expect(MediaManagerPlugin.id).toBe(MediaPlugin.id);
});

test("getDomain: images of the edited record", () => {
    const domain = MediaManagerPlugin.prototype.getDomain(PARTNER_RECORD_INFO, {});
    expect(domain).toEqual(getRecordDomain("res.partner", 1));
});

describe("open the media manager", () => {
    test("the media command opens the media manager", async () => {
        const { editor } = await setupMediaManagerEditor("<p>[]<br></p>");
        execCommand(editor, "insertMedia");
        await waitFor(".media-manager-kanban-view");
        await animationFrame();
        expect(".o_select_media_dialog").toHaveCount(0);
        expect(getCardNames()).toEqual(PARTNER_MEDIA_NAMES);
    });

    test("the media manager is opened for the edited record", async () => {
        spyDialogProps();
        const { editor } = await setupMediaManagerEditor("<p>[]<br></p>");
        execCommand(editor, "insertMedia");
        await waitFor(".media-manager-kanban-view");
        expect.verifySteps([
            {
                baseResModel: "res.partner",
                baseResId: 1,
                multiSelect: true,
                domain: getRecordDomain("res.partner", 1),
            },
        ]);
    });

    test("the media manager without record information", async () => {
        spyDialogProps();
        const { editor } = await setupMediaManagerEditor("<p>[]<br></p>", {
            getRecordInfo: undefined,
        });
        execCommand(editor, "insertMedia");
        await waitFor(".media-manager-kanban-view");
        await animationFrame();
        expect.verifySteps([
            {
                baseResModel: "ir.attachment",
                baseResId: -1,
                multiSelect: true,
                domain: getRecordDomain(undefined, undefined),
            },
        ]);
        expect(getCardNames()).toEqual(["banner.png", "logo.png"]);
    });

    test("getDomain can be overridden to adapt the displayed media", async () => {
        patchWithCleanup(MediaManagerPlugin.prototype, {
            getDomain(recordInfo) {
                expect.step(["getDomain", recordInfo]);
                return [["id", "=", 3]];
            },
        });
        const { editor } = await setupMediaManagerEditor("<p>[]<br></p>");
        execCommand(editor, "insertMedia");
        await waitFor(".media-manager-kanban-view");
        await animationFrame();
        expect.verifySteps([["getDomain", PARTNER_RECORD_INFO]]);
        expect(getCardNames()).toEqual(["partner.jpg"]);
    });

    test("the old media dialog is still available", async () => {
        onRpc("ir.attachment", "search_read", () => []);
        const { editor } = await setupMediaManagerEditor("<p>[]<br></p>");
        execCommand(editor, "insertMediaOLD");
        await waitFor(".o_select_media_dialog");
        expect(".media-manager-kanban-view").toHaveCount(0);
    });
});

describe("insert media", () => {
    test("insert a selected image", async () => {
        const { el, editor } = await setupMediaManagerEditor("<p>[]<br></p>");
        execCommand(editor, "insertMedia");
        await waitFor(".media-manager-kanban-view");
        await animationFrame();

        await click(`${card("partner.jpg")} .o_kanban_image`);
        await animationFrame();
        await click(".o_select_button");
        await waitFor("img[alt='partner.jpg']", { root: el });

        expect(".media-manager-kanban-view").toHaveCount(0);
        const images = el.querySelectorAll("img");
        expect(images).toHaveLength(1);
        expect(images[0]).toHaveAttribute("src", PNG_DATA_URL);
        expect(images[0]).toHaveAttribute("alt", "partner.jpg");
    });

    test("insert several images at once", async () => {
        const { el, editor } = await setupMediaManagerEditor("<p>[]<br></p>");
        execCommand(editor, "insertMedia");
        await waitFor(".media-manager-kanban-view");
        await animationFrame();

        await click(`${card("banner.png")} .o_kanban_image`);
        await animationFrame();
        await click(`${card("logo.png")} .o_kanban_image`);
        await animationFrame();
        await click(".o_select_button");
        await waitFor("img[alt='logo.png']", { root: el });
        await animationFrame();

        expect([...el.querySelectorAll("img")].map((img) => img.alt)).toEqual([
            "banner.png",
            "logo.png",
        ]);
    });

    test("closing the media manager inserts nothing", async () => {
        const { el, editor } = await setupMediaManagerEditor("<p>[]<br></p>");
        execCommand(editor, "insertMedia");
        await waitFor(".media-manager-kanban-view");
        await animationFrame();
        await click(".modal-footer .o_form_button_cancel");
        await animationFrame();
        expect(".media-manager-kanban-view").toHaveCount(0);
        expect(el.querySelectorAll("img")).toHaveLength(0);
    });

    test("replace an image: single selection", async () => {
        spyDialogProps();
        const { el, plugins } = await setupMediaManagerEditor(
            `<p>[]<img class="img-fluid o_to_replace" src="${PNG_DATA_URL}" alt="old"></p>`
        );
        plugins.get("media").openMediaDialog({ node: el.querySelector("img.o_to_replace") });
        await waitFor(".media-manager-kanban-view");
        await animationFrame();
        expect.verifySteps([
            {
                baseResModel: "res.partner",
                baseResId: 1,
                multiSelect: false,
                domain: getRecordDomain("res.partner", 1),
            },
        ]);
        expect(".o_select_button").toHaveCount(0);

        await click(`${card("logo.png")} .o_kanban_image`);
        await waitFor("img[alt='logo.png']", { root: el });
        await animationFrame();

        expect(".media-manager-kanban-view").toHaveCount(0);
        expect(el.querySelectorAll("img")).toHaveLength(1);
        expect(el.querySelector("img.o_to_replace")).toBe(null);
        expect(el.querySelector("img")).toHaveAttribute("alt", "logo.png");
    });

    test("an image without name gets an empty alt", async () => {
        patchWithCleanup(MediaManagerDialog.prototype, {
            async select(resIds) {
                this.props.onSelected(resIds, [{ id: 1, local_url: PNG_DATA_URL }]);
                this.props.close();
            },
        });
        const { el, editor } = await setupMediaManagerEditor("<p>[]<br></p>");
        execCommand(editor, "insertMedia");
        await waitFor(".media-manager-kanban-view");
        await animationFrame();
        await click(`${card("banner.png")} .o_kanban_image`);
        await animationFrame();
        await click(".o_select_button");
        await waitFor("img", { root: el });
        expect(el.querySelector("img")).toHaveAttribute("alt", "");
    });
});
