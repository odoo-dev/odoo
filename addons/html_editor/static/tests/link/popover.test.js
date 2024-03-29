import { describe, expect, test } from "@odoo/hoot";
import { setContent } from "../_helpers/selection";
import { setupEditor } from "../_helpers/editor";
import { waitUntil, waitFor, click } from "@odoo/hoot-dom";
// import { insertText } from "../_helpers/user_actions";

describe("should open a popover", () => {
    test("should open a popover when the selection is inside a link and close outside of a link", async () => {
        const { el } = await setupEditor("<p>this is a <a>link</a></p>");
        expect(".o-we-linkpopover").toHaveCount(0);
        // selection inside a link
        setContent(el, "<p>this is a <a>li[]nk</a></p>");
        await waitFor(".o-we-linkpopover");
        expect(".o-we-linkpopover").toHaveCount(1);
        // selection outside a link
        setContent(el, "<p>this []is a <a>link</a></p>");
        await waitUntil(() => !document.querySelector(".o-we-linkpopover"));
        expect(".o-we-linkpopover").toHaveCount(0);
    });
    test("link popover should have input field for href when the link doesn't have href", async () => {
        await setupEditor("<p>this is a <a>li[]nk</a></p>");
        await waitFor(".o-we-linkpopover");
        expect(".o-we-linkpopover").toHaveCount(1);
        expect(".o_we_href_input_link").toHaveValue("");
    });
    test("link popover should have buttons for link operation when the link has href", async () => {
        await setupEditor('<p>this is a <a href="test.com">li[]nk</a></p>');
        await waitFor(".o-we-linkpopover");
        expect(".o-we-linkpopover").toHaveCount(1);
        expect(".o_we_copy_link").toHaveCount(1);
        expect(".o_we_edit_link").toHaveCount(1);
        expect(".o_we_remove_link").toHaveCount(1);
    });
});

describe("popover should switch UI depending on editing state", () => {
    test("after clicking on apply button, the popover should be closed", async () => {
        await setupEditor("<p>this is a <a>li[]nk</a></p>");
        await waitFor(".o-we-linkpopover");
        // setSelection({
        //     anchorNode: editor.document.querySelector(".o_we_href_input_link"),
        //     anchorOffset: 0,
        //     focusNode: editor.document.querySelector(".o_we_href_input_link"),
        //     focusOffset: 0,
        // });
        // click(".o_we_href_input_link");
        // insertText(editor, "http://test.com/");
        click(".o_we_apply_link");
        await waitUntil(() => !document.querySelector(".o-we-linkpopover"));
        expect(".o-we-linkpopover").toHaveCount(0);
        // expect(getContent(el)).toBe('<p>this is a <a href="http://test.com/">link</a></p>');
    });
    test("after clicking on edit button, the popover should switch to editing mode", async () => {
        await setupEditor('<p>this is a <a href="http://test.com/">li[]nk</a></p>');
        await waitFor(".o-we-linkpopover");
        click(".o_we_edit_link");
        await waitFor(".o_we_href_input_link");
        expect(".o_we_href_input_link").toHaveValue("http://test.com/");
    });
});
