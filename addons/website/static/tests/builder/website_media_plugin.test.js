import {
    animationFrame,
    dblclick,
    expect,
    queryAll,
    queryOne,
    test,
    waitFor,
    waitForNone,
} from "@odoo/hoot";
import { mailModels } from "@mail/../tests/mail_test_helpers";
import { contains, defineModels, onRpc, serverState } from "@web/../tests/web_test_helpers";
import { dummyBase64Img, getDragHelper } from "@html_builder/../tests/helpers";
import { setSelection } from "@html_editor/../tests/_helpers/selection";
import { insertText } from "@html_editor/../tests/_helpers/user_actions";
import {
    card,
    CARD,
    defineMediaManagerViews,
    getAttachmentRecords,
    getCardNames,
    getMediaManagerViews,
    MediaTag,
    PNG_DATA_URL,
    VIDEO_CARD,
    videoCard,
    waitForMediaManager,
    YOUTUBE_URL,
} from "@html_editor/../tests/media_manager/media_manager_test_helpers";
import {
    defineWebsiteModels,
    setupWebsiteBuilder,
    setupWebsiteBuilderOeId,
    setupWebsiteBuilderWithSnippet,
} from "./website_helpers";

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
    expect(getCardNames()).toEqual(["banner.png", "logo.png", "link.png"]);

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
    expect(getCardNames()).toEqual(["banner.png", "logo.png", "link.png"]);
});

async function dropVideoSnippet() {
    const { moveTo, drop } = await contains(
        ".o_website_builder_sidebar [name='Video'] .o_snippet_thumbnail"
    ).drag();
    await moveTo(":iframe #wrap .oe_drop_zone");
    await drop(getDragHelper());
    await waitForMediaManager();
}

test("drop the video snippet: choose a video replacing it", async () => {
    await setupWebsiteBuilder(`<div><p>Text</p></div>`);
    await dropVideoSnippet();
    // only the videos can be chosen and imported
    expect(CARD).toHaveCount(queryAll(VIDEO_CARD).length);
    expect(".modal button:contains(Import video link)").toHaveCount(1);
    expect(".modal button:contains(Import image link)").toHaveCount(0);
    expect(".modal button:contains(Upload)").toHaveCount(0);

    await contains(`${videoCard("YouTube - dQw4w9WgXcQ")} .o_kanban_image`).click();
    await contains(
        ".modal .o_video_options_dialog .modal-footer .btn-primary:contains(Insert)"
    ).click();
    await waitForNone(".modal");
    await animationFrame();
    expect(":iframe .media_iframe_video").toHaveCount(1);
    expect(":iframe .media_iframe_video").not.toHaveClass("s_video");
    expect(":iframe .media_iframe_video").toHaveAttribute("data-platform", "youtube");
});

test("drop the video snippet: the imported links belong to the page of the snippet", async () => {
    onRpc("/html_editor/attachment/add_url", async (request) => {
        const { params } = await request.json();
        expect.step(`${params.res_model} ${params.res_id}`);
        return {};
    });
    const { getEditor } = await setupWebsiteBuilder(`<div><p>Text</p></div>`, {
        footerContent: `<footer><p class="website_name" data-oe-model="website" data-oe-id="1"
            data-oe-field="name">My Website</p></footer>`,
    });
    // the selection is in another record than the page
    const nameEl = getEditor().editable.querySelector(".website_name");
    setSelection({ anchorNode: nameEl.firstChild, anchorOffset: 0 });
    await dropVideoSnippet();

    await contains(".modal .btn-import-video-url").click();
    await contains(".modal input[name=url]").edit(YOUTUBE_URL, { confirm: false });
    await waitFor(".modal .o_we_url_success");
    await contains(".modal .btn-import-video-url").click();
    await expect.waitForSteps([`ir.ui.view ${setupWebsiteBuilderOeId}`]);
});

test("background video: choose a video of the media manager", async () => {
    await setupWebsiteBuilderWithSnippet("s_cover");
    await contains(":iframe .s_cover").click();
    await contains('[data-container-title="Cover"]').click();
    await contains('[data-action-id="toggleBgVideo"]').click();
    await waitForMediaManager();
    // only the videos can be chosen and imported
    expect(CARD).toHaveCount(queryAll(VIDEO_CARD).length);
    expect(".modal button:contains(Import video link)").toHaveCount(1);
    expect(".modal button:contains(Import image link)").toHaveCount(0);
    expect(".modal button:contains(Upload)").toHaveCount(0);

    // a background video plays by itself, without controls: no options to set
    await contains(`${videoCard("YouTube - dQw4w9WgXcQ")} .o_kanban_image`).click();
    await waitForNone(".modal");
    expect(":iframe .s_cover").toHaveClass("o_background_video");
    const src = new URL(queryOne(":iframe .s_cover").dataset.bgVideoSrc);
    expect(src.pathname).toBe("/embed/dQw4w9WgXcQ");
    expect(Object.fromEntries(src.searchParams)).toMatchObject({
        autoplay: "1",
        mute: "1",
        loop: "1",
        controls: "0",
        fs: "0",
    });
});
