import { describe, test } from "@odoo/hoot";
import { testEditor } from "../../test_helpers/editor";
import { dispatch } from "@odoo/hoot-dom";

async function tableUiMenuTest(editor) {
    const column = editor.editable.querySelector("td");
    await dispatch(column, "mousemove", {});
    if (editor._rowUi.style.visibility === "visible") {
        const paragraph = editor.editable.querySelector("p");
        const text = document.createTextNode("table ui");
        paragraph.replaceChildren(text);
    }
}

async function resizeTest(editor) {
    const column = editor.editable.querySelector("td");
    await dispatch(column, "mousemove", {});
    if (
        ["o_row_resize", "o_col_resize"].filter((resize) =>
            editor.editable.classList.contains(resize)
        ).length
    ) {
        const paragraph = editor.editable.querySelector("p");
        const text = document.createTextNode("resizeCursor");
        paragraph.replaceChildren(text);
    }
}

describe("contenteditable", () => {
    test.todo(
        "should display the table ui menu if the table element isContentEditable=true",
        async () => {
            await testEditor({
                contentBefore: `
            <p>no table ui</p>
            <table><tbody><tr>
                <td>11[]</td>
            </tr></tbody></table>
            `,
                stepFunction: tableUiMenuTest,
                contentAfter: `
            <p>table ui</p>
            <table><tbody><tr>
                <td>11[]</td>
            </tr></tbody></table>
            `,
            });
        }
    );

    test.todo(
        "should not display the table ui menu if the table element isContentEditable=false",
        async () => {
            await testEditor({
                contentBefore: `
            <p>no table ui</p>
            <table contenteditable="false"><tbody><tr>
                <td>11[]</td>
            </tr></tbody></table>
            `,
                stepFunction: tableUiMenuTest,
                contentAfter: `
            <p>no table ui</p>
            <table contenteditable="false"><tbody><tr>
                <td>11[]</td>
            </tr></tbody></table>
            `,
            });
        }
    );

    test.todo(
        "should display the resizeCursor if the table element isContentEditable=true",
        async () => {
            await testEditor({
                contentBefore: `
            <p>no resizeCursor</p>
            <table><tbody><tr>
                <td>11[]</td>
            </tr></tbody></table>
            `,
                stepFunction: resizeTest,
                contentAfter: `
            <p>resizeCursor</p>
            <table><tbody><tr>
                <td>11[]</td>
            </tr></tbody></table>
            `,
            });
        }
    );

    test("should not display the resizeCursor if the table element isContentEditable=false", async () => {
        await testEditor({
            contentBefore: `
            <p>no resizeCursor</p>
            <table contenteditable="false"><tbody><tr>
                <td>11[]</td>
            </tr></tbody></table>
            `,
            stepFunction: resizeTest,
            contentAfter: `
            <p>no resizeCursor</p>
            <table contenteditable="false"><tbody><tr>
                <td>11[]</td>
            </tr></tbody></table>
            `,
        });
    });
});
