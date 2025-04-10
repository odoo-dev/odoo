import { Plugin } from "@html_editor/plugin";
import { registry } from "@web/core/registry";
import { CarouselItemHeaderMiddleButtons } from "./carousel_item_header_buttons";

export class CarouselItemOptionPlugin extends Plugin {
    static id = "carouselItemOption";
    static dependencies = ["carouselOption"];

    resources = {
        builder_header_middle_buttons: {
            Component: CarouselItemHeaderMiddleButtons,
            selector:
                ".s_carousel .carousel-item, .s_quotes_carousel .carousel-item, .s_carousel_intro .carousel-item, .s_carousel_cards .carousel-item",
            props: {
                slide: async (direction, editingElement) => this.slide(direction, editingElement),
                addSlide: (editingElement) => this.addSlide(editingElement),
                removeSlide: (editingElement) => this.removeSlide(editingElement),
            },
        },
    };

    async slide(direction, editingElement) {
        const carouselEl = editingElement.closest(".carousel");
        await this.dependencies["carouselOption"].slide(direction, carouselEl);
    }

    async addSlide(editingElement) {
        const carouselEl = editingElement.closest(".carousel");
        await this.dependencies["carouselOption"].addSlide(carouselEl);
    }

    async removeSlide(editingElement) {
        const carouselEl = editingElement.closest(".carousel");
        await this.dependencies["carouselOption"].removeSlide(carouselEl);
    }
}

registry.category("website-plugins").add(CarouselItemOptionPlugin.id, CarouselItemOptionPlugin);
