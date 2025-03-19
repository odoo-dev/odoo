import { Plugin } from "@html_editor/plugin";
import { registry } from "@web/core/registry";
import { WebsiteBackgroundOption } from "@html_builder/website_builder/plugins/background_option";

export const CARD_PARENT_HANDLERS =
    ".s_three_columns .row > div, .s_comparisons .row > div, .s_cards_grid .row > div, .s_cards_soft .row > div, .s_product_list .row > div, .s_newsletter_centered .row > div, .s_company_team_spotlight .row > div, .s_comparisons_horizontal .row > div, .s_company_team_grid .row > div, .s_company_team_card .row > div, .s_carousel_cards_item";

export const ONLY_BG_COLOR_SELECTOR =
    "section .row > div, .s_text_highlight, .s_mega_menu_thumbnails_footer, .s_hr, .s_cta_badge";
export const ONLY_BG_COLOR_EXCLUDE = `.s_col_no_bgcolor, .s_col_no_bgcolor.row > div, .s_masonry_block .row > div, .s_color_blocks_2 .row > div, .s_image_gallery .row > div, .s_text_cover .row > .o_not_editable, [data-snippet] :not(.oe_structure) > .s_hr, ${CARD_PARENT_HANDLERS}, .s_website_form_cover .row > .o_not_editable`;

export const BASE_ONLY_BG_IMAGE_SELECTOR = ".s_tabs .oe_structure > *, footer .oe_structure > *";
//TODO check
export const ONLY_BG_IMAGE_SELECTOR = BASE_ONLY_BG_IMAGE_SELECTOR;
export const ONLY_BG_IMAGE_EXLUDE = "";

export const BOTH_BG_COLOR_IMAGE_SELECTOR =
    "section, .carousel-item, .s_masonry_block .row > div, .s_color_blocks_2 .row > div, .parallax, .s_text_cover .row > .o_not_editable, .s_website_form_cover .row > .o_not_editable, .s_split_intro .row > .o_not_editable";
export const BOTH_BG_COLOR_IMAGE_EXCLUDE = `${BASE_ONLY_BG_IMAGE_SELECTOR}, .s_carousel_wrapper, .s_image_gallery .carousel-item, .s_google_map, .s_map, [data-snippet] :not(.oe_structure) > [data-snippet], .s_masonry_block .s_col_no_resize, .s_quotes_carousel_wrapper, .s_carousel_intro_wrapper, .s_carousel_cards_item`;

class WebsiteOptionPlugin extends Plugin {
    static id = "websiteOption";
    resources = {
        builder_options: [
            {
                OptionComponent: WebsiteBackgroundOption,
                selector: "section",
                applyTo: ":scope > .carousel:not(.s_carousel_cards)",
                props: {
                    withColors: true,
                    withImages: true,
                    withVideos: true,
                    withShapes: true,
                    withGradient: true,
                    withColorCombinations: true,
                },
            },
            {
                OptionComponent: WebsiteBackgroundOption,
                selector: BOTH_BG_COLOR_IMAGE_SELECTOR,
                exclude: BOTH_BG_COLOR_IMAGE_EXCLUDE,
                props: {
                    withColors: true,
                    withImages: true,
                    withVideos: true,
                    withShapes: true,
                    withGradient: true,
                    withColorCombinations: true,
                },
            },
            {
                OptionComponent: WebsiteBackgroundOption,
                selector: ONLY_BG_COLOR_SELECTOR,
                exclude: ONLY_BG_COLOR_EXCLUDE,
                props: {
                    withColors: true,
                    withImages: false,
                    withGradient: true,
                    withColorCombinations: true,
                },
            },
            {
                OptionComponent: WebsiteBackgroundOption,
                selector: ONLY_BG_IMAGE_SELECTOR,
                exclude: ONLY_BG_IMAGE_EXLUDE,
                props: {
                    withColors: false,
                    withImages: true,
                    withVideos: true,
                    withShapes: true,
                },
            },
        ],
    };
}

registry.category("website-plugins").add(WebsiteOptionPlugin.id, WebsiteOptionPlugin);
