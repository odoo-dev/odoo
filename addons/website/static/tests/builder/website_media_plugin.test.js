import { describe, expect, test } from "@odoo/hoot";
import { MediaManagerPlugin } from "@html_editor/backend/media_manager/media_manager_plugin";
import { WEBSITE_DOMAIN } from "@html_editor/main/media/media_manager/domain_helper";
import { WebsiteMediaPlugin } from "@website/builder/plugins/website_media_plugin";
import {
    defineWebsiteModels,
    setupWebsiteBuilder,
} from "@website/../tests/builder/website_helpers";

describe.current.tags("desktop");
defineWebsiteModels();

test("the website builder shows the website media library, whatever the edited record", async () => {
    const { getEditor } = await setupWebsiteBuilder(`<p>plop</p>`);
    const mediaPlugins = getEditor().plugins.filter(
        (plugin) => plugin instanceof MediaManagerPlugin
    );
    expect(mediaPlugins).toHaveLength(1);
    expect(mediaPlugins[0]).toBeInstanceOf(WebsiteMediaPlugin);
    expect(mediaPlugins[0].getDomain({ resModel: "website.page", resId: 1 }, {})).toEqual(
        WEBSITE_DOMAIN
    );
});
