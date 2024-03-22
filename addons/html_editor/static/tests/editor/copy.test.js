/* eslint-disable prettier/prettier */
import { describe, expect, test } from "@odoo/hoot";
import { testEditor } from "../test_helpers/editor";
import { press } from "@odoo/hoot-dom";

describe("range collapsed", () => {
    test("should ignore copying an empty selection", async () => {
        await testEditor({
            contentBefore: "<p>[]</p>",
            stepFunction: async (editor) => {
                const dataTransfer = new DataTransfer();
                press("ctrl+c", { dataTransfer });
                // Check that nothing was set as clipboard content
                expect(dataTransfer.types.length).toBe(0);
            },
        });
        await testEditor({
            contentBefore: "<p>[]</p>",
            stepFunction: async (editor) => {
                const dataTransfer = new DataTransfer();
                dataTransfer.setData("text/plain", "should stay");
                press("ctrl+c", { dataTransfer });
                // Check that clipboard data was not overwritten
                expect(dataTransfer.getData("text/plain")).toBe("should stay");
            },
        });
    });
});

describe("range not collapsed", () => {
    test("should copy a selection as text/plain, text/html and text/odoo-editor", async () => {
        await testEditor({
            contentBefore: "<p>a[bcd]e</p>",
            stepFunction: async (editor) => {
                const dataTransfer = new DataTransfer();
                press("ctrl+c", { dataTransfer });
                expect(dataTransfer.getData("text/plain")).toBe("bcd");
                expect(dataTransfer.getData("text/html")).toBe("<p>bcd</p>");
                expect(dataTransfer.getData("text/odoo-editor")).toBe("<p>bcd</p>");
            },
        });
        await testEditor({
            contentBefore: "<p>[abc<br>efg]</p>",
            stepFunction: async (editor) => {
                const dataTransfer = new DataTransfer();
                press("ctrl+c", { dataTransfer });
                expect(dataTransfer.getData("text/plain")).toBe("abc\nefg");
                expect(dataTransfer.getData("text/html")).toBe("<p>abc<br>efg</p>");
                expect(dataTransfer.getData("text/odoo-editor")).toBe("<p>abc<br>efg</p>");
            },
        });
        await testEditor({
            contentBefore: `]<table><tbody><tr><td><ul><li>a[</li><li>b</li><li>c</li></ul></td><td><br></td></tr></tbody></table>`,
            stepFunction: async (editor) => {
                const dataTransfer = new DataTransfer();
                press("ctrl+c", { dataTransfer });
                expect(dataTransfer.getData("text/plain")).toBe("a");
                expect(dataTransfer.getData("text/html")).toBe(
                    "<table><tbody><tr><td><ul><li>a</li><li>b</li><li>c</li></ul></td><td><br></td></tr></tbody></table>"
                );
                expect(dataTransfer.getData("text/odoo-editor")).toBe(
                    "<table><tbody><tr><td><ul><li>a</li><li>b</li><li>c</li></ul></td><td><br></td></tr></tbody></table>"
                );
            },
        });
    });

    test("should wrap the selected text with clones of ancestors up to a block element to keep styles", async () => {
        await testEditor({
            contentBefore:
                '<p>[<span style="font-size: 16px;">Test</span> <span style="font-size: 48px;"><font style="color: rgb(255, 0, 0);">Test</font></span>]</p>',
            stepFunction: async (editor) => {
                const dataTransfer = new DataTransfer();
                press("ctrl+c", { dataTransfer });
                expect(dataTransfer.getData("text/plain")).toBe("Test Test");
                expect(dataTransfer.getData("text/html")).toBe(
                    '<p><span style="font-size: 16px;">Test</span> <span style="font-size: 48px;"><font style="color: rgb(255, 0, 0);">Test</font></span></p>'
                );
                expect(dataTransfer.getData("text/odoo-editor")).toBe(
                    '<p><span style="font-size: 16px;">Test</span> <span style="font-size: 48px;"><font style="color: rgb(255, 0, 0);">Test</font></span></p>'
                );
            },
        });
        await testEditor({
            contentBefore:
                '<p><strong><em><u><font class="text-o-color-1">hello [there]</font></u></em></strong></p>',
            stepFunction: async (editor) => {
                const dataTransfer = new DataTransfer();
                press("ctrl+c", { dataTransfer });
                expect(dataTransfer.getData("text/plain")).toBe("there");
                expect(dataTransfer.getData("text/html")).toBe(
                    '<p><strong><em><u><font class="text-o-color-1">there</font></u></em></strong></p>'
                );
                expect(dataTransfer.getData("text/odoo-editor")).toBe(
                    '<p><strong><em><u><font class="text-o-color-1">there</font></u></em></strong></p>'
                );
            },
        });
    });

    test("should copy the selection as a single list item", async () => {
        await testEditor({
            // @phoenix content adapted to be valid html
            contentBefore: "<ul><li>[First]</li><li>Second</li></ul>",
            stepFunction: async () => {
                const dataTransfer = new DataTransfer();
                press("ctrl+c", { dataTransfer });
                expect(dataTransfer.getData("text/plain")).toBe("First");
                expect(dataTransfer.getData("text/html")).toBe("<li>First</li>");
                expect(dataTransfer.getData("text/odoo-editor")).toBe("<li>First</li>");
            },
        });
        await testEditor({
            contentBefore: "<ul><li>First [List]</li><li>Second</li></ul>",
            stepFunction: async () => {
                const dataTransfer = new DataTransfer();
                press("ctrl+c", { dataTransfer });
                expect(dataTransfer.getData("text/plain")).toBe("List");
                expect(dataTransfer.getData("text/html")).toBe("<li>List</li>");
                expect(dataTransfer.getData("text/odoo-editor")).toBe("<li>List</li>");
            },
        });
        await testEditor({
            contentBefore:
                '<ul><li><span style="font-size: 48px;"><font style="color: rgb(255, 0, 0);">[First]</font></span></li><li>Second</li></ul>',
            stepFunction: async () => {
                const dataTransfer = new DataTransfer();
                press("ctrl+c", { dataTransfer });
                expect(dataTransfer.getData("text/plain")).toBe("First");
                expect(dataTransfer.getData("text/html")).toBe(
                    '<li><span style="font-size: 48px;"><font style="color: rgb(255, 0, 0);">First</font></span></li>'
                );
                expect(dataTransfer.getData("text/odoo-editor")).toBe(
                    '<li><span style="font-size: 48px;"><font style="color: rgb(255, 0, 0);">First</font></span></li>'
                );
            },
        });
    });

    test("should copy the selection as a list with multiple list items", async () => {
        await testEditor({
            // @phoenix content adapted to make it valid html
            contentBefore: "<ul><li>[First</li><li>Second]</li></ul>",
            stepFunction: async (editor) => {
                const dataTransfer = new DataTransfer();
                press("ctrl+c", { dataTransfer });
                expect(dataTransfer.getData("text/plain")).toBe("First\nSecond");
                expect(dataTransfer.getData("text/html")).toBe(
                    "<ul><li>First</li><li>Second</li></ul>"
                );
                expect(dataTransfer.getData("text/odoo-editor")).toBe(
                    "<ul><li>First</li><li>Second</li></ul>"
                );
            },
        });
    });
});
