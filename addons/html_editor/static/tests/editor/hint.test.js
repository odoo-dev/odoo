import { expect, test } from "@odoo/hoot";
import { setupEditor } from "../test_helpers/editor";
import { getContent, setSelection } from "../test_helpers/selection";
import { unformat } from "../test_helpers/format";
import { animationFrame } from "@odoo/hoot-mock";

test("hints are removed when editor is destroyed", async () => {
    const { el, editor } = await setupEditor("<p>[]</p>", {});
    expect(getContent(el)).toBe(`<p placeholder="Type "/" for commands" class="o-we-hint">[]</p>`);
    editor.destroy();
    expect(getContent(el)).toBe("<p>[]</p>");
});

test("should not lose track of temporary hints on split block", async () => {
    const { el, editor } = await setupEditor("<p>[]</p>", {});
    expect(getContent(el)).toBe(`<p placeholder="Type "/" for commands" class="o-we-hint">[]</p>`);
    editor.dispatch("SPLIT_BLOCK");
    await animationFrame();
    expect(getContent(el)).toBe(
        unformat(`
            <p><br></p>
            <p placeholder="Type "/" for commands" class="o-we-hint">[]<br></p>
        `)
    );
    const [firstP, secondP] = el.children;
    setSelection({ anchorNode: firstP, anchorOffset: 0, focusNode: firstP, focusOffset: 0 });
    await animationFrame();
    expect(getContent(el)).toBe(
        unformat(`
            <p placeholder="Type "/" for commands" class="o-we-hint">[]<br></p>
            <p><br></p>
        `)
    );
    setSelection({ anchorNode: secondP, anchorOffset: 0, focusNode: secondP, focusOffset: 0 });
    await animationFrame();
    expect(getContent(el)).toBe(
        unformat(`
            <p><br></p>
            <p placeholder="Type "/" for commands" class="o-we-hint">[]<br></p>
        `)
    );
});
