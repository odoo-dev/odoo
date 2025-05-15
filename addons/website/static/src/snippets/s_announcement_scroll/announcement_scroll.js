import { registry } from "@web/core/registry";
import { Interaction } from "@web/public/interaction";

export class AnnouncementScroll extends Interaction {
    static selector = ".s_announcement_scroll";

    dynamicContent = {
        _root: {
            "t-att-class": () => ({
                "s_announcement_scroll_ready": this.announcementScrollReady,
                "s_announcement_scroll_page_scrolling": this.announcementScrollPageScrolling,
            }),
        },
        _window: {
            "t-on-resize": this.debounced(this.onResize, 100, {leading: true, trailing: true}),
            "t-on-scroll": this.throttled(this.onScroll),
        },
        ".s_announcement_scroll_marquee_container": {
            "t-att-style": () => ({
                "transform": `translateX(${this.parallaxPosition}%)`,
            }),
        },
    };

    setup() {
        this.marqueeContainerEl = this.el.querySelector('.s_announcement_scroll_marquee_container');
        this.marqueeItemEl = this.el.querySelector('.s_announcement_scroll_marquee_item');
        this.initialPosition = -50;
        this.parallaxPosition = this.initialPosition;
    }

    start() {
        this.updateMarqueeLayout();
        // The animation should start when the computation is done,
        // else the first element will be already further than its clones
        this.announcementScrollReady = true;
        // TODO we might want to consider to make this automatic or something
        this.updateContent();
    }

    /**
     * Handles window resize events, updating the marquee layout.
     */
    onResize() {
        this.announcementScrollReady = false;
        this.updateContent();

        this.updateMarqueeLayout();
        this.announcementScrollReady = true;
    }

    /**
     * Handles scroll events for parallax effect when enabled.
     */
    onScroll() {
        // Needed even without parallax: scrolling, when the cursor passes over
        // the element, it should not trigger the hover effect.
        this.announcementScrollPageScrolling = true;
        window.cancelAnimationFrame(this.scrollingTimeout);
        this.scrollingTimeout = this.waitForAnimationFrame(() => {
            this.announcementScrollPageScrolling = false;
        }, 200);

        // One viewport worth of scroll (window.innerHeight) equals 50% parallax
        // movement.
        if (this.el.classList.contains('s_announcement_scroll_parallax')) {
            const direction = this.el.classList.contains('s_announcement_scroll_direction_right') ? 1 : -1;
            this.parallaxPosition = this.initialPosition + ((window.scrollY / window.innerHeight) * 50 * direction);
        }
    }

    destroy() {
        this.undoMarqueeLayout();
    }

    /**
     * Undo everything done by previous @see updateMarqueeLayout calls.
     */
    undoMarqueeLayout() {
        while (this.marqueeContainerEl.children.length > 1) {
            this.marqueeContainerEl.lastChild.remove();
        }
        this.marqueeContainerEl.style.removeProperty('--marquee-item-size');
    }

    /**
     * Updates the marquee layout by calculating the items per container and
     * cloning items as needed.
     */
    updateMarqueeLayout() {
        const marqueeItemElWidth = this.marqueeItemEl.offsetWidth;
        const itemsPerContainer = Math.ceil(this.marqueeContainerEl.offsetWidth / marqueeItemElWidth);
        if (itemsPerContainer > 100) {
            return;
        }

        this.undoMarqueeLayout();

        this.marqueeContainerEl.style.setProperty("--marquee-item-size", marqueeItemElWidth);

        // * 2 to have 200% of the container width,
        // + 1 for the reverse animation (see scss)
        const cloneCount = itemsPerContainer * 2 + 1;
        for (let i = 0; i < cloneCount; i++) {
            const cloneEl = this.marqueeItemEl.cloneNode(true);
            cloneEl.classList.add('s_announcement_scroll_marquee_item_clone');
            cloneEl.prepend(document.createTextNode('\u00A0')); // NBSP
            this.marqueeContainerEl.appendChild(cloneEl);
        }
    }
}

registry
    .category("public.interactions")
    .add("website.announcement_scroll", AnnouncementScroll);

registry
    .category("public.interactions.edit")
    .add("website.announcement_scroll", {
        Interaction: AnnouncementScroll,
    });
