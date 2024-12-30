import {
    isElementVerticallyInViewportOf,
    startInteractions,
    setupInteractionWhiteList,
} from "@web/../tests/public/helpers";

import { describe, expect, test } from "@odoo/hoot";
import { animationFrame, click, scroll } from "@odoo/hoot-dom";

import { setupTest, customScroll } from "../header/helpers";

setupInteractionWhiteList([
    "website.header_standard",
    "website.header_fixed",
    "website.header_disappears",
    "website.header_fade_out",
    "website.table_of_content",
]);

describe.current.tags("interaction_dev");

// TODO Maybe recover from `website.s_table_of_content`.
const tableTemplate = `
    <section class="s_table_of_content pt24 pb24 o_cc o_cc1">
        <div class="container">
            <div class="row s_nb_column_fixed">
                <div class="col-lg-3 s_table_of_content_navbar_wrap s_table_of_content_navbar_sticky s_table_of_content_vertical_navbar d-print-none d-none d-lg-block o_not_editable o_cc o_cc1" data-name="Navbar">
                    <div class="s_table_of_content_navbar list-group o_no_link_popover"
                        style="top: 76px; max-height: calc(100vh - 96px);"
                    >
                        <a href="#table_of_content_heading_1_1" class="table_of_content_link list-group-item list-group-item-action py-2 border-0 rounded-0 active">Intuitive system</a>
                        <a href="#table_of_content_heading_1_2" class="table_of_content_link list-group-item list-group-item-action py-2 border-0 rounded-0">Design features</a>
                    </div>
                </div>
                <div class="col-lg-9 s_table_of_content_main oe_structure oe_empty" data-name="Content">
                    <section class="s_text_block pt0 pb64" data-snippet="s_text_block" data-name="Section">
                        <div class="container s_allow_columns">
                            <h2 id="table_of_content_heading_1_1" class="h3" data-anchor="true">Intuitive system</h2>
                            <div class="s_hr pt8 pb24" data-snippet="s_hr" data-name="Separator">
                                <hr class="w-100 mx-auto"/>
                            </div>
                            <p class="lead">
                                Our intuitive system ensures effortless navigation for users of all skill levels. Its clean interface and logical organization make tasks easy to complete. With tooltips and contextual help, users quickly become productive, enjoying a smooth and efficient experience.
                            </p>
                            <br/>
                            <br/>
                            <h4 class="h5">What you see is what you get</h4>
                            <p>
                                Insert text styles like headers, bold, italic, lists, and fonts with a simple WYSIWYG editor. Flexible and easy to use, it lets you design and format documents in real time. No coding knowledge is needed, making content creation straightforward and enjoyable for everyone.
                            </p>
                            <br/>
                            <br/>
                            <h4 class="h5">Customization tool</h4>
                            <p>
                                Click and change content directly from the front-end, avoiding complex backend processes. This tool allows quick updates to text, images, and elements right on the page, streamlining your workflow and maintaining control over your content.
                            </p>
                        </div>
                    </section>
                    <section class="s_text_block pt0 pb64" data-snippet="s_text_block" data-name="Section">
                        <div class="container s_allow_columns">
                            <h2 id="table_of_content_heading_1_2" class="h3" data-anchor="true">Design features</h2>
                            <div class="s_hr pt8 pb24" data-snippet="s_hr" data-name="Separator">
                                <hr class="w-100 mx-auto"/>
                            </div>
                            <p class="lead">
                                Our design features offer a range of tools to create visually stunning websites. Utilize WYSIWYG editors, drag-and-drop building blocks, and Bootstrap-based templates for effortless customization. With professional themes and an intuitive system, you can design with ease and precision, ensuring a polished, responsive result.
                            </p>
                            <br/>
                            <br/>
                            <h4 class="h5">Building blocks system</h4>
                            <p>
                                Create pages from scratch by dragging and dropping customizable building blocks. This system simplifies web design, making it accessible to all skill levels. Combine headers, images, and text sections to build cohesive layouts quickly and efficiently.
                            </p>
                            <br/>
                            <br/>
                            <h4 class="h5">Bootstrap-Based Templates</h4>
                            <p>
                                Design Odoo templates easily with clean HTML and Bootstrap CSS. These templates offer a responsive, mobile-first design, making them simple to customize and perfect for any web project, from corporate sites to personal blogs.
                            </p>
                            <br/>
                            <br/>
                        </div>
                    </section>
                </div>
            </div>
        </div>
    </section>
`;


const getTemplate = function (headerType) {
    return `
    <header class="${headerType}" style="background-color:#CCFFCC">
        <div style="height: 50px; background-color:#33FFCC;"></div>
    </header>
    <main>
        ${tableTemplate}
    </main>
    `
}

const HEADER_SIZE = 50
const DEFAULT_OFFSET = 20

const SCROLLS = [0, 40, 250, 400, 250, 40, 0];
const SCROLLS_SPECIAL = [0, 40, 400, 40, 0];

test.tags("desktop")("table_of_content scrolls to targetted location (desktop)", async () => {
    const { core, el } = await startInteractions(`
        <div id="wrapwrap" style="overflow: scroll; max-height: 300px;">
            ${tableTemplate}
        </div>
    `);
    expect(core.interactions.length).toBe(1);
    const wrapEl = el.querySelector("#wrapwrap");
    const aEls = el.querySelectorAll("a[href]");
    const h2Els = el.querySelectorAll("h2[id]");
    // Only works if the elements are displayed
    expect(aEls[0]).toHaveClass("active");
    expect(aEls[1]).not.toHaveClass("active");
    expect(isElementVerticallyInViewportOf(aEls[0], wrapEl)).toBe(true);
    expect(isElementVerticallyInViewportOf(aEls[1], wrapEl)).toBe(true);
    expect(isElementVerticallyInViewportOf(h2Els[0], wrapEl)).toBe(true);
    expect(isElementVerticallyInViewportOf(h2Els[1], wrapEl)).toBe(false);
    await click(aEls[1]);
    await animationFrame();
    // Only works if the elements are displayed
    expect(aEls[0]).not.toHaveClass("active");
    expect(aEls[1]).toHaveClass("active");
    expect(isElementVerticallyInViewportOf(aEls[0], wrapEl)).toBe(true);
    expect(isElementVerticallyInViewportOf(aEls[1], wrapEl)).toBe(true);
    expect(isElementVerticallyInViewportOf(h2Els[0], wrapEl)).toBe(false);
    expect(isElementVerticallyInViewportOf(h2Els[1], wrapEl)).toBe(true);
});

test.tags("mobile")("table_of_content scrolls to targetted location (mobile)", async () => {
    const { core, el } = await startInteractions(`
        <div id="wrapwrap" style="overflow: scroll; max-height: 300px;">
            ${tableTemplate}
        </div>
    `);
    expect(core.interactions.length).toBe(1);
    const wrapEl = el.querySelector("#wrapwrap");
    const aEls = el.querySelectorAll("a[href]");
    const h2Els = el.querySelectorAll("h2[id]");
    // Only works if the elements are displayed
    expect(isElementVerticallyInViewportOf(aEls[0], wrapEl)).toBe(true);
    expect(isElementVerticallyInViewportOf(aEls[1], wrapEl)).toBe(true);
    expect(isElementVerticallyInViewportOf(h2Els[0], wrapEl)).toBe(true);
    expect(isElementVerticallyInViewportOf(h2Els[1], wrapEl)).toBe(false);
    await click(aEls[1]);
    await animationFrame();
    // Only works if the elements are displayed
    expect(isElementVerticallyInViewportOf(aEls[0], wrapEl)).toBe(true);
    expect(isElementVerticallyInViewportOf(aEls[1], wrapEl)).toBe(true);
    expect(isElementVerticallyInViewportOf(h2Els[0], wrapEl)).toBe(false);
    expect(isElementVerticallyInViewportOf(h2Els[1], wrapEl)).toBe(true);
});

test.tags("desktop")("table_of_content highlights reached header (desktop)", async () => {
    const { core, el } = await startInteractions(`
        <div id="wrapwrap" style="overflow: scroll; max-height: 300px;">
            ${tableTemplate}
        </div>
    `);
    expect(core.interactions.length).toBe(1);
    const wrapEl = el.querySelector("#wrapwrap");
    const aEls = el.querySelectorAll("a[href]");
    const h2Els = el.querySelectorAll("h2[id]");
    // Only works if the elements are displayed
    expect(aEls[0]).toHaveClass("active");
    expect(aEls[1]).not.toHaveClass("active");
    expect(isElementVerticallyInViewportOf(aEls[0], wrapEl)).toBe(true);
    expect(isElementVerticallyInViewportOf(aEls[1], wrapEl)).toBe(true);
    expect(isElementVerticallyInViewportOf(h2Els[0], wrapEl)).toBe(true);
    expect(isElementVerticallyInViewportOf(h2Els[1], wrapEl)).toBe(false);
    await scroll(wrapEl, { top: h2Els[1].getBoundingClientRect().top });
    await animationFrame();
    // Only works if the elements are displayed
    expect(aEls[0]).not.toHaveClass("active");
    expect(aEls[1]).toHaveClass("active");
    expect(isElementVerticallyInViewportOf(aEls[0], wrapEl)).toBe(true);
    expect(isElementVerticallyInViewportOf(aEls[1], wrapEl)).toBe(true);
    expect(isElementVerticallyInViewportOf(h2Els[0], wrapEl)).toBe(false);
    expect(isElementVerticallyInViewportOf(h2Els[1], wrapEl)).toBe(true);
});

test.tags("mobile")("table_of_content highlights reached header (mobile)", async () => {
    const { core, el } = await startInteractions(`
        <div id="wrapwrap" style="overflow: scroll; max-height: 300px;">
            ${tableTemplate}
        </div>
    `);
    expect(core.interactions.length).toBe(1);
    const wrapEl = el.querySelector("#wrapwrap");
    const aEls = el.querySelectorAll("a[href]");
    const h2Els = el.querySelectorAll("h2[id]");
    // Only works if the elements are displayed
    expect(isElementVerticallyInViewportOf(aEls[0], wrapEl)).toBe(true);
    expect(isElementVerticallyInViewportOf(aEls[1], wrapEl)).toBe(true);
    expect(isElementVerticallyInViewportOf(h2Els[0], wrapEl)).toBe(true);
    expect(isElementVerticallyInViewportOf(h2Els[1], wrapEl)).toBe(false);
    await scroll(wrapEl, { top: h2Els[1].getBoundingClientRect().top });
    await animationFrame();
    // Only works if the elements are displayed
    expect(isElementVerticallyInViewportOf(aEls[0], wrapEl)).toBe(true);
    expect(isElementVerticallyInViewportOf(aEls[1], wrapEl)).toBe(true);
    expect(isElementVerticallyInViewportOf(h2Els[0], wrapEl)).toBe(false);
    expect(isElementVerticallyInViewportOf(h2Els[1], wrapEl)).toBe(true);
});

// Since the header does not move in Hoot, we have to take into
// account the scroll in the test when checking where the bottom
// of the header is (ie. when the header is shown and scroll != 0).
const expectedTopStandard = (scroll) => {
    return scroll > HEADER_SIZE && scroll < 300 ? DEFAULT_OFFSET : HEADER_SIZE + DEFAULT_OFFSET - scroll;
};

test.tags("desktop")("table_of_content updates titles position with a o_header_standard", async () => {
    const { el, core } = await startInteractions(getTemplate("o_header_standard"));
    expect(core.interactions).toHaveLength(2);
    const wrapwrap = el.querySelector("#wrapwrap");
    const title = el.querySelector(".s_table_of_content_navbar");
    await setupTest(core, wrapwrap);
    for (let i = 1; i < SCROLLS.length; i++) {
        await customScroll(wrapwrap, SCROLLS[i - 1], SCROLLS[i]);
        expect(Math.round(parseFloat(title.style.top) - wrapwrap.getBoundingClientRect().top)).toBe(expectedTopStandard(SCROLLS[i]));
    }
});

// Since the header does not move in Hoot, the first scroll we do
// create a scroll offset we have to take into account when checking
// where the bottom of the header is (ie. when the header is shown
// and scroll != 0).
//
// TODO Investigate where this issue comes from (might be like to
// the fact the state "atTop" is updated and there is a transform
// applied to the header).
const expectedTopFixed = (scroll, offset) => {
    return scroll == 0 ? HEADER_SIZE + DEFAULT_OFFSET : HEADER_SIZE + DEFAULT_OFFSET - offset;
};

test.tags("desktop")("table_of_content updates titles position with a o_header_fixed", async () => {
    const { el, core } = await startInteractions(getTemplate("o_header_fixed"));
    expect(core.interactions).toHaveLength(2);
    const wrapwrap = el.querySelector("#wrapwrap");
    const title = el.querySelector(".s_table_of_content_navbar");
    await setupTest(core, wrapwrap);
    for (let i = 1; i < SCROLLS_SPECIAL.length; i++) {
        await customScroll(wrapwrap, SCROLLS_SPECIAL[i - 1], SCROLLS_SPECIAL[i]);
        expect(Math.round(parseFloat(title.style.top) - wrapwrap.getBoundingClientRect().top)).toBe(expectedTopFixed(SCROLLS_SPECIAL[i], SCROLLS_SPECIAL[1]));
    }
});

// Since the header does not move in Hoot, we have to take into
// account the scroll in the test when checking where the bottom
// of the header is (ie. when the header is shown and scroll != 0).
const expectedTopDisappears = (scroll) => {
    return scroll > 200 ? DEFAULT_OFFSET : HEADER_SIZE + DEFAULT_OFFSET - scroll;
};

test.tags("desktop")("table_of_content updates titles position with a o_header_disappears", async () => {
    const { el, core } = await startInteractions(getTemplate("o_header_disappears"));
    expect(core.interactions).toHaveLength(2);
    const wrapwrap = el.querySelector("#wrapwrap");
    const title = el.querySelector(".s_table_of_content_navbar");
    await setupTest(core, wrapwrap);
    for (let i = 1; i < SCROLLS_SPECIAL.length; i++) {
        await customScroll(wrapwrap, SCROLLS_SPECIAL[i - 1], SCROLLS_SPECIAL[i]);
        expect(Math.round(parseFloat(title.style.top) - wrapwrap.getBoundingClientRect().top)).toBe(expectedTopDisappears(SCROLLS_SPECIAL[i]));
    }
});

// Since the header does not move in Hoot, we have to take into
// account the scroll in the test when checking where the bottom
// of the header is (ie. when the header is shown and scroll != 0).
const expectedTopFadeOut = (scroll) => {
    return scroll > 200 ? DEFAULT_OFFSET : HEADER_SIZE + DEFAULT_OFFSET - scroll;
};

test.tags("desktop")("table_of_content updates titles position with a o_header_fade_out", async () => {
    const { el, core } = await startInteractions(getTemplate("o_header_fade_out"));
    expect(core.interactions).toHaveLength(2);
    const wrapwrap = el.querySelector("#wrapwrap");
    const title = el.querySelector(".s_table_of_content_navbar");
    await setupTest(core, wrapwrap);
    for (let i = 1; i < SCROLLS_SPECIAL.length; i++) {
        await customScroll(wrapwrap, SCROLLS_SPECIAL[i - 1], SCROLLS_SPECIAL[i]);
        expect(Math.round(parseFloat(title.style.top) - wrapwrap.getBoundingClientRect().top)).toBe(expectedTopFadeOut(SCROLLS_SPECIAL[i]));
    }
});
