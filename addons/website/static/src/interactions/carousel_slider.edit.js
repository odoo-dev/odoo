import { CarouselSlider } from "@website/interactions/carousel_slider";
import { registry } from "@web/core/registry";

const CarouselSliderEdit = I => class extends I {
    dynamicContent = Object.assign(this.dynamicContent, {
        _root: { "t-on-content_changed": () => this.computeMaxHeight() },
    });
    // Pause carousel in edit mode.
    carouselOptions = { ride: false, pause: true };
};

registry
    .category("public.interactions.edit")
    .add("website.carousel_slider", {
        Interaction: CarouselSlider,
        mixin: CarouselSliderEdit
    });
