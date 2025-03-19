import { Plugin } from "@html_editor/plugin";
import { registry } from "@web/core/registry";
import { WebsiteBackgroundOption } from "./background_option";
import { CARD_PARENT_HANDLERS } from "@html_builder/website_builder/plugins/website_option_plugin";

class CarouselCardsOptionPlugin extends Plugin {
    static id = "carouselCardsOption";
    resources = {
        builder_options: [
            {
                OptionComponent: WebsiteBackgroundOption,
                selector: CARD_PARENT_HANDLERS,
                applyTo: ":scope > .s_carousel_cards_card",
                props: {
                    withColors: true,
                    withImages: true,
                    withShapes: true,
                    withColorCombinations: true,
                    withGradient: true,
                },
            },
        ],
    };
}

registry.category("website-plugins").add(CarouselCardsOptionPlugin.id, CarouselCardsOptionPlugin);
