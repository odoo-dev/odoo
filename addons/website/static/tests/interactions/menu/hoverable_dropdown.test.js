import { expect, test } from "@odoo/hoot";

import { startInteractions, setupInteractionWhiteList } from "../../core/helpers";
import { hover, resize } from "@odoo/hoot-dom";

setupInteractionWhiteList("website.dropdown_hoverable");

test("dropdown_hoverable does nothing if there is no header#top", async () => {
    const { core } = await startInteractions(`
      <div></div>
    `);
    expect(core.interactions.length).toBe(0);
});

test("dropdown_hoverable activate when there is a header#top", async () => {
    const { core } = await startInteractions(`
      <header class="o_hoverable_dropdown"></header>
    `);
    expect(core.interactions.length).toBe(1);
});

test("show dropdown menu (mouseenter)", async () => {
    const { core, el } = await startInteractions(`
        <header class="o_hoverable_dropdown">
            <div class="dropdown">
                <a class="dropdown-toggle"></a>
                <div class="dropdown-menu"></div>
            </div>
        </header>
    `);
    const a = el.querySelector("a.dropdown-toggle");
    const div = el.querySelector("div.dropdown-menu");
    await hover(a);
    expect(a.classList.contains("show")).toBe(true);
    expect(div.classList.contains("show")).toBe(true);
});

test("hide dropdown menu (mouseleave)", async () => {
    const { core, el } = await startInteractions(`
        <header class="o_hoverable_dropdown">
            <div class="dropdown">
                <a class="dropdown-toggle"></a>
                <div class="dropdown-menu"></div>
            </div>
            <span></span>
        </header>
    `);
    const a = el.querySelector("a.dropdown-toggle");
    const div = el.querySelector("div.dropdown-menu");
    const span = el.querySelector("span");
    await hover(a);
    await hover(span);
    expect(a.classList.contains("show")).toBe(false);
    expect(div.classList.contains("show")).toBe(false);
});

test("update dropdown menu display style on resize (resize)", async () => {
    const { core, el } = await startInteractions(`
        <header class="o_hoverable_dropdown">
            <div class="dropdown">
                <a class="dropdown-toggle"></a>
                <div class="dropdown-menu"></div>
            </div>
            <span></span>
        </header>
    `);
    const div = el.querySelector("div.dropdown-menu");
    await resize("header", { width: 1600, height: 900 })
    expect(window.getComputedStyle(div).marginTop).toBe('0px')
    expect(window.getComputedStyle(div).top).toBe('unset')
    await resize("header", { width: 160, height: 90 })
    expect(window.getComputedStyle(div).marginTop).toBe('')
    expect(window.getComputedStyle(div).top).toBe('')
});
