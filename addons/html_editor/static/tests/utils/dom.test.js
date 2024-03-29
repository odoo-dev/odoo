import { describe, expect, test } from "@odoo/hoot";
import { splitTextNode } from "../../src/utils/dom_split";
import { setupEditor } from "../_helpers/editor";

describe("splitAroundUntil", () => {
    test("should split a slice of text from its inline ancestry (1)", async () => {
        const { editor, el } = await setupEditor("<p>a<font>b<span>cde</span>f</font>g</p>");
        const [p] = el.childNodes;
        const cde = p.childNodes[1].childNodes[1].firstChild;
        // We want to test with "cde" being three separate text nodes.
        splitTextNode(cde, 2);
        const cd = cde.previousSibling;
        splitTextNode(cd, 1);
        const d = cd;
        const result = editor.shared.splitAroundUntil(d, p.childNodes[1]);
        expect(result.tagName === "FONT").toBeTruthy();
        expect(p.outerHTML).toBe(
            "<p>a<font>b<span>c</span></font><font><span>d</span></font><font><span>e</span>f</font>g</p>"
        );
    });

    test("should split a slice of text from its inline ancestry (2)", async () => {
        const { editor, el } = await setupEditor("<p>a<font>b<span>cdefg</span>h</font>i</p>");
        const [p] = el.childNodes;
        const cdefg = p.childNodes[1].childNodes[1].firstChild;
        // We want to test with "cdefg" being five separate text nodes.
        splitTextNode(cdefg, 4);
        const cdef = cdefg.previousSibling;
        splitTextNode(cdef, 3);
        const cde = cdef.previousSibling;
        splitTextNode(cde, 2);
        const cd = cde.previousSibling;
        splitTextNode(cd, 1);
        const d = cd;
        const result = editor.shared.splitAroundUntil(
            [d, d.nextSibling.nextSibling],
            p.childNodes[1]
        );
        expect(result.tagName === "FONT").toBeTruthy();
        expect(p.outerHTML).toBe(
            "<p>a<font>b<span>c</span></font><font><span>def</span></font><font><span>g</span>h</font>i</p>"
        );
    });

    test("should split from a textNode that has no siblings", async () => {
        const { editor, el } = await setupEditor("<p>a<font>b<span>cde</span>f</font>g</p>");
        const [p] = el.childNodes;
        const font = p.querySelector("font");
        const cde = p.querySelector("span").firstChild;
        const result = editor.shared.splitAroundUntil(cde, font);
        expect(result.tagName === "FONT" && result !== font).toBeTruthy();
        expect(p.outerHTML).toBe(
            "<p>a<font>b</font><font><span>cde</span></font><font>f</font>g</p>"
        );
    });

    test("should not do anything (nothing to split)", async () => {
        const { editor, el } = await setupEditor("<p>a<font><span>bcd</span></font>e</p>");
        const [p] = el.childNodes;
        const bcd = p.querySelector("span").firstChild;
        const result = editor.shared.splitAroundUntil(bcd, p.childNodes[1]);
        expect(result === p.childNodes[1]).toBeTruthy();
        expect(p.outerHTML).toBe("<p>a<font><span>bcd</span></font>e</p>");
    });
});
