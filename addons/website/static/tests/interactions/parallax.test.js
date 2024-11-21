import { expect, test } from "@odoo/hoot";

import {
    startInteractions,
    setupInteractionWhiteList,
} from "../core/helpers";
import { scroll } from "@odoo/hoot-dom";

const customScroll = async function (el, options) {
    await scroll(el, options);
    document.dispatchEvent(new Event("scroll"));
}

setupInteractionWhiteList("website.parallax");

test("parallax does nothing if there is no .parallax", async () => {
    const { core } = await startInteractions(`
      <div></div>
    `);
    expect(core.interactions.length).toBe(0);
});

test("parallax activate when there is a .parallax", async () => {
    const { core } = await startInteractions(`
        <section class="parallax" data-scroll-background-ratio="2.5">
            <div class="s_parallax_bg">
            </div>
        </section>
    `);
    expect(core.interactions.length).toBe(1);
});

test.tags("desktop")("s_parallax_bg move up with positive speed", async () => {
    const { core, el } = await startInteractions(`
        <section style="height: 110vh; background-color: blue;"></section>
        <section class="parallax" data-scroll-background-ratio="2" style="min-height: 20vh; z-index: -1000;">
            <div class="s_parallax_bg" style="background-color: green; height: 600px; overflow: hidden;">
                <div style="height: 200px;">
                    <h1>TOP</h1>
                </div>
                <div style="height: 200px;">
                    <h1>MID</h1>
                </div>
                <div style="height: 200px;">
                    <h1>BOT</h1>
                </div>
            </div>
        </section>
        <section style="height: 100vh; background-color: red;"></section>
    `);
    el.style.overflow = "scroll";
    const parallaxBg = el.querySelector(".s_parallax_bg");
    const sectionTop = el.querySelector("section")
    await customScroll(el, { y: 0 });
    const spacing1 = parallaxBg.getBoundingClientRect().bottom - sectionTop.getBoundingClientRect().bottom;
    await customScroll(el, { y: 1000 });
    const spacing2 = parallaxBg.getBoundingClientRect().bottom - sectionTop.getBoundingClientRect().bottom;
    await customScroll(el, { y: 1500 });
    const spacing3 = parallaxBg.getBoundingClientRect().bottom - sectionTop.getBoundingClientRect().bottom;
    expect(spacing1 > spacing2).toBe(true);
    expect(spacing2 > spacing3).toBe(true);

});

test.tags("desktop")("s_parallax_bg move down with negative speed", async () => {
    const { core, el } = await startInteractions(`
        <section style="height: 110vh; background-color: blue;"></section>
        <section class="parallax" data-scroll-background-ratio="-2" style="min-height: 20vh; z-index: -1000;">
            <div class="s_parallax_bg" style="background-color: green; height: 600px; overflow: hidden;">
                <div style="height: 200px;">
                    <h1>TOP</h1>
                </div>
                <div style="height: 200px;">
                    <h1>MID</h1>
                </div>
                <div style="height: 200px;">
                    <h1>BOT</h1>
                </div>
            </div>
        </section>
        <section style="height: 100vh; background-color: red;"></section>
    `);
    el.style.overflow = "scroll";
    const parallaxBg = el.querySelector(".s_parallax_bg");
    const sectionTop = el.querySelector("section")
    await customScroll(el, { y: 0 });
    const spacing1 = parallaxBg.getBoundingClientRect().bottom - sectionTop.getBoundingClientRect().bottom;
    await customScroll(el, { y: 1000 });
    const spacing2 = parallaxBg.getBoundingClientRect().bottom - sectionTop.getBoundingClientRect().bottom;
    await customScroll(el, { y: 1500 });
    const spacing3 = parallaxBg.getBoundingClientRect().bottom - sectionTop.getBoundingClientRect().bottom;
    expect(spacing1 < spacing2).toBe(true);
    expect(spacing2 < spacing3).toBe(true);
});

test.tags("desktop")("s_parallax_bg doesn't move with no speed", async () => {
    const { core, el } = await startInteractions(`
        <section style="height: 110vh; background-color: blue;"></section>
        <section class="parallax" data-scroll-background-ratio="0" style="min-height: 20vh; z-index: -1000;">
            <div class="s_parallax_bg" style="background-color: green; height: 600px; overflow: hidden;">
                <div style="height: 200px;">
                    <h1>TOP</h1>
                </div>
                <div style="height: 200px;">
                    <h1>MID</h1>
                </div>
                <div style="height: 200px;">
                    <h1>BOT</h1>
                </div>
            </div>
        </section>
        <section style="height: 100vh; background-color: red;"></section>
    `);
    el.style.overflow = "scroll";
    const parallaxBg = el.querySelector(".s_parallax_bg");
    const sectionTop = el.querySelector("section")
    await customScroll(el, { y: 0 });
    const spacing1 = parallaxBg.getBoundingClientRect().bottom - sectionTop.getBoundingClientRect().bottom;
    await customScroll(el, { y: 1000 });
    const spacing2 = parallaxBg.getBoundingClientRect().bottom - sectionTop.getBoundingClientRect().bottom;
    await customScroll(el, { y: 1500 });
    const spacing3 = parallaxBg.getBoundingClientRect().bottom - sectionTop.getBoundingClientRect().bottom;
    expect(spacing1 == spacing2).toBe(true);
    expect(spacing2 == spacing3).toBe(true);
});
