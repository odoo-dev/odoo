import { expect, test } from "@odoo/hoot";

import {
    startInteractions,
    setupInteractionWhiteList,
} from "../../core/helpers";
import { hover, leave, resize } from "@odoo/hoot-dom";

setupInteractionWhiteList("website.dropdown_hoverable");

test("dropdown_hoverable does nothing if there is no header.o_hoverable_dropdown", async () => {
    const { core } = await startInteractions(``);
    expect(core.interactions.length).toBe(0);
});

test("dropdown_hoverable activate when there is a header.o_hoverable_dropdown", async () => {
    const { core } = await startInteractions(`
      <header class="o_hoverable_dropdown" style="display: flex; height: 50px; background-color: #CCFFCC;">
            <div style="margin: 10px;">
                <span>Hello World<span>
            </div>
            <div class="dropdown" style="margin: 10px;">
                Dropdown
                <a class="dropdown-toggle"></a>
                <div class="dropdown-menu">
                    <a href="#" style="display: block;">A</a>
                    <a href="#" style="display: block;">B</a>
                    <a href="#" style="display: block;">C</a>
                </div>
            </div>
        </header>
        <main style="height: 100px; background-color: #FFCCCC">
            <span style="margin: 10px;">Main</span>
        </main>
    `);
    expect(core.interactions.length).toBe(1);
});

test.tags("desktop")("dropdown_hoverable enable display on hover on desktop", async () => {
    const { core, el } = await startInteractions(`
        <header class="o_hoverable_dropdown" style="display: flex; height: 50px; background-color: #CCFFCC;">
            <div style="margin: 10px;">
                <span>Hello World<span>
            </div>
            <div class="dropdown" style="margin: 10px;">
                Dropdown
                <a class="dropdown-toggle"></a>
                <div class="dropdown-menu">
                    <a href="#" style="display: block;">A</a>
                    <a href="#" style="display: block;">B</a>
                    <a href="#" style="display: block;">C</a>
                </div>
            </div>
        </header>
        <main style="height: 100px; background-color: #FFCCCC">
            <span style="margin: 10px;">Main</span>
        </main>`);
    const dropdownEl = el.querySelector(".dropdown");
    const toggleEl = el.querySelector(".dropdown-toggle");
    const menuEl = el.querySelector(".dropdown-menu");
    const aEl = menuEl.querySelector("a");
    expect(toggleEl.classList.contains("show")).toBe(false);
    expect(aEl.checkVisibility()).toBe(false);
    await hover(dropdownEl);
    expect(toggleEl.classList.contains("show")).toBe(true);
    expect(aEl.checkVisibility()).toBe(true);
    await leave(dropdownEl);
    expect(toggleEl.classList.contains("show")).toBe(false);
    expect(aEl.checkVisibility()).toBe(false);
});
