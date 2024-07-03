import { expect, test } from "@odoo/hoot";
import { manuallyDispatchProgrammaticEvent, press } from "@odoo/hoot-dom";
import { animationFrame } from "@odoo/hoot-mock";
import { setupEditor } from "./_helpers/editor";
import { getContent, setSelection } from "./_helpers/selection";
import { insertText } from "./_helpers/user_actions";

test("should insert a banner with focus inside followed by a paragraph", async () => {
    const { el, editor } = await setupEditor("<p>Test[]</p>");
    insertText(editor, "/banner");
    await animationFrame();
    expect(".active .o-we-command-name").toHaveText("Banner Info");

    press("enter");
    expect(getContent(el)).toBe(
        `<p>Test</p><div class="o_editor_banner o_not_editable lh-1 d-flex align-items-center alert alert-info pb-0 pt-3" role="status" contenteditable="false">
                <i class="o_editor_banner_icon mb-3 fst-normal" aria-label="Banner Info">💡</i>
                <div class="w-100 ms-3" contenteditable="true">
                    <p placeholder="Type "/" for commands" class="o-we-hint">[]<br></p>
                </div>
            </div><p></p>`
    );

    insertText(editor, "/");
    await animationFrame();
    expect(".o-we-powerbox").toHaveCount(1);

    insertText(editor, "banner");
    await animationFrame();
    expect(".o-we-powerbox").toHaveCount(0, {
        message: "shouldn't be possible to add a banner inside a banner",
    });
});

test("press 'ctrl+a' inside a banner should select all the banner content", async () => {
    const { el, editor } = await setupEditor("<p>Test[]</p>");
    insertText(editor, "/bannerinfo");
    press("enter");
    insertText(editor, "Test1");
    manuallyDispatchProgrammaticEvent(editor.editable, "beforeinput", {
        inputType: "insertParagraph",
    });
    insertText(editor, "Test2");
    press(["ctrl", "a"]);
    expect(getContent(el)).toBe(
        `<p>Test</p><div class="o_editor_banner o_not_editable lh-1 d-flex align-items-center alert alert-info pb-0 pt-3" role="status" contenteditable="false">
                <i class="o_editor_banner_icon mb-3 fst-normal" aria-label="Banner Info">💡</i>
                <div class="w-100 ms-3" contenteditable="true">[
                    <p>Test1</p><p>Test2<br></p>
                ]</div>
            </div><p></p>`
    );
});

test("remove all content should preserves the first paragraph tag inside the banner", async () => {
    const { el, editor } = await setupEditor("<p>Test[]</p>");
    insertText(editor, "/bannerinfo");
    press("enter");
    insertText(editor, "Test1");
    manuallyDispatchProgrammaticEvent(editor.editable, "beforeinput", {
        inputType: "insertParagraph",
    });
    insertText(editor, "Test2");
    press(["ctrl", "a"]);
    expect(getContent(el)).toBe(
        `<p>Test</p><div class="o_editor_banner o_not_editable lh-1 d-flex align-items-center alert alert-info pb-0 pt-3" role="status" contenteditable="false">
                <i class="o_editor_banner_icon mb-3 fst-normal" aria-label="Banner Info">💡</i>
                <div class="w-100 ms-3" contenteditable="true">[
                    <p>Test1</p><p>Test2<br></p>
                ]</div>
            </div><p></p>`
    );

    press("Backspace");
    expect(getContent(el)).toBe(
        `<p>Test</p><div class="o_editor_banner o_not_editable lh-1 d-flex align-items-center alert alert-info pb-0 pt-3" role="status" contenteditable="false">
                <i class="o_editor_banner_icon mb-3 fst-normal" aria-label="Banner Info">💡</i>
                <div class="w-100 ms-3" contenteditable="true"><p placeholder="Type "/" for commands" class="o-we-hint">[]<br></p></div>
            </div><p></p>`
    );
});

test("first element of an editable that is contenteditable='false' must not be selected with ctrl+a", async () => {
    const { el, editor } = await setupEditor("<p>[]</p>");
    insertText(editor, "/bannerinfo");
    press("enter");
    // Move the selection outside of the banner
    setSelection({ anchorNode: el.querySelectorAll("p")[1], anchorOffset: 0 });
    insertText(editor, "Test1");
    manuallyDispatchProgrammaticEvent(editor.editable, "beforeinput", {
        inputType: "insertParagraph",
    });
    insertText(editor, "Test2");
    press(["ctrl", "a"]);
    expect(getContent(el)).toBe(
        `<div class="o_editor_banner o_not_editable lh-1 d-flex align-items-center alert alert-info pb-0 pt-3" role="status" contenteditable="false">
                <i class="o_editor_banner_icon mb-3 fst-normal" aria-label="Banner Info">💡</i>
                <div class="w-100 ms-3" contenteditable="true">
                    <p><br></p>
                </div>
            </div><p>[Test1</p><p>Test2<br></p>]`,
        { message: "should not select the banner if it s the first element in the editable" }
    );

    press("Backspace");
    expect(getContent(el)).toBe(
        `<div class="o_editor_banner o_not_editable lh-1 d-flex align-items-center alert alert-info pb-0 pt-3" role="status" contenteditable="false">
                <i class="o_editor_banner_icon mb-3 fst-normal" aria-label="Banner Info">💡</i>
                <div class="w-100 ms-3" contenteditable="true">
                    <p><br></p>
                </div>
            </div><p placeholder="Type "/" for commands" class="o-we-hint">[]<br></p>`
    );
});
