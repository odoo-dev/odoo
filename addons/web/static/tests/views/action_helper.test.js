import { expect, test } from "@odoo/hoot";
import { queryOne } from "@odoo/hoot-dom";
import { animationFrame, mockFetch } from "@odoo/hoot-mock";
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

test("no help: default helper, with its pictogram", async () => {
    mockPictos();
    await mountWithCleanup(ActionHelper, { props: {} });
    expect.verifySteps(["/web/static/picto/empty_folder.svg"]);
    expect(".o_nocontent_help svg.o_picto").toHaveCount(1);
    expect(".o_nocontent_help p:eq(0)").toHaveText("No data to display");
});

test("img pointing to a pictogram is inlined", async () => {
    mockPictos();
    await mountWithCleanup(ActionHelper, {
        props: {
            noContentHelp: markup`<img src="/web/static/picto/poof.svg" alt="Poof"/><p>Create a Contact</p>`,
        },
    });
    expect.verifySteps(["/web/static/picto/poof.svg"]);
    // the illustration comes first, the rest of the help is left untouched
    expect(".o_nocontent_help img").toHaveCount(0);
    expect(".o_nocontent_help > *:eq(0)").toHaveClass("o_picto");
    expect(queryOne(".o_nocontent_help svg").getAttribute("aria-label")).toBe("Poof");
    expect(".o_nocontent_help svg path").toHaveCount(1);
    expect(".o_nocontent_help > p").toHaveText("Create a Contact");
});

test("nothing is rendered until the pictogram is loaded", async () => {
    const deferred = Promise.withResolvers();
    mockPictos(() => deferred.promise);
    const mounted = mountWithCleanup(ActionHelper, {
        props: {
            noContentHelp: markup`<img src="/web/static/picto/poof.svg"/><p>Create a Contact</p>`,
        },
    });
    await animationFrame();

    // the help is held back by onWillStart: the <img> is never displayed
    expect.verifySteps(["/web/static/picto/poof.svg"]);
    expect(".o_nocontent_help").toHaveCount(0);

    deferred.resolve(PICTO);
    await mounted;

    expect(".o_nocontent_help img").toHaveCount(0);
    expect(".o_nocontent_help svg.o_picto").toHaveCount(1);
});

test("classes of the img are merged with those of the pictogram", async () => {
    mockPictos();
    await mountWithCleanup(ActionHelper, {
        props: {
            noContentHelp: markup`<img src="/web/static/picto/poof.svg" class="my_picto"/>`,
        },
    });
    expect.verifySteps(["/web/static/picto/poof.svg"]);
    expect(".o_nocontent_help svg.o_picto").toHaveClass("my_picto");
});

test("help that isn't markup is not interpreted as html", async () => {
    mockPictos();
    await mountWithCleanup(ActionHelper, {
        props: { noContentHelp: `<img src="/web/static/picto/poof.svg"/>Create a Contact` },
    });
    expect.verifySteps([]);
    expect(".o_nocontent_help svg").toHaveCount(0);
    expect(queryOne(".o_nocontent_help")).toHaveText(
        `<img src="/web/static/picto/poof.svg"/>Create a Contact`
    );
});

test("non svg images and cross origin svg are left untouched", async () => {
    mockPictos();
    await mountWithCleanup(ActionHelper, {
        props: {
            noContentHelp: markup`<img src="/web/static/img/foo.png"/><img src="https://example.com/bar.svg"/>`,
        },
    });
    expect.verifySteps([]);
    expect(".o_nocontent_help img").toHaveCount(2);
});

test("scripts and external references are stripped from the inlined svg", async () => {
    mockFetch(
        () =>
            `<svg xmlns="http://www.w3.org/2000/svg" onload="boom()"><script>boom()</script><image href="https://example.com/x.png"/><use href="#local"/></svg>`
    );
    await mountWithCleanup(ActionHelper, {
        props: { noContentHelp: markup`<img src="/web/static/picto/unsafe.svg"/>` },
    });
    const svg = queryOne(".o_nocontent_help svg");
    expect(svg.hasAttribute("onload")).toBe(false);
    expect(svg.querySelector("script")).toBe(null);
    expect(svg.querySelector("image")).toBe(null);
    expect(svg.querySelector("use").getAttribute("href")).toBe("#local");
});

test("a failing pictogram leaves the img in place", async () => {
    mockFetch(() => new Response("", { status: 404 }));
    await mountWithCleanup(ActionHelper, {
        props: { noContentHelp: markup`<img src="/web/static/picto/does_not_exist.svg"/>` },
    });
    expect(".o_nocontent_help img").toHaveCount(1);
});
