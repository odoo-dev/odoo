import { animationFrame } from "@odoo/hoot";
import { waitFor } from "@odoo/hoot-dom";
import { fields, getService, models, mountWithCleanup } from "@web/../tests/web_test_helpers";
import { WebClient } from "@web/webclient/webclient";
import {
    getMediaManagertDialogProps,
    MediaManagerDialog,
} from "@html_editor/backend/media_manager/media_manager_dialog";

// 1x1 transparent png, loadable by `loadImage` when an image is inserted.
export const PNG_DATA_URL =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

/**
 * Same card as `html_editor.mediamanager_media_kanban`, without the fields
 * relying on other modules widgets (create_uid avatar) or server defaults
 * (create_date).
 */
export const MEDIA_MANAGER_KANBAN_ARCH = /* xml */ `
    <kanban edit="false" import="false" class="media-manager-kanban-view" js_class="media_manager_kanban">
        <field name="id"/>
        <field name="mimetype"/>
        <field name="type"/>
        <field name="public"/>
        <field name="name"/>
        <field name="description"/>
        <field name="local_url"/>
        <field name="url"/>
        <field name="is_favorite"/>
        <templates>
            <t t-name="menu">
                <div class="o_media_tags_menu o-navigable px-3 py-1">
                    <field name="media_tag_ids" widget="media_tags" options="{'color_field': 'color', 'no_create_edit': True}" placeholder="Add a tag..."/>
                </div>
            </t>
            <t t-name="card" class="o_kanban_attachment">
                <aside class="o_kanban_image">
                    <div class="o_kanban_image_wrapper">
                        <div t-if="record.type.raw_value == 'url'" class="fa fa-link fa-3x text-muted" aria-label="Image is a link"/>
                        <img t-else="" t-attf-src="#{record.local_url.raw_value}" t-att-alt="record.name.raw_value"/>
                    </div>
                </aside>
                <main class="position-absolute">
                    <div t-if="record.media_tag_ids.raw_value.length" class="o_media_tags px-2 pt-1">
                        <field name="media_tag_ids" widget="many2many_tags" options="{'color_field': 'color'}"/>
                    </div>
                    <div class="o_kanban_details_wrapper">
                        <div class="o_media_name text-truncate"><field name="display_name"/></div>
                    </div>
                </main>
            </t>
        </templates>
    </kanban>`;

export const MEDIA_MANAGER_SEARCH_ARCH = /* xml */ `
    <search string="Media">
        <field name="name" filter_domain="[('name','ilike',self)]" string="Attachment"/>
        <field name="media_tag_ids"/>
        <filter name="url_filter" string="URL" domain="[('type', '=', 'url')]"/>
        <group>
            <filter name="media_tags" string="Tags" domain="[]" context="{'group_by':'media_tag_ids'}"/>
        </group>
    </search>`;

export class MediaTag extends models.Model {
    _name = "html_editor.media.tag";

    name = fields.Char();
    color = fields.Integer();

    _records = [
        { id: 1, name: "Banner", color: 1 },
        { id: 2, name: "Logo", color: 2 },
    ];
}

/** The edited record, to which some images are attached. */
export class Partner extends models.Model {
    _name = "res.partner";

    name = fields.Char();

    _records = [
        { id: 1, name: "Edited partner" },
        { id: 2, name: "Other partner" },
    ];
}

export const ATTACHMENT_RECORDS = [
    // Displayed in the media manager of partner 1
    image(1, "banner.png", { public: true, media_tag_ids: [1] }),
    image(2, "logo.png", { public: true, is_favorite: true }),
    image(3, "partner.jpg", { mimetype: "image/jpeg", res_model: "res.partner", res_id: 1 }),
    // Not displayed in the media manager of partner 1
    image(4, "other_partner.png", { res_model: "res.partner", res_id: 2 }),
    image(5, "document.pdf", { public: true, mimetype: "application/pdf" }),
    image(6, "banner.png.crop", { public: true }),
    image(7, "banner.webp", { public: true, mimetype: "image/webp", original_id: 1 }),
    image(8, "static.png", { public: true, url: "/web/static/img/logo.png" }),
    image(9, "shape.svg", {
        public: true,
        mimetype: "image/svg+xml",
        url: "/html_editor/shape/brushes/01.svg",
    }),
    image(10, "link.png", { public: true, type: "url", url: "https://example.com/link.png" }),
];

export class IrAttachment extends models.Model {
    _name = "ir.attachment";

    name = fields.Char();
    description = fields.Char();
    mimetype = fields.Char();
    type = fields.Selection({
        selection: [
            ["binary", "File"],
            ["url", "URL"],
        ],
    });
    url = fields.Char();
    public = fields.Boolean();
    checksum = fields.Char();
    access_token = fields.Char();
    local_url = fields.Char();
    image_src = fields.Char();
    image_width = fields.Integer();
    image_height = fields.Integer();
    res_model = fields.Char();
    res_id = fields.Integer();
    original_id = fields.Many2one({ relation: "ir.attachment" });
    is_favorite = fields.Boolean();
    media_tag_ids = fields.Many2many({ relation: "html_editor.media.tag", string: "Media Tags" });

    _records = ATTACHMENT_RECORDS;

    _views = {
        kanban: MEDIA_MANAGER_KANBAN_ARCH,
        search: MEDIA_MANAGER_SEARCH_ARCH,
    };
}

function image(id, name, values = {}) {
    return {
        id,
        name,
        mimetype: "image/png",
        type: "binary",
        url: false,
        public: false,
        res_model: false,
        res_id: 0,
        original_id: false,
        is_favorite: false,
        media_tag_ids: [],
        local_url: PNG_DATA_URL,
        image_src: PNG_DATA_URL,
        ...values,
    };
}

export const mediaManagerModels = { IrAttachment, MediaTag, Partner };

/** Names of the media displayed for partner 1, in the default order (id). */
export const PARTNER_MEDIA_NAMES = ["banner.png", "logo.png", "partner.jpg"];

export const CARD = ".o_kanban_record:not(.o_kanban_ghost)";

/** @param {string} name */
export function card(name) {
    return `${CARD}:has(.o_media_name:contains(/^${name}$/))`;
}

/**
 * Open the media manager dialog for the given record, the same way the media
 * manager plugin does.
 *
 * @param {Object} [props] props overriding the default ones
 * @param {{ resModel?: string, resId?: number }} [recordInfo]
 */
export async function openMediaManager(props = {}, recordInfo = { resModel: "res.partner", resId: 1 }) {
    await mountWithCleanup(WebClient);
    getService("dialog").add(MediaManagerDialog, {
        ...getMediaManagertDialogProps(recordInfo),
        multiSelect: true,
        ...props,
    });
    await waitFor(".media-manager-kanban-view");
    await animationFrame();
}

/** @param {string} [selector] */
export function getCardNames(selector = CARD) {
    return [...document.querySelectorAll(`${selector} .o_media_name`)].map((el) =>
        el.textContent.trim()
    );
}
