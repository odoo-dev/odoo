import { Interaction } from "@web/public/interaction";
import { registry } from "@web/core/registry";

export class LessonStickyHeader extends Interaction {
    static selector = ".o_wslides_lesson_header";

    dynamicContent = {
        _root: {
            "t-att-style": () => ({
                top: `${this.topOffset}px`,
            }),
        },
    };

    setup() {
        this.topOffset = 0;
    }

    start() {
        this._adaptToHeaderChange();
        this.registerCleanup(
            this.services.website_menus.registerCallback(this._adaptToHeaderChange.bind(this))
        );
    }

    _adaptToHeaderChange() {
        let offset = 0;
        for (const el of this.el.ownerDocument.querySelectorAll(".o_top_fixed_element")) {
            offset += el.offsetHeight;
        }
        if (this.topOffset !== offset) {
            this.topOffset = offset;
            this.updateContent();
        }
    }
}

registry
    .category("public.interactions")
    .add("website_slides.lessonStickyHeader", LessonStickyHeader);
