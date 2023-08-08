/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { VideoSelector } from '@web_editor/components/media_dialog/video_selector';
import wTourUtils from '@website/js/tours/tour_utils';

const VIDEO_ID = 'Dpq87YCHmJc'
const VIDEO_PATH = `watch?v=${VIDEO_ID}`
const VIDEO_URL = `https://www.youtube.com/${VIDEO_PATH}`
const VIDEO_EMBED_URL = `https://www.youtube.com/embed/${VIDEO_ID}`

/**
 * The purpose of this tour is to check the media replacement flow.
 */
wTourUtils.registerWebsitePreviewTour('test_replace_media', {
    url: '/',
    test: true,
    edition: true,
}, () => [
    {
        trigger: "body",
        run: function () {
            // Patch the VideoDialog so that it does not do external calls
            // during the test (note that we don't unpatch but as the patch
            // is only done after the execution of a test_website test and
            // specific to an URL only, it is acceptable).
            // TODO if we ever give the possibility to upload its own videos,
            // this won't be necessary anymore.
            patch(VideoSelector.prototype, {
                async _getVideoURLData(src, options) {
                    if (src === VIDEO_URL || src === 'about:blank') {
                        return {platform: 'youtube', embed_url: VIDEO_EMBED_URL};
                    }
                    return super._getVideoURLData(...arguments);
                },
            });
        },
    },
    {
        content: "drop picture snippet",
        trigger: "#oe_snippets .oe_snippet[name='Picture'] .oe_snippet_thumbnail:not(.o_we_already_dragging)",
        moveTrigger: "iframe .oe_drop_zone",
        run: "drag_and_drop iframe #wrap",
    },
    {
        content: "select image",
        trigger: "iframe .s_picture figure img",
    },
    {
        content: "ensure image size is displayed",
        trigger: "#oe_snippets we-title:contains('Image') .o_we_image_weight:contains('kb')",
        run: function () {}, // check
    },
    wTourUtils.changeOption("ImageTools", 'we-select[data-name="shape_img_opt"] we-toggler'),
    wTourUtils.changeOption("ImageTools", "we-button[data-set-img-shape]"),
    {
        content: "replace image",
        trigger: "#oe_snippets we-button[data-replace-media]",
    },
    {
        content: "select svg",
        trigger: ".o_select_media_dialog img[title='sample.svg']",
    },
    {
        content: "ensure the svg doesn't have a shape",
        trigger: "iframe .s_picture figure img:not([data-shape])",
        run: function () {}, // check
    },
    {
        content: "ensure image size is not displayed",
        trigger: "#oe_snippets we-title:contains('Image'):not(:has(.o_we_image_weight:visible))",
        run: function () {}, // check
    },
    {
        content: "replace image",
        trigger: "#oe_snippets we-button[data-replace-media]",
    },
    {
        content: "go to pictogram tab",
        trigger: ".o_select_media_dialog .nav-link:contains('Icons')",
    },
    {
        content: "select an icon",
        trigger: ".o_select_media_dialog:has(.nav-link.active:contains('Icons')) .tab-content span.fa-lemon-o",
    },
    {
        content: "ensure icon block is displayed",
        trigger: "#oe_snippets we-customizeblock-options we-title:contains('Icon')",
        run: function () {}, // check
    },
    {
        content: "select footer",
        trigger: "iframe footer",
    },
    {
        content: "select icon",
        trigger: "iframe .s_picture figure span.fa-lemon-o",
    },
    {
        content: "ensure icon block is still displayed",
        trigger: "#oe_snippets we-customizeblock-options we-title:contains('Icon')",
        run: function () {}, // check
    },
    {
        content: "replace icon",
        trigger: "#oe_snippets we-button[data-replace-media]",
    },
    {
        content: "go to video tab",
        trigger: ".o_select_media_dialog .nav-link:contains('Video')",
    },
    {
        content: "click on add URL",
        trigger: "button.o_upload_media_url_button",
    },
    {
        content: "enter a video URL",
        trigger: "input.o_input.o_we_url_input",
        // Design your first web page.
        run: `text ${VIDEO_URL}`,
    },
    {
        content: "make sure the URL is valid",
        trigger: "span.o_we_url_success",
        run: function () {}, // check
    },
    {
        content: "click on add URL",
        trigger: "button.o_upload_media_url_button",
    },
    {
        content: "select video",
        trigger: `.o_select_media_dialog img[title='${VIDEO_PATH}']`,
    },
    {
        content: "wait for preview to appear",
        // "about:blank" because the VideoWidget was patched at the start of this tour
        trigger: `.o_select_media_dialog div.media_iframe_video iframe[src='${VIDEO_EMBED_URL}']`,
        run: function () {}, // check
    },
    {
        content: "confirm selection",
        trigger: ".o_select_media_dialog .modal-footer .btn-primary",
    },
    {
        content: "ensure video option block is displayed",
        trigger: "#oe_snippets we-customizeblock-options we-title:contains('Video')",
        run: function () {}, // check
    },
    {
        content: "replace image",
        trigger: "#oe_snippets we-button[data-replace-media]",
    },
    {
        content: "go to pictogram tab",
        trigger: ".o_select_media_dialog .nav-link:contains('Icons')",
    },
    {
        content: "select an icon",
        trigger: ".o_select_media_dialog:has(.nav-link.active:contains('Icons')) .tab-content span.fa-lemon-o",
    },
    {
        content: "ensure icon block is displayed",
        trigger: "#oe_snippets we-customizeblock-options we-title:contains('Icon')",
        run: function () {}, // check
    },
    {
        content: "select footer",
        trigger: "iframe footer",
    },
    {
        content: "select icon",
        trigger: "iframe .s_picture figure span.fa-lemon-o",
    },
    {
        content: "ensure icon block is still displayed",
        trigger: "#oe_snippets we-customizeblock-options we-title:contains('Icon')",
        run: function () {}, // check
    },
]);
