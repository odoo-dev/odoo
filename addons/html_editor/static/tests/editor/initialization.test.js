/** @odoo-module */

import { describe, expect, test } from "@odoo/hoot";
import { getContent, setupEditor } from "../helpers";

/**
 * content of the "init" sub suite in editor.test.js
 */

describe("No orphan inline elements compatibility mode", () => {
    test("should transform root <br> into <p>", async () => {
        const { el } = await setupEditor("ab<br>c");
        expect(getContent(el)).toBe(
            `<p style="margin-bottom: 0px;">ab</p><p style="margin-bottom: 0px;">c</p>`
        );
    });

    test("should keep <br> if necessary", async () => {
        const { el } = await setupEditor("ab<br><br>c");
        expect(getContent(el)).toBe(
            '<p style="margin-bottom: 0px;">ab</p><p style="margin-bottom: 0px;"><br></p><p style="margin-bottom: 0px;">c</p>'
        );
    });

    test("should keep multiple conecutive <br> if necessary", async () => {
        const { el } = await setupEditor("ab<br><br><br><br>c");
        expect(getContent(el)).toBe(
            '<p style="margin-bottom: 0px;">ab</p><p style="margin-bottom: 0px;"><br></p><p style="margin-bottom: 0px;"><br></p><p style="margin-bottom: 0px;"><br></p><p style="margin-bottom: 0px;">c</p>'
        );
    });

    test("should transform complex <br>", async () => {
        const { el } = await setupEditor('ab<br>c<br>d<span class="keep">xxx</span>e<br>f');
        expect(getContent(el)).toBe(
            '<p style="margin-bottom: 0px;">ab</p><p style="margin-bottom: 0px;">c</p><p style="margin-bottom: 0px;">d<span class="keep">xxx</span>e</p><p style="margin-bottom: 0px;">f</p>'
        );
    });

    test("should transform complex <br> + keep li ", async () => {
        const { el } = await setupEditor("ab<br>c<ul><li>d</li><li>e</li></ul> f<br>g");
        expect(getContent(el)).toBe(
            '<p style="margin-bottom: 0px;">ab</p><p style="margin-bottom: 0px;">c</p><ul><li>d</li><li>e</li></ul><p style="margin-bottom: 0px;"> f</p><p style="margin-bottom: 0px;">g</p>'
        );
    });

    test("should not transform <br> inside <p> (1)", async () => {
        const { el } = await setupEditor("<p>ab<br>c</p>");
        expect(getContent(el)).toBe("<p>ab<br>c</p>");
    });

    test("should not transform <br> inside <p> (2)", async () => {
        const { el } = await setupEditor("<p>ab<br>c</p><p>d<br></p>");
        expect(getContent(el)).toBe("<p>ab<br>c</p><p>d<br></p>");
    });

    test("should not transform <br> inside <p> (3)", async () => {
        const { el } = await setupEditor("xx<p>ab<br>c</p>d<br>yy");
        expect(getContent(el)).toBe(
            '<p style="margin-bottom: 0px;">xx</p><p>ab<br>c</p><p style="margin-bottom: 0px;">d</p><p style="margin-bottom: 0px;">yy</p>'
        );
    });

    test("should not transform indentation", async () => {
        const { el } = await setupEditor(`
<p>ab</p>  
<p>c</p>`);
        expect(getContent(el)).toBe(`
<p>ab</p>  
<p>c</p>`);
    });

    test("should transform root .fa", async () => {
        const { el } = await setupEditor('<p>ab</p><i class="fa fa-beer"></i><p>c</p>');
        expect(getContent(el)).toBe(
            '<p>ab</p><p style="margin-bottom: 0px;"><i class="fa fa-beer"></i></p><p>c</p>'
        );
    });
});

describe("allowInlineAtRoot options", () => {
    test("should wrap inline node inside a p by default", async () => {
        const { el } = await setupEditor("abc");
        expect(getContent(el)).toBe('<p style="margin-bottom: 0px;">abc</p>');
    });
    test("should wrap inline node inside a p if value is false", async () => {
        const { el } = await setupEditor("abc", { allowInlineAtRoot: false });
        expect(getContent(el)).toBe('<p style="margin-bottom: 0px;">abc</p>');
    });
    test("should keep inline nodes unchanged if value is true", async () => {
        const { el } = await setupEditor("abc", { allowInlineAtRoot: true });
        expect(getContent(el)).toBe("abc");
    });
});

describe("sanitize spans/fonts away", () => {
    test.todo("should sanitize attributeless spans away", async () => {
        const { el } = await setupEditor("<p><span>abc</span></p>");
        expect(getContent(el)).toBe("<p>abc</p>");
    });
    test.todo("should sanitize attributeless fonts away", async () => {
        const { el } = await setupEditor("<p><font>abc</font></p>");
        expect(getContent(el)).toBe("<p>abc</p>");
    });
});
