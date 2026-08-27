import { Interaction } from "@web/public/interaction";
import { registry } from "@web/core/registry";

import { closestScrollableY, isScrollableY } from "@web/core/utils/scrolling";

export class TwoColumnsSticky extends Interaction {
    static selector = ".s_two_columns_sticky";

        dynamicContent = {
        ".s_two_columns_sticky_sticky": {
            "t-att-style": () => ({
                top: `${this.position}px`,
            }),
        },
    };

    setup() {
        this.position = 20;

        this.scrollBound = this.process.bind(this);
        this.scrollHeight = 0;
        this.offset = 0;

        this.scrollElement =
            closestScrollableY(this.el.closest(".s_two_columns_sticky_scrollable_column")) ||
            this.el.ownerDocument.scrollingElement;
        this.scrollTarget = isScrollableY(this.scrollElement)
            ? this.scrollElement
            : this.scrollElement.ownerDocument.defaultView;
        this.tocElement = this.el.querySelector(".s_two_columns_sticky_sticky");
        this.previousPosition = -1;
    }

    start() {
        this.updateStickyColumnPosition();
        this.registerCleanup(
            this.services.website_menus.registerCallback(
                this.updateStickyColumnPosition.bind(this)
            )
        );

        this.addListener(this.scrollTarget, "scroll", this.scrollBound);
    }

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------
    updateStickyColumnPosition() {
        let position = 20;
        for (const el of this.el.ownerDocument.querySelectorAll(".o_top_fixed_element")) {
            position += el.getBoundingClientRect().bottom;
        }

        this.position = position;
        position += 0;

        if (this.previousPosition !== position) {
            this.offset = position + 50;
            this.refresh();
            this.process();
            this.previousPosition = position;
        }
        this.updateContent();
    }

    getScrollHeight() {
        return (
            this.scrollElement.scrollHeight ||
            Math.max(document.body.scrollHeight, document.documentElement.scrollHeight)
        );
    }

    refresh() {
        this.scrollHeight = this.getScrollHeight();
    }

    process() {
        const scrollHeight = this.getScrollHeight();
        if (this.scrollHeight !== scrollHeight) {
            this.refresh();
        }
    }

}

registry.category("public.interactions").add("website.two_columns_sticky", TwoColumnsSticky);
