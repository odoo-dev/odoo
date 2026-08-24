import { expect, test } from "@odoo/hoot";
import { queryOne } from "@odoo/hoot-dom";
import { mockFetch } from "@odoo/hoot-mock";
import { markup } from "@odoo/owl";
import { mountWithCleanup } from "@web/../tests/web_test_helpers";

import { ActionHelper } from "@web/views/action_helper";

const PICTO = `<svg xmlns="http://www.w3.org/2000/svg" class="o_picto" viewBox="0 0 64 64"><path d="M0 0h16v16H0z"/></svg>`;

function mockPictos(response = () => PICTO) {
    mockFetch((route) => {
        expect.step(route);
        return response(route);
    });
}

test("no help: default helper, with the default pictogram", async () => {
    mockPictos();
    await mountWithCleanup(ActionHelper, { props: {} });

    expect.verifySteps(["/web/static/picto/empty_folder.svg"]);
    expect(".o_nocontent_help svg.o_picto").toHaveCount(1);
    expect(".o_nocontent_help p:eq(0)").toHaveText("No data to display");
});

test("the pictogram of the action is displayed above its help", async () => {
    mockPictos();
    await mountWithCleanup(ActionHelper, {
        props: {
            noContentHelp: {
                pictoUrl: "/web/static/picto/poof.svg",
                help: markup`<p>Create a Contact</p>`,
            },
        },
    });

    expect.verifySteps(["/web/static/picto/poof.svg"]);
    // the illustration comes first, the rest of the help is left untouched
    expect(".o_nocontent_help > *:eq(0)").toHaveClass("o_picto");
    expect(".o_nocontent_help svg path").toHaveCount(1);
    expect(".o_nocontent_help > p").toHaveText("Create a Contact");
});

test("a help without pictoUrl falls back on the default pictogram", async () => {
    mockPictos();
    await mountWithCleanup(ActionHelper, {
        props: { noContentHelp: { help: markup`<p>Create a Contact</p>` } },
    });

    expect.verifySteps(["/web/static/picto/empty_folder.svg"]);
    expect(".o_nocontent_help svg.o_picto").toHaveCount(1);
    expect(".o_nocontent_help > p").toHaveText("Create a Contact");
});

test("help that isn't markup is not interpreted as html", async () => {
    mockPictos();
    await mountWithCleanup(ActionHelper, {
        props: { noContentHelp: { help: `<p>Create a Contact</p>` } },
    });

    expect.verifySteps(["/web/static/picto/empty_folder.svg"]);
    expect(".o_nocontent_help p").toHaveCount(0);
    expect(queryOne(".o_nocontent_help").textContent).toInclude(`<p>Create a Contact</p>`);
});

test("scripts and external references are stripped from the pictogram", async () => {
    mockFetch(
        () =>
            `<svg xmlns="http://www.w3.org/2000/svg" onload="boom()"><script>boom()</script><image href="https://example.com/x.png"/><use href="#local"/></svg>`
    );
    await mountWithCleanup(ActionHelper, {
        props: { noContentHelp: { pictoUrl: "/web/static/picto/unsafe.svg" } },
    });

    const svg = queryOne(".o_nocontent_help svg");
    expect(svg.hasAttribute("onload")).toBe(false);
    expect(svg.querySelector("script")).toBe(null);
    expect(svg.querySelector("image")).toBe(null);
    expect(svg.querySelector("use").getAttribute("href")).toBe("#local");
});

test("a failing pictogram doesn't prevent the help from being displayed", async () => {
    mockFetch(() => new Response("", { status: 404 }));
    await mountWithCleanup(ActionHelper, {
        props: {
            noContentHelp: {
                pictoUrl: "/web/static/picto/does_not_exist.svg",
                help: markup`<p>Create a Contact</p>`,
            },
        },
    });

    expect(".o_nocontent_help svg").toHaveCount(0);
    expect(".o_nocontent_help > p").toHaveText("Create a Contact");
});
