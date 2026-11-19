import { animationFrame, before, click, press, queryOne, tick, waitFor } from "@odoo/hoot";
import { unmockedOrm } from "@web/../tests/_framework/module_set.hoot";
import {
    defineModels,
    models,
    mountView,
    patchWithCleanup,
    serverState,
    webModels,
} from "@web/../tests/web_test_helpers";
import { HtmlField } from "@html_editor/fields/html_field";
import { setSelection } from "../_helpers/selection";
import { expectElementCount } from "../_helpers/ui_expectations";
import { insertText } from "../_helpers/user_actions";

/**
 * The tests use the product as the end user does: a form view with an html
 * field, the media manager opened from the editor, the real views of the media
 * manager and the fields of the real models. Only the data and the server
 * routes are mocked.
 */

// 1x1 png, loadable by `loadImage` when an image is inserted in the editor.
export const PNG_DATA_URL =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

export const EDITED_PARTNER_ID = 101;
export const OTHER_PARTNER_ID = 102;
/** A partner whose notes contain an image. */
export const PARTNER_WITH_IMAGE_ID = 103;

// -----------------------------------------------------------------------------
// Views: the real ones, as defined by html_editor
// -----------------------------------------------------------------------------

const VIEW_REFS = {
    kanban: "html_editor.mediamanager_media_kanban",
    search: "html_editor.mediamanager_media_search",
};

const archsPromises = {};
const archs = { own: {}, combined: {} };

/**
 * Fetch the archs of the media manager views from the server.
 *
 * @param {"own"|"combined"} mode "own": the views as defined by html_editor,
 *  "combined": with the extensions of the installed modules (e.g. ai)
 */
function fetchMediaManagerArchs(mode) {
    archsPromises[mode] ||= (async () => {
        for (const [viewType, ref] of Object.entries(VIEW_REFS)) {
            const [module, name] = ref.split(".");
            const [{ res_id }] = await unmockedOrm(
                "ir.model.data",
                "search_read",
                [[["module", "=", module], ["name", "=", name]], ["res_id"]],
                {}
            );
            archs[mode][viewType] =
                mode === "own"
                    ? (await unmockedOrm("ir.ui.view", "read", [[res_id], ["arch_db"]], {}))[0].arch_db
                    : await unmockedOrm("ir.ui.view", "get_combined_arch", [[res_id]], {});
        }
    })();
    return archsPromises[mode];
}

/**
 * The views of `ir.attachment` requested by the media manager dialog.
 *
 * @param {Object} [params]
 * @param {boolean} [params.withExtensions] include the extensions of the
 *  installed modules (only when their assets are loaded, see
 *  `defineMediaManagerViews`)
 */
export function getMediaManagerViews({ withExtensions = false } = {}) {
    const views = archs[withExtensions ? "combined" : "own"];
    return {
        [`kanban,${VIEW_REFS.kanban}`]: views.kanban,
        [`search,${VIEW_REFS.search}`]: views.search,
    };
}

// -----------------------------------------------------------------------------
// Data
// -----------------------------------------------------------------------------

export const TAGS = { banner: 1, logo: 2 };

export class MediaTag extends models.ServerModel {
    _name = "html_editor.media.tag";

    _records = [
        { id: TAGS.banner, name: "Banner", color: 1 },
        { id: TAGS.logo, name: "Logo", color: 2 },
    ];
}

export class ResPartner extends webModels.ResPartner {
    _records = [
        // the partners of the default company and users
        ...serverState.companies.map(({ id, name }) => ({ id, name })),
        { id: serverState.partnerId, name: serverState.partnerName },
        { id: serverState.publicPartnerId, name: serverState.publicPartnerName, active: false },
        { id: serverState.odoobotId, name: "OdooBot", active: false },
        { id: EDITED_PARTNER_ID, name: "Edited partner", comment: "<p>Some notes</p>" },
        { id: OTHER_PARTNER_ID, name: "Other partner", comment: "<p>Other notes</p>" },
        {
            id: PARTNER_WITH_IMAGE_ID,
            name: "Partner with an image",
            comment: `<p><img class="img-fluid" src="${PNG_DATA_URL}" alt="old"></p>`,
        },
    ];
}

/**
 * The attachments of the database: the media manager of the edited partner
 * only shows the first three ones.
 */
export function getAttachmentRecords() {
    return [
        image(1, "banner.png", {
            public: true,
            media_tag_ids: [TAGS.banner],
            create_date: "2026-11-02 10:00:00",
        }),
        image(2, "logo.png", { public: true, is_favorite: true }),
        image(3, "partner.jpg", {
            mimetype: "image/jpeg",
            res_model: "res.partner",
            res_id: EDITED_PARTNER_ID,
            create_uid: serverState.odoobotUid,
        }),
        // Not displayed: images of another record, not images, technical images
        image(4, "other_partner.png", { res_model: "res.partner", res_id: OTHER_PARTNER_ID }),
        image(5, "document.pdf", { public: true, mimetype: "application/pdf" }),
        image(6, "banner.png.crop", { public: true }),
        image(7, "logo.webp", { public: true, mimetype: "image/webp", original_id: 2, is_favorite: true }),
        image(8, "static.png", { public: true, url: "/web/static/img/logo.png" }),
        image(9, "shape.svg", {
            public: true,
            mimetype: "image/svg+xml",
            url: "/html_editor/shape/brushes/01.svg",
        }),
        image(10, "link.png", { public: true, type: "url", url: "https://example.com/link.png" }),
    ];
}

/** Names of the images shown to the edited partner, in the default order. */
export const PARTNER_IMAGES = ["banner.png", "logo.png", "partner.jpg"];

function image(id, name, values = {}) {
    return {
        id,
        name,
        mimetype: "image/png",
        type: "binary",
        public: false,
        local_url: PNG_DATA_URL,
        image_src: PNG_DATA_URL,
        create_uid: serverState.userId,
        create_date: "2026-11-16 10:00:00",
        ...values,
    };
}

export class IrAttachment extends webModels.IrAttachment {
    // fresh copies: the mock server updates its records in place
    _records = getAttachmentRecords();
    _views = getMediaManagerViews();
}

/**
 * Define the models and views used by the media manager. The other modules
 * (e.g. website) can define their own `ir.attachment` with the records and
 * views of the helpers.
 */
export function defineMediaManagerModels() {
    before(() => fetchMediaManagerArchs("own"));
    defineModels({ ...webModels, IrAttachment, MediaTag, ResPartner });
}

/** @param {{ withExtensions?: boolean }} [params] see `getMediaManagerViews` */
export function defineMediaManagerViews({ withExtensions = false } = {}) {
    before(() => fetchMediaManagerArchs(withExtensions ? "combined" : "own"));
}

// -----------------------------------------------------------------------------
// User interactions
// -----------------------------------------------------------------------------

export const PARTNER_FORM_ARCH = /* xml */ `
    <form>
        <field name="name"/>
        <field name="comment" widget="html"/>
    </form>`;

/**
 * Open the form of a partner, with its notes in an html field.
 *
 * @param {Object} [params]
 * @param {number|false} [params.resId] false for a new partner
 * @param {number[]} [params.resIds] the records of the pager
 * @returns {Promise<{ editor: import("@html_editor/editor").Editor }>} the
 *  editor of the displayed record (updated when another record is displayed)
 */
export async function openPartnerForm({ resId = EDITED_PARTNER_ID, resIds } = {}) {
    const result = captureHtmlFieldEditor();
    await mountView({
        type: "form",
        resModel: "res.partner",
        resId: resId || undefined,
        resIds,
        arch: PARTNER_FORM_ARCH,
    });
    return result;
}

/**
 * @returns {{ editor: import("@html_editor/editor").Editor }} the editor of the
 *  last loaded html field
 */
export function captureHtmlFieldEditor() {
    const result = {};
    patchWithCleanup(HtmlField.prototype, {
        onEditorLoad(editor) {
            result.editor = editor;
            return super.onEditorLoad(...arguments);
        },
    });
    return result;
}

export async function waitForMediaManager() {
    await waitFor(".modal .media-manager-kanban-view");
    await animationFrame();
}

/**
 * In the notes of the opened partner, insert media with the "/media" command
 * of the powerbox.
 */
export async function openMediaManagerFromPowerbox(editor) {
    const editable = queryOne("[name='comment'] .odoo-editor-editable");
    await click(editable);
    // the notes of a new record are empty
    setSelection({ anchorNode: editable.querySelector("p") || editable, anchorOffset: 0 });
    await insertText(editor, "/media");
    await expectElementCount(".o-we-powerbox", 1);
    await press("Enter");
    await waitForMediaManager();
}

/** Replace an image of the notes from the toolbar. */
export async function openMediaManagerFromImageToolbar(imageSelector = "img") {
    await click(`[name='comment'] .odoo-editor-editable ${imageSelector}`);
    await tick(); // selectionchange
    await waitFor(".o-we-toolbar");
    await click(".o-we-toolbar button[name='replace_image']");
    await waitForMediaManager();
}

export const CARD = ".modal .o_kanban_record:not(.o_kanban_ghost)";

/** @param {string} name */
export function card(name) {
    return `${CARD}:has(img[alt='${name}'])`;
}

/** Names of the displayed images, from the alt of their thumbnail. */
export function getCardNames() {
    return [...document.querySelectorAll(`${CARD} .o_kanban_image img`)].map((img) => img.alt);
}
