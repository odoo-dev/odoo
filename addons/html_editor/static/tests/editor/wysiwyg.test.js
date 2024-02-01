import { describe, expect, getFixture, test } from "@odoo/hoot";
import { makeMockEnv } from "@web/../tests/_framework/env_test_helpers";
import { Wysiwyg, useWysiwyg, wysiwyg } from "@html_editor/editor/wysiwyg";
import { Component, xml } from "@odoo/owl";
import { mountWithCleanup } from "@web/../tests/web_test_helpers";
import { animationFrame } from "@odoo/hoot-mock";
import { getContent, setContent } from "../test_helpers/selection";
import { queryOne } from "@odoo/hoot-dom";

describe("wysiwig function", () => {
    test("can edit a element with wysiwyg function", async () => {
        const el = getFixture();
        const d = document.createElement("div");
        d.innerHTML = "<p>hello wysiwyg</p>";
        el.appendChild(d);
        const env = await makeMockEnv();
        expect(d.outerHTML).toBe("<div><p>hello wysiwyg</p></div>");
        const editor = wysiwyg(d, env);
        expect(d.outerHTML).toBe(
            `<div contenteditable="true" class="odoo-editor-editable"><p>hello wysiwyg</p></div>`
        );
        editor.destroy();
        expect(d.outerHTML).toBe("<div><p>hello wysiwyg</p></div>");
    });

    test("wysiwyg innerHTML option takes precedence over content of element", async () => {
        const el = getFixture();
        const d = document.createElement("div");
        d.innerHTML = "<p>hello wysiwyg</p>";
        el.appendChild(d);
        const env = await makeMockEnv();
        expect(d.outerHTML).toBe("<div><p>hello wysiwyg</p></div>");
        const editor = wysiwyg(d, env, { innerHTML: "<p>bouh</p>" });
        expect(d.outerHTML).toBe(
            `<div contenteditable="true" class="odoo-editor-editable"><p>bouh</p></div>`
        );
        editor.destroy();
        expect(d.outerHTML).toBe("<div><p>bouh</p></div>");
    });
});

describe("wysiwig hook", () => {
    test("useWysiwyg create an editor on ref", async () => {
        class TestWysiwygHook extends Component {
            static props = {};
            static template = xml`<div>coucou<p t-ref="content"/></div>`;

            setup() {
                this.editor = useWysiwyg("content");
            }
        }
        await mountWithCleanup(TestWysiwygHook);
        expect(".odoo-editor-editable").toHaveCount(1);
    });
});

describe("Wysiwyg Component", () => {
    test("Wysiwyg component can be instantiated", async () => {
        await mountWithCleanup(Wysiwyg);
        expect(".o-wysiwyg").toHaveCount(1);
        expect(".odoo-editor-editable").toHaveCount(1);
        expect(".o-we-toolbar").toHaveCount(0);

        // set the selection to a range, and check that the toolbar
        // is opened
        const el = queryOne(".odoo-editor-editable");
        expect(getContent(el)).toBe("");
        setContent(el, "hello [hoot]");
        await animationFrame();
        expect(".o-we-toolbar").toHaveCount(1);
    });

    test("Wysiwyg component can be instantiated with a permanent toolbar", async () => {
        await mountWithCleanup(Wysiwyg, { props: { toolbar: true } });
        expect(".o-wysiwyg").toHaveCount(1);
        expect(".odoo-editor-editable").toHaveCount(1);
        // no toolbar yet, since toolbar needs editor to be ready => wait for
        // dom to be mounted first before adding the toolbar
        expect(".o-we-toolbar").toHaveCount(0);
        await animationFrame();
        // toolbar should be ready now
        expect(".o-we-toolbar").toHaveCount(1);
    });
});
