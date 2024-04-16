import { Wysiwyg, useWysiwyg } from "@html_editor/wysiwyg";
import { describe, expect, test } from "@odoo/hoot";
import { click, queryOne, waitFor } from "@odoo/hoot-dom";
import { animationFrame } from "@odoo/hoot-mock";
import { Component, xml } from "@odoo/owl";
import { contains, mountWithCleanup } from "@web/../tests/web_test_helpers";
import { getContent, setContent, setSelection } from "./_helpers/selection";

describe("wysiwig hook", () => {
    test("useWysiwyg create an editor on ref", async () => {
        class TestWysiwygHook extends Component {
            static props = [];
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
    /**
     *
     * @param {Object} props
     * @returns { Promise<{el: HTMLElement, wysiwyg: Wysiwyg}> } result
     */
    async function setupWysiwyg(props = {}) {
        const wysiwyg = await mountWithCleanup(Wysiwyg, { props });
        const el = /** @type {HTMLElement} **/ (queryOne(".odoo-editor-editable"));
        if (props.content) {
            // force selection to be put properly
            setContent(el, props.content);
        }
        return { wysiwyg, el };
    }

    test("Wysiwyg component can be instantiated", async () => {
        const { el } = await setupWysiwyg();
        expect(".o-wysiwyg").toHaveCount(1);
        expect(".odoo-editor-editable").toHaveCount(1);
        expect(".o-we-toolbar").toHaveCount(0);

        // set the selection to a range, and check that the toolbar
        // is opened
        expect(getContent(el)).toBe("");
        setContent(el, "hello [hoot]");
        await animationFrame();
        expect(".o-we-toolbar").toHaveCount(1);
    });

    test("Wysiwyg component can be instantiated with initial content", async () => {
        const { el } = await setupWysiwyg({ content: "<p>hello rodolpho</p>" });
        expect(el.innerHTML).toBe(`<p>hello rodolpho</p>`);
    });

    test("Wysiwyg component can be instantiated with a permanent toolbar", async () => {
        expect(".o-we-toolbar").toHaveCount(0);
        await setupWysiwyg({ toolbar: true });
        expect(".o-wysiwyg").toHaveCount(1);
        expect(".odoo-editor-editable").toHaveCount(1);
        expect(".o-we-toolbar").toHaveCount(1);
    });

    test("wysiwyg with toolbar: buttons react to selection change", async () => {
        const { el } = await setupWysiwyg({ toolbar: true, content: "<p>test some text</p>" });
        expect(el.innerHTML).toBe(`<p>test some text</p>`);

        setContent(el, "<p>test [some] text</p>");
        await waitFor(".o-we-toolbar .btn[name='bold']:not(.active)");

        await contains(".btn[name='bold']").click();
        expect(getContent(el)).toBe("<p>test <strong>[some]</strong> text</p>");
        await waitFor(".o-we-toolbar .btn[name='bold'].active");

        setContent(el, "<p>test <strong>some</strong> text[]</p>");
        await waitFor(".o-we-toolbar .btn[name='bold']:not(.active)");

        setContent(el, "<p>test <strong>some[]</strong> text</p>");
        await waitFor(".o-we-toolbar .btn[name='bold'].active");
    });

    test("wysiwyg with toolbar: properly behave when selection leaves editable", async () => {
        const { el } = await setupWysiwyg({
            toolbar: true,
            content: "<p>test <strong>[some]</strong> text</p>",
        });

        await animationFrame();
        expect(".o-we-toolbar .btn[name='bold']").toHaveClass("active");

        click(document.body);
        setSelection({
            anchorNode: document.body,
            anchorOffset: 0,
            focusNode: document.body,
            focusOffset: 0,
        });
        await animationFrame();
        expect(getContent(el)).toBe("<p>test <strong>some</strong> text</p>");
        expect(".o-we-toolbar .btn[name='bold']").toHaveClass("active");
    });

    test("wysiwyg with toolbar: remember last active selection", async () => {
        const { el } = await setupWysiwyg({
            toolbar: true,
            content: "<p>test [some] text</p>",
        });
        await waitFor(".o-we-toolbar .btn[name='bold']:not(.active)");

        click(document.body);
        setSelection({
            anchorNode: document.body,
            anchorOffset: 0,
            focusNode: document.body,
            focusOffset: 0,
        });
        await animationFrame();
        expect(getContent(el)).toBe("<p>test some text</p>");
        await waitFor(".o-we-toolbar .btn[name='bold']:not(.active)");
        click(".o-we-toolbar .btn[name='bold']");
        expect(getContent(el)).toBe("<p>test <strong>[some]</strong> text</p>");
        await waitFor(".o-we-toolbar .btn[name='bold'].active");
    });
});
