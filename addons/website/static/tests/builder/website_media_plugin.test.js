import { animationFrame, dblclick, expect, test, waitFor, waitForNone } from "@odoo/hoot";
import { mailModels } from "@mail/../tests/mail_test_helpers";
import { contains, defineModels, serverState } from "@web/../tests/web_test_helpers";
import { dummyBase64Img } from "@html_builder/../tests/helpers";
import { setSelection } from "@html_editor/../tests/_helpers/selection";
import { insertText } from "@html_editor/../tests/_helpers/user_actions";
import {
    card,
    defineMediaManagerViews,
    getAttachmentRecords,
    getCardNames,
    getMediaManagerViews,
    MediaTag,
    PNG_DATA_URL,
    waitForMediaManager,
} from "@html_editor/../tests/media_manager/media_manager_test_helpers";
import { defineWebsiteModels, setupWebsiteBuilder } from "./website_helpers";

class IrAttachment extends mailModels.IrAttachment {
    _records = [
        // the images of the html_editor tests, without those of their partners
        ...getAttachmentRecords().filter((record) => record.res_model !== "res.partner"),
        // Not displayed: private images, images of the website itself
        {
            id: 20,
            name: "private.png",
            mimetype: "image/png",
            type: "binary",
            public: false,
            local_url: PNG_DATA_URL,
            create_uid: serverState.userId,
        },
        {
            id: 21,
            name: "theme.png",
            mimetype: "image/png",
            type: "binary",
            public: true,
            key: "theme_x.image_1",
            local_url: PNG_DATA_URL,
            create_uid: serverState.userId,
        },
        {
            id: 22,
            name: "website_logo.png",
            mimetype: "image/png",
            type: "binary",
            public: true,
            url: "/web/image/website.1/logo",
            local_url: PNG_DATA_URL,
            create_uid: serverState.userId,
        },
    ];
    _views = getMediaManagerViews();
}

defineWebsiteModels({ includeMailModels: false });
defineMediaManagerViews();
defineModels({ ...mailModels, IrAttachment, MediaTag });

test("double click on an image: replace it from the public media library", async () => {
    await setupWebsiteBuilder(`<div><img class="a_nice_img" src="${dummyBase64Img}"></div>`);
    await dblclick(":iframe img.a_nice_img");
    await waitForMediaManager();
    expect(".o_select_media_dialog").toHaveCount(0);
    expect(getCardNames()).toEqual(["banner.png", "logo.png"]);

    await contains(`${card("logo.png")} .o_kanban_image`).click();
    await waitForNone(".modal");
    await animationFrame();
    expect(":iframe img").toHaveCount(1);
    expect(":iframe img").toHaveAttribute("alt", "logo.png");
    expect(":iframe img").toHaveAttribute("src", PNG_DATA_URL);
});

test("insert images from the powerbox of the website builder", async () => {
    const { getEditor } = await setupWebsiteBuilder(`<div><p>plop</p></div>`);
    const editor = getEditor();
    setSelection({ anchorNode: editor.editable.querySelector("p"), anchorOffset: 0 });
    await insertText(editor, "/media");
    await waitFor(".o-we-powerbox");
    await contains(".o-we-powerbox .o-we-command-name:contains(/^Media$/)").click();
    await waitForMediaManager();
    expect(getCardNames()).toEqual(["banner.png", "logo.png"]);
});
