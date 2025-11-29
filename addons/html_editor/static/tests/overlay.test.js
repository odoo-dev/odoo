import { beforeEach, expect, test, describe } from "@odoo/hoot";
import { setSelection } from "./_helpers/selection";
import { click, hover, queryAll, queryOne, waitFor, waitForNone } from "@odoo/hoot-dom";
import {
    defineModels,
    fields,
    models,
    mountView,
    patchWithCleanup,
} from "@web/../tests/web_test_helpers";
import { animationFrame } from "@odoo/hoot-mock";
import { unformat } from "./_helpers/format";
import { parseHTML } from "@html_editor/utils/html";
import { closestScrollableY } from "@web/core/utils/scrolling";
import { Wysiwyg } from "@html_editor/wysiwyg";
import { insertText } from "./_helpers/user_actions";

class Test extends models.Model {
    name = fields.Char();
    txt = fields.Html();
    _records = [
        { id: 1, name: "Test", txt: "<p>text</p>".repeat(50) },
        {
            id: 2,
            name: "Test",
            txt: unformat(`
                <table><tbody>
                    <tr>
                        <td><p>cell 0</p></td>
                        <td><p>cell 1</p></td>
                    </tr>
                </tbody></table>
                ${"<p>text</p>".repeat(50)}`),
        },
        { id: 3, name: "Test", txt: "<p>text</p>" },
        {
            id: 4,
            name: "Test",
            txt: unformat(`
                <table><tbody>
                    <tr style="height: 300px">
                        <td class="a"><p>cell 0</p></td>
                    </tr>
                    <tr style="height: 250px">
                        <td><p>cell 1</p></td>
                    </tr>
                    <tr style="height: 300px">
                        <td class="b"><p>cell 2</p></td>
                    </tr>
                </tbody></table>`),
        },
    ];
}

defineModels([Test]);

test.tags("desktop");
test("Toolbar should not overflow scroll container", async () => {
    const top = (elementOrRange) => elementOrRange.getBoundingClientRect().top;
    const bottom = (elementOrRange) => elementOrRange.getBoundingClientRect().bottom;

    await mountView({
        type: "form",
        resId: 1,
        resModel: "test",
        arch: `
            <form>
                <field name="name"/>
                <field name="txt" widget="html"/>
            </form>`,
    });

    const scrollableElement = queryOne(".o_content");
    const editable = queryOne(".odoo-editor-editable");

    // Select a paragraph in the middle of the text
    const fifthParagraph = editable.children[5];
    setSelection({
        anchorNode: fifthParagraph,
        anchorOffset: 0,
        focusNode: fifthParagraph,
        focusOffset: 1,
    });
    const range = document.getSelection().getRangeAt(0);

    const toolbar = await waitFor(".o-we-toolbar");

    // Toolbar should be above the selection
    expect(bottom(toolbar)).toBeLessThan(top(range));

    // Scroll down to bring the toolbar close to the top
    let scrollStep = top(toolbar) - top(scrollableElement);
    scrollableElement.scrollTop += scrollStep;
    await animationFrame();

    // Toolbar should be below the selection
    expect(top(toolbar)).toBeGreaterThan(bottom(range));

    // Toolbar should not overflow the scroll container
    expect(top(toolbar)).toBeGreaterThan(top(scrollableElement));

    // Scroll down to make the toolbar overflow the scroll container
    scrollStep = top(toolbar) - top(scrollableElement);
    scrollableElement.scrollTop += scrollStep;
    await animationFrame();

    // Toolbar should be invisible
    expect(toolbar).not.toBeVisible();

    // Scroll up to make the toolbar visible again
    scrollableElement.scrollTop -= scrollStep;
    await animationFrame();

    expect(toolbar).toBeVisible();
});

test.tags("desktop");
test("Toolbar should be visible after scroll bar is added", async () => {
    await mountView({
        type: "form",
        resId: 3,
        resModel: "test",
        arch: `
            <form>
                <field name="name"/>
                <field name="txt" widget="html" options="{'height': 300}"/>
            </form>`,
    });

    // At this point there's no scroll bar around the editable
    const p = queryOne(".odoo-editor-editable p");

    // Add text: this creates a vertical scroll bar in the editable
    const morePs = parseHTML(document, "<p>more text</p>".repeat(20));
    p.after(...morePs.childNodes);

    // Select first paragraph
    setSelection({ anchorNode: p, anchorOffset: 0, focusNode: p, focusOffset: 1 });

    // Toolbar should be visible
    const toolbar = await waitFor(".o-we-toolbar");
    expect(toolbar).toBeVisible();
});

test.tags("desktop");
test("Toolbar should not overflow scroll container at the bottom", async () => {
    await mountView({
        type: "form",
        resId: 1,
        resModel: "test",
        arch: `
            <form>
                <field name="name"/>
                <field name="txt" widget="html" options="{'height': 300}"/>
            </form>`,
    });
    const lastP = queryOne(".odoo-editor-editable p:last-child");
    // Scroll down to bottom
    lastP.scrollIntoView();

    // Select last paragraph
    setSelection({ anchorNode: lastP, anchorOffset: 0, focusNode: lastP, focusOffset: 1 });

    // Toolbar should be visible
    const toolbar = await waitFor(".o-we-toolbar");
    expect(toolbar).toBeVisible();

    // Scroll up so that toolbar overflows the bottom of the editable
    const scrollableElement = closestScrollableY(lastP);
    scrollableElement.scrollTop -= 100;

    // Toolbar should be hidden
    await waitFor(".o-we-toolbar:not(:visible)");
    expect(toolbar).not.toBeVisible();
});

describe("powerbox", () => {
    let editor;
    beforeEach(() =>
        patchWithCleanup(Wysiwyg.prototype, {
            setup() {
                super.setup();
                editor = this.editor;
            },
        })
    );

    test.tags("desktop");
    test("Powerbox should be visible in a editable with small height", async () => {
        await mountView({
            type: "form",
            resId: 3,
            resModel: "test",
            arch: `
            <form>
                <field name="name"/>
                <field name="txt" widget="html" options="{'height': 100}"/>
            </form>`,
        });

        // Put cursor at end of first paragraph an insert "/"
        setSelection({ anchorNode: queryOne(".odoo-editor-editable p"), anchorOffset: 1 });
        insertText(editor, "/");

        // Powerbox should be visible
        const powerbox = await waitFor(".o-we-powerbox");
        expect(powerbox).toBeVisible();
    });

    test.tags("desktop");
    test("Powerbox should be visible in a editable with small height (2)", async () => {
        await mountView({
            type: "form",
            resId: 1,
            resModel: "test",
            arch: `
            <form>
                <field name="name"/>
                <field name="txt" widget="html" options="{'height': 100}"/>
            </form>`,
        });

        // Put cursor at end of third paragraph an insert "/"
        const thirdP = queryOne(".odoo-editor-editable p:nth-child(3)");
        setSelection({ anchorNode: thirdP, anchorOffset: 1 });
        insertText(editor, "/");

        // Powerbox should be visible
        const powerbox = await waitFor(".o-we-powerbox");
        expect(powerbox).toBeVisible();
    });
});

test.tags("desktop");
test("Table column control should always be displayed on top of the table", async () => {
    const top = (el) => el.getBoundingClientRect().top;
    const bottom = (el) => el.getBoundingClientRect().bottom;

    await mountView({
        type: "form",
        resId: 2,
        resModel: "test",
        arch: `
            <form>
                <field name="name"/>
                <field name="txt" widget="html"/>
            </form>`,
    });
    const scrollableElement = queryOne(".o_content");
    const table = queryOne(".odoo-editor-editable table");
    await hover(".odoo-editor-editable td");
    const columnControl = await waitFor(".o-we-table-menu[data-type='column']");

    // Table column control displayed on hover should be above the table
    expect(bottom(columnControl)).toBeLessThan(top(table));

    // Scroll down so that the table is close to the top
    const distanceToTop = top(table) - top(scrollableElement);
    scrollableElement.scrollTop += distanceToTop;
    await animationFrame();

    await hover(".odoo-editor-editable td");
    await animationFrame();

    // Table control should not be displayed (it should not overflow the scroll
    // container, nor be placed below the first row).
    expect(queryAll(".o-we-table-menu[data-type='column']")).toHaveCount(0);
});

test.tags("desktop");
test("Table menu should close on scroll", async () => {
    await mountView({
        type: "form",
        resId: 2,
        resModel: "test",
        arch: `
            <form>
                <field name="name"/>
                <field name="txt" widget="html"/>
            </form>`,
    });

    const scrollableElement = queryOne(".o_content");

    await hover(".odoo-editor-editable td");
    const columnControl = await waitFor(".o-we-table-menu[data-type='column']");
    await click(columnControl);
    await animationFrame();

    // Column menu should be displayed.
    expect(".o-dropdown--menu").toBeVisible();

    // Scroll down
    scrollableElement.scrollTop += 10;
    await waitForNone(".o-dropdown--menu");

    // Column menu should not be visible.
    expect(".o-dropdown--menu").not.toHaveCount();
});

test.tags("desktop");
test("Table row control should hide when overflowing", async () => {
    const top = (el) => el.getBoundingClientRect().top;
    const bottom = (el) => el.getBoundingClientRect().bottom;

    await mountView({
        type: "form",
        resId: 4,
        resModel: "test",
        arch: `
            <form>
                <field name="name"/>
                <field name="txt" widget="html"/>
            </form>`,
    });

    const scrollable = queryOne(".o_content");
    const table = queryOne(".odoo-editor-editable table");

    // Hover the first cell to show the table menu
    await hover(".odoo-editor-editable td.a");
    await waitFor(".o-we-table-menu[data-type='row']");
    expect(queryAll(".o-we-table-menu[data-type='row']")).toHaveCount(1);
    expect(".o-we-table-menu[data-type='row']").toBeVisible();

    // Scroll down so the table menu overflows the top of the editable area
    const toTopOffset = top(table) - top(scrollable);
    scrollable.scrollTop += toTopOffset + 10;
    await animationFrame();
    // Table menu should now be hidden
    await waitFor(".o-we-table-menu[data-type='row']");
    expect(".o-we-table-menu[data-type='row']").not.toBeVisible();

    // Hover another cell to make the table menu visible again
    await hover(".odoo-editor-editable td.b");
    await waitFor(".o-we-table-menu[data-type='row']");
    await animationFrame();
    expect(queryAll(".o-we-table-menu[data-type='row']")).toHaveCount(1);
    expect(".o-we-table-menu[data-type='row']").toBeVisible();

    // Scroll up so the table menu overflows the bottom of the editable area
    const toBottomOffset = bottom(table) - (top(scrollable) + scrollable.clientHeight);
    scrollable.scrollTop += toBottomOffset - 10;
    await animationFrame();
    // Table menu should now be hidden
    await waitFor(".o-we-table-menu[data-type='row']");
    expect(".o-we-table-menu[data-type='row']").not.toBeVisible();
});

test("Toolbar should keep stable while extending down the selection", async () => {
    const top = (el) => el.getBoundingClientRect().top;
    const left = (el) => el.getBoundingClientRect().left;

    await mountView({
        type: "form",
        resId: 1,
        resModel: "test",
        arch: `
            <form>
                <field name="name"/>
                <field name="txt" widget="html"/>
            </form>`,
    });

    const editable = queryOne(".odoo-editor-editable");

    // Select inner content of a paragraph in the middle of the text
    const fifthParagraph = editable.children[5];
    const textNode = fifthParagraph.firstChild;
    setSelection({
        anchorNode: textNode,
        anchorOffset: 0,
        focusNode: textNode,
        focusOffset: textNode.length,
    });
    const toolbar = await waitFor(".o-we-toolbar");
    const referenceTop = top(toolbar);
    const referenceLeft = left(toolbar);

    const extendSelection = (focusNode, focusOffset) => {
        setSelection({ anchorNode: textNode, anchorOffset: 0, focusNode, focusOffset });
    };

    // Extend the selection to the beginning of the following paragraph. This
    // simulates the selection obtained by moving the mouse while mousedown.
    const sixthParagraph = fifthParagraph.nextElementSibling;
    extendSelection(sixthParagraph, 0);
    await animationFrame();

    // Toolbar should not move
    expect(top(toolbar)).toBe(referenceTop);
    expect(left(toolbar)).toBe(referenceLeft);

    // Extend selection to end of paragraph
    const textNodeSixthParagraph = sixthParagraph.firstChild;
    extendSelection(textNodeSixthParagraph, textNodeSixthParagraph.length);
    await animationFrame();

    // Toolbar should not move
    expect(top(toolbar)).toBe(referenceTop);
    expect(left(toolbar)).toBe(referenceLeft);
});
