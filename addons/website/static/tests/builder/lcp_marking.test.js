import { expect, test } from "@odoo/hoot";
import { queryOne } from "@odoo/hoot-dom";
import {
    contains,
    defineModels,
    models,
    onRpc,
    patchWithCleanup,
} from "@web/../tests/web_test_helpers";
import { insertText } from "@html_editor/../tests/_helpers/user_actions";
import { setSelection } from "@html_editor/../tests/_helpers/selection";
import { EditInteractionPlugin } from "@website/builder/plugins/edit_interaction_plugin";
import { LcpMarkingPlugin } from "@website/builder/plugins/lcp_marking_plugin";
import { lcpMeasurement } from "@website/components/dialog/lcp_measurement_utils";
import { defineWebsiteModels, setupWebsiteBuilder } from "./website_helpers";

class ProductTemplate extends models.Model {
    _name = "product.template";
}

defineWebsiteModels();
defineModels([ProductTemplate]);

const IMAGE_URL = "/web/image/7-abc/hero.webp";
const CONTENT = `
    <section class="target">
        <img class="hero" style="width: 800px; height: 400px;" src="${IMAGE_URL}"/>
        <p class="edit-me">edit</p>
    </section>
`;

/**
 * Makes the page report `record` as its SEO record and the measurement frames
 * report the `.hero` image as their largest contentful paint entry.
 *
 * @param {{ model: string, id: number }} record
 * @returns {{ written: Array, measuredDocuments: Document[], done: Promise<void> }}
 */
function setupLcp(record) {
    const written = [];
    const measuredDocuments = [];
    const { promise: done, resolve } = Promise.withResolvers();
    patchWithCleanup(LcpMarkingPlugin.prototype, {
        lcpRecord() {
            return record;
        },
        async saveLcpImages() {
            await super.saveLcpImages();
            resolve();
        },
    });
    patchWithCleanup(lcpMeasurement, {
        async appendMeasureFrame(viewportSize) {
            const frame = await super.appendMeasureFrame(viewportSize);
            const win = frame.measurementIframeEl.contentWindow;
            measuredDocuments.push(win.document);
            win.PerformanceObserver = class {
                constructor(callback) {
                    this.callback = callback;
                }
                observe() {
                    const imgEl = win.document.querySelector("img.hero");
                    this.callback({ getEntries: () => [{ element: imgEl, url: imgEl.src }] });
                }
                takeRecords() {
                    return [];
                }
                disconnect() {}
            };
            return frame;
        },
    });
    onRpc("ir.ui.view", "save", () => true);
    onRpc(record.model, "write", ({ args, kwargs }) => {
        expect(kwargs.context).toMatchObject({ website_id: 1 });
        written.push(args);
        return true;
    });
    return { written, measuredDocuments, done };
}

async function dirtyAndSave(getEditor) {
    const paragraphEl = queryOne(":iframe .edit-me");
    setSelection({ anchorNode: paragraphEl.firstChild, anchorOffset: 1 });
    await insertText(getEditor(), "x");
    await contains(".o_hb_snippets_top_actions button:contains(Save)").click();
}

const HINTS = { website_lcp_image_desktop: IMAGE_URL, website_lcp_image_mobile: IMAGE_URL };

test("hints are saved on a view that is specific to the website", async () => {
    const { written, done } = setupLcp({ model: "ir.ui.view", id: 1 });
    onRpc("ir.ui.view", "read", () => [{ id: 1, website_id: [1, "My Website"] }]);
    const { getEditor } = await setupWebsiteBuilder(CONTENT);
    await dirtyAndSave(getEditor);
    await done;
    expect(written).toEqual([[[1], HINTS]]);
});

test("hints are not saved on a view that is shared by the websites", async () => {
    const { written, measuredDocuments, done } = setupLcp({ model: "ir.ui.view", id: 1 });
    onRpc("ir.ui.view", "read", () => [{ id: 1, website_id: false }]);
    const { getEditor } = await setupWebsiteBuilder(CONTENT);
    await dirtyAndSave(getEditor);
    await done;
    expect(measuredDocuments).toEqual([]);
    expect(written).toEqual([]);
});

test("hints are saved on the record of a controller page", async () => {
    const { written, done } = setupLcp({ model: "product.template", id: 12 });
    onRpc("product.template", "has_access", ({ args }) => {
        expect(args).toEqual([[12], "write"]);
        return true;
    });
    const { getEditor } = await setupWebsiteBuilder(CONTENT);
    await dirtyAndSave(getEditor);
    await done;
    expect(written).toEqual([[[12], HINTS]]);
});

test("hints are not saved on a record that the user cannot write", async () => {
    const { written, measuredDocuments, done } = setupLcp({ model: "product.template", id: 12 });
    onRpc("product.template", "has_access", () => false);
    const { getEditor } = await setupWebsiteBuilder(CONTENT);
    await dirtyAndSave(getEditor);
    await done;
    expect(measuredDocuments).toEqual([]);
    expect(written).toEqual([]);
});

test("the page is measured as it is saved, without the editor state", async () => {
    const { written, measuredDocuments, done } = setupLcp({ model: "ir.ui.view", id: 1 });
    onRpc("ir.ui.view", "read", () => [{ id: 1, website_id: [1, "My Website"] }]);
    const { getEditor } = await setupWebsiteBuilder(`
        <section class="hidden-on-desktop o_snippet_desktop_invisible d-lg-none o_snippet_override_invisible">
            <p>shown in the editor only</p>
        </section>
        ${CONTENT}
    `);
    await dirtyAndSave(getEditor);
    await done;
    expect(":iframe .hidden-on-desktop").toHaveClass("o_snippet_override_invisible");
    expect(measuredDocuments).toHaveLength(2);
    for (const measuredDocument of measuredDocuments) {
        expect(measuredDocument.body).not.toHaveClass("editor_enable");
        expect(measuredDocument.querySelector(".hidden-on-desktop")).not.toHaveClass(
            "o_snippet_override_invisible"
        );
    }
    expect(written).toEqual([[[1], HINTS]]);
});

test("the content of a dynamic snippet is measured although the save removes it", async () => {
    const { measuredDocuments, done } = setupLcp({ model: "ir.ui.view", id: 1 });
    onRpc("ir.ui.view", "read", () => [{ id: 1, website_id: [1, "My Website"] }]);
    patchWithCleanup(EditInteractionPlugin.prototype, {
        stopInteractions(element) {
            super.stopInteractions(element);
            for (const el of this.editable.querySelectorAll(".dynamic_snippet_template")) {
                el.replaceChildren();
            }
        },
    });
    const { getEditor } = await setupWebsiteBuilder(`
        <section class="s_dynamic_snippet">
            <div class="dynamic_snippet_template">
                <img class="rendered" src="/web/image/9-def/card.webp"/>
            </div>
        </section>
        ${CONTENT}
    `);
    await dirtyAndSave(getEditor);
    await done;
    expect(":iframe .dynamic_snippet_template img").toHaveCount(0);
    expect(measuredDocuments).toHaveLength(2);
    for (const measuredDocument of measuredDocuments) {
        expect(
            measuredDocument.querySelectorAll(".dynamic_snippet_template img.rendered")
        ).toHaveLength(1);
    }
});
