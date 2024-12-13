import { SlideCoursePage } from '@website_slides/interactions/slides_course_page';
import { registry } from "@web/core/registry";

import { _t } from "@web/core/l10n/translation";
import { rpc } from "@web/core/network/rpc";

export class WebsiteSlidesCourseList extends SlideCoursePage {
    static selector = ".o_wslides_slides_list";

    start() {
        this.channelId = this.el.getAttribute('channelId');
        this.bindedSortable = [];

        this.updateHref();
        this.bindSortable();
    }

    destroy() {
        this.unbindSortable();
    }

    bindSortable() {
        const sortableBaseParam = {
            clone: false,
            placeholderClasses: ['o_wslides_slides_list_slide_hilight', 'position-relative', 'mb-1'],
            onDrop: this.reorderSlides.bind(this),
            applyChangeOnDrop: true
        };

        const container = this.el.querySelector('ul.o_wslides_js_slides_list_container');
        this.bindedSortable.push(this.call(
            "sortable",
            "create",
            {
                ...sortableBaseParam,
                ref: { el: container },
                elements: ".o_wslides_slide_list_category",
                handle: ".o_wslides_slide_list_category_header .o_wslides_slides_list_drag",
                sortableId: "category",
            },
        ).enable());

        this.bindedSortable.push(this.call(
            "sortable",
            "create",
            {
                ...sortableBaseParam,
                ref: { el: container },
                elements: ".o_wslides_slides_list_slide:not(.o_wslides_js_slides_list_empty):not(.o_not_editable)",
                handle: ".o_wslides_slides_list_drag",
                connectGroups: true,
                groups: ".o_wslides_js_slides_list_container ul",
                sortableId: "list",
            },
        ).enable());
    }

    unbindSortable() {
        this.bindedSortable.forEach(sortable => sortable.cleanup());
    }

    checkForEmptySections() {
        const categories = this.el.querySelectorAll('.o_wslides_slide_list_category')
        for (const category of categories) {
            const categoryHeader = category.querySelector('.o_wslides_slide_list_category_header');
            const categorySlideCount = category.querySelectorAll('.o_wslides_slides_list_slide:not(.o_not_editable)').length;
            const emptyFlagContainer = categoryHeader.querySelector('.o_wslides_slides_list_drag');
            const emptyFlag = emptyFlagContainer.querySelector('small');
            if (!!emptyFlag && categorySlideCount === 0) {
                const small = document.createElement("small");
                small.classList.append("ms-1 text-muted fw-bold");
                small.innerText = _t("(empty)");
                emptyFlagContainer.appendChild(small);
            } else if (emptyFlag && categorySlideCount > 0) {
                emptyFlag.remove();
            }
        }
    }

    getSlides() {
        const categories = [];
        const listItemEls = this.el.querySelectorAll('.o_wslides_js_list_item')
        for (const listItemEl of listItemEls) {
            categories.push(parseInt(listItemEl.getAttribute('slideId')));
        }
        return categories;
    }

    reorderSlides() {
        rpc('/web/dataset/resequence', {
            model: "slide.slide",
            ids: this.getSlides(),
        }).then(function () {
            this.checkForEmptySections();
        });
    }

    updateHref() {
        const linkEls = this.el.querySelectorAll(".o_wslides_js_slides_list_slide_link")
        for (const linkEl of linkEls) {
            var href = this.el.getAttribute('href');
            var operator = href.indexOf('?') !== -1 ? '&' : '?';
            this.el.setAttribute('href', href + operator + "fullscreen=1");
        };
    }
}

registry
    .category("public.interactions")
    .add("website_slides.website_slides_course_list", WebsiteSlidesCourseList);
