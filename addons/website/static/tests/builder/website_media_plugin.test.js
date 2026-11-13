import { describe, expect, test } from "@odoo/hoot";
import { registry } from "@web/core/registry";
import { MediaManagerPlugin } from "@html_editor/backend/media_manager/media_manager_plugin";
import {
    getRecordDomain,
    WEBSITE_DOMAIN,
} from "@html_editor/main/media/media_manager/domain_helper";
import { WebsiteMediaPlugin } from "@website/builder/plugins/website_media_plugin";
import {
    defineWebsiteModels,
    setupWebsiteBuilder,
} from "@website/../tests/builder/website_helpers";

describe.current.tags("desktop");
defineWebsiteModels();

test("the website media plugin is a media manager plugin", () => {
    expect(WebsiteMediaPlugin.prototype).toBeInstanceOf(MediaManagerPlugin);
    expect(WebsiteMediaPlugin.id).toBe(MediaManagerPlugin.id);
});

test("the website media plugin is registered for the website and the translations", () => {
    expect(registry.category("website-plugins").get("WebsiteMediaPlugin")).toBe(WebsiteMediaPlugin);
    expect(registry.category("translation-plugins").get("WebsiteMediaPlugin")).toBe(
        WebsiteMediaPlugin
    );
});

test("the website media library does not depend on the edited record", () => {
    const getDomain = WebsiteMediaPlugin.prototype.getDomain;
    expect(getDomain({ resModel: "website.page", resId: 1 }, {})).toEqual(WEBSITE_DOMAIN);
    expect(getDomain({ resModel: "ir.ui.view", resId: 3 }, {})).toEqual(WEBSITE_DOMAIN);
    expect(getDomain({}, {})).toEqual(WEBSITE_DOMAIN);
    expect(getDomain({ resModel: "website.page", resId: 1 }, {})).not.toEqual(
        getRecordDomain("website.page", 1)
    );
});

test("the website builder uses the website media plugin", async () => {
    const { getEditor } = await setupWebsiteBuilder(`<p>plop</p>`);
    const mediaPlugins = getEditor().plugins.filter(
        (plugin) => plugin instanceof MediaManagerPlugin
    );
    expect(mediaPlugins).toHaveLength(1);
    expect(mediaPlugins[0]).toBeInstanceOf(WebsiteMediaPlugin);
    expect(mediaPlugins[0].getDomain({}, {})).toEqual(WEBSITE_DOMAIN);
});
