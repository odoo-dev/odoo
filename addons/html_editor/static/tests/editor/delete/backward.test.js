/** @odoo-module */

import { describe, test } from "@odoo/hoot";
import { testEditor } from "../../test_helpers/editor";
import { unformat } from "../../test_helpers/format";
import { dispatch } from "@odoo/hoot-dom";
import { deleteBackward, insertText } from "../../test_helpers/user_actions";

/**
 * content of the "deleteBackward" sub suite in editor.test.js
 */

describe("Selection collapsed", () => {
    describe("Basic", () => {
        test("should do nothing", async () => {
            // TODO the addition of <br/> "correction" part was judged
            // unnecessary to enforce, the rest of the test still makes
            // sense: not removing the unique <p/> and keeping the
            // cursor at the right place.
            await testEditor({
                contentBefore: "<p>[]</p>",
                stepFunction: deleteBackward,
                contentAfter: "<p>[]</p>",
            });
            // TODO this cannot actually be tested currently as a
            // backspace/delete in that case is not even detected
            // (no input event to rollback)
            // await testEditor({
            //     contentBefore: '<p>[<br>]</p>',
            //     stepFunction: deleteBackward,
            //     // The <br> is there only to make the <p> visible.
            //     // It does not exist in VDocument and selecting it
            //     // has no meaning in the DOM.
            //     contentAfter: '<p>[]<br></p>',
            // });
            await testEditor({
                contentBefore: "<p>[]abc</p>",
                stepFunction: deleteBackward,
                contentAfter: "<p>[]abc</p>",
            });
        });

        test("should delete the first character in a paragraph", async () => {
            await testEditor({
                contentBefore: "<p>a[]bc</p>",
                stepFunction: deleteBackward,
                contentAfter: "<p>[]bc</p>",
            });
        });

        test("should delete a character within a paragraph", async () => {
            await testEditor({
                contentBefore: "<p>ab[]c</p>",
                stepFunction: deleteBackward,
                contentAfter: "<p>a[]c</p>",
            });
        });

        test.todo("should delete the last character in a paragraph", async () => {
            await testEditor({
                contentBefore: "<p>abc[]</p>",
                stepFunction: deleteBackward,
                contentAfter: "<p>ab[]</p>",
            });
            await testEditor({
                contentBefore: "<p>ab c[]</p>",
                stepFunction: deleteBackward,
                // The space should be converted to an unbreakable space
                // so it is visible.
                contentAfter: "<p>ab&nbsp;[]</p>",
            });
        });

        test("should merge a paragraph into an empty paragraph", async () => {
            await testEditor({
                contentBefore: "<p><br></p><p>[]abc</p>",
                stepFunction: deleteBackward,
                contentAfter: "<p>[]abc</p>",
            });
        });

        test.todo("should merge node correctly", async () => {
            await testEditor({
                contentBefore: '<div>a<span class="a">b</span><p>[]c</p>d</div>',
                stepFunction: deleteBackward,
                contentAfter: '<div>a<span class="a">b[]</span>c<br>d</div>',
            });
        });

        test("should ignore ZWS", async () => {
            await testEditor({
                contentBefore: "<p>ab\u200B[]c</p>",
                stepFunction: deleteBackward,
                contentAfter: "<p>a[]c</p>",
            });
        });

        test.todo("should keep inline block", async () => {
            await testEditor({
                contentBefore: "<div><p>ab</p><br><i>c[]</i></div>",
                stepFunction: deleteBackward,
                contentAfterEdit:
                    '<div><p>ab</p><br><i data-oe-zws-empty-inline="">[]\u200B</i></div>',
                contentAfter: "<div><p>ab</p><br>[]</div>",
            });
            await testEditor({
                contentBefore: '<div><p>uv</p><br><span class="style">w[]</span></div>',
                stepFunction: deleteBackward,
                contentAfterEdit:
                    '<div><p>uv</p><br><span class="style" data-oe-zws-empty-inline="">[]\u200B</span></div>',
                contentAfter: '<div><p>uv</p><br><span class="style">[]\u200B</span></div>',
            });
            await testEditor({
                contentBefore: '<div><p>cd</p><br><span class="a">e[]</span></div>',
                stepFunction: async (editor) => {
                    await deleteBackward(editor);
                    await insertText(editor, "x");
                },
                contentAfterEdit:
                    '<div><p>cd</p><br><span class="a" data-oe-zws-empty-inline="">x[]\u200B</span></div>',
                contentAfter: '<div><p>cd</p><br><span class="a">x[]</span></div>',
            });
        });

        test("should delete through ZWS and Empty Inline", async () => {
            await testEditor({
                contentBefore: '<p>ab<span class="style">c</span>d[]e</p>',
                stepFunction: async (editor) => {
                    await deleteBackward(editor);
                    await deleteBackward(editor);
                    await deleteBackward(editor);
                },
                contentAfter: "<p>a[]e</p>",
            });
        });

        test.todo("ZWS: should delete element content but keep cursor in", async () => {
            await testEditor({
                contentBefore: '<p>uv<i style="color:red">w[]</i>xy</p>',
                stepFunction: async (editor) => {
                    await deleteBackward(editor);
                    await insertText(editor, "i");
                },
                contentAfterEdit:
                    '<p>uv<i style="color:red" data-oe-zws-empty-inline="">i[]\u200B</i>xy</p>',
                contentAfter: '<p>uv<i style="color:red">i[]</i>xy</p>',
            });
            await testEditor({
                contentBefore: '<p>ab<span class="style">cd[]</span>ef</p>',
                stepFunction: async (editor) => {
                    await deleteBackward(editor);
                    await deleteBackward(editor);
                },
                contentAfterEdit:
                    '<p>ab<span class="style" data-oe-zws-empty-inline="">[]\u200B</span>ef</p>',
                contentAfter: '<p>ab<span class="style">[]\u200B</span>ef</p>',
            });
            await testEditor({
                contentBefore: '<p>ab<span class="style">cd[]</span>ef</p>',
                stepFunction: async (editor) => {
                    await deleteBackward(editor);
                    await deleteBackward(editor);
                    await insertText(editor, "x");
                },
                contentAfterEdit:
                    '<p>ab<span class="style" data-oe-zws-empty-inline="">x[]\u200B</span>ef</p>',
                contentAfter: '<p>ab<span class="style">x[]</span>ef</p>',
            });
        });

        test("should ignore ZWS and merge (1)", async () => {
            await testEditor({
                contentBefore:
                    '<p><b>ab</b><span class="removeme" data-oe-zws-empty-inline="">[]\u200B</span></p>',
                stepFunction: async (editor) => {
                    await deleteBackward(editor);
                    await insertText(editor, "x");
                },
                contentAfter: "<p><b>ax[]</b></p>",
            });
            await testEditor({
                contentBefore:
                    '<p><span class="a">cd</span><span class="removeme" data-oe-zws-empty-inline="">[]\u200B</span></p>',
                stepFunction: async (editor) => {
                    await deleteBackward(editor);
                    await insertText(editor, "x");
                },
                contentAfter: '<p><span class="a">cx[]</span></p>',
            });
            await testEditor({
                contentBefore:
                    '<p><b>ef</b><br><span class="removeme" data-oe-zws-empty-inline="">[]\u200B</span></p>',
                stepFunction: async (editor) => {
                    await deleteBackward(editor);
                    await insertText(editor, "x");
                },
                contentAfter: "<p><b>efx[]</b></p>",
            });
        });

        test.todo("should ignore ZWS and merge (2)", async () => {
            await testEditor({
                contentBefore: '<div><p>ab</p><span class="a">[]\u200B</span></div>',
                stepFunction: deleteBackward,
                contentAfter: "<div><p>ab[]</p></div>",
            });
            await testEditor({
                contentBefore: '<div><p>cd</p><br><span class="a">[]\u200B</span></div>',
                stepFunction: async (editor) => {
                    await deleteBackward(editor);
                    await insertText(editor, "x");
                },
                contentAfter: "<div><p>cd</p>x[]</div>",
            });
        });

        test.todo("should not break unbreakables", async () => {
            await testEditor({
                contentBefore:
                    `<div class="oe_unbreakable">` +
                    `<div class="oe_unbreakable">[]<br></div>` +
                    `<div class="oe_unbreakable">abc</div>` +
                    `</div>`,
                stepFunction: deleteBackward,
                contentAfter:
                    `<div class="oe_unbreakable">` +
                    `<div class="oe_unbreakable">[]<br></div>` +
                    `<div class="oe_unbreakable">abc</div>` +
                    `</div>`,
            });
            await testEditor({
                contentBefore:
                    `<div class="oe_unbreakable">` +
                    `<div class="oe_unbreakable">[ab</div>` +
                    `<div class="oe_unbreakable">cd</div>` +
                    `<div class="oe_unbreakable">e]f1</div>` +
                    `</div>`,
                stepFunction: deleteBackward,
                contentAfter:
                    `<div class="oe_unbreakable">` +
                    `<div class="oe_unbreakable">[]<br></div>` +
                    `<div class="oe_unbreakable">f1</div>` +
                    `</div>`,
            });
            await testEditor({
                contentBefore:
                    `<div class="oe_unbreakable">` +
                    `<div class="oe_unbreakable">a[b</div>` +
                    `<div class="oe_unbreakable">cd</div>` +
                    `<div class="oe_unbreakable">e]f2</div>` +
                    `</div>`,
                stepFunction: deleteBackward,
                contentAfter:
                    `<div class="oe_unbreakable">` +
                    `<div class="oe_unbreakable">a[]</div>` +
                    `<div class="oe_unbreakable">f2</div>` +
                    `</div>`,
            });
            await testEditor({
                contentBefore:
                    `<div class="oe_unbreakable">` +
                    `<div class="oe_unbreakable">3a[b</div>` +
                    `<div class="oe_unbreakable">cd</div>` +
                    `<div class="oe_unbreakable">ef]</div>` +
                    `</div>`,
                stepFunction: deleteBackward,
                contentAfter:
                    `<div class="oe_unbreakable">` +
                    `<div class="oe_unbreakable">3a[]</div>` +
                    `</div>`,
            });
            await testEditor({
                contentBefore:
                    `<div class="oe_unbreakable">` +
                    `<div class="oe_unbreakable">[ab</div>` +
                    `<div class="oe_unbreakable">cd</div>` +
                    `<div class="oe_unbreakable">ef4]</div>` +
                    `</div>`,
                stepFunction: deleteBackward,
                contentAfter:
                    `<div class="oe_unbreakable">` +
                    `<div class="oe_unbreakable">[]<br></div>` +
                    `</div>`,
            });
            await testEditor({
                contentBefore:
                    `<div class="oe_unbreakable">` +
                    `<div class="oe_unbreakable">[ab</div>` +
                    `<div class="oe_unbreakable">cd</div>` +
                    `<div class="oe_unbreakable">ef</div>` +
                    `</div>` +
                    `<div class="oe_unbreakable">` +
                    `<div class="oe_unbreakable">gh</div>` +
                    `<div class="oe_unbreakable">ij</div>` +
                    `<div class="oe_unbreakable">k]l5</div>` +
                    `</div>`,
                stepFunction: deleteBackward,
                contentAfter:
                    `<div class="oe_unbreakable">` +
                    `<div class="oe_unbreakable">[]<br></div>` +
                    `</div>` +
                    `<div class="oe_unbreakable">` +
                    `<div class="oe_unbreakable">l5</div>` +
                    `</div>`,
            });
            await testEditor({
                contentBefore:
                    `<div class="oe_unbreakable">` +
                    `<div class="oe_unbreakable">a[b</div>` +
                    `<div class="oe_unbreakable">cd</div>` +
                    `<div class="oe_unbreakable">ef</div>` +
                    `</div>` +
                    `<div class="oe_unbreakable">` +
                    `<div class="oe_unbreakable">gh</div>` +
                    `<div class="oe_unbreakable">ij</div>` +
                    `<div class="oe_unbreakable">k]l6</div>` +
                    `</div>`,
                stepFunction: deleteBackward,
                contentAfter:
                    `<div class="oe_unbreakable">` +
                    `<div class="oe_unbreakable">a[]</div>` +
                    `</div>` +
                    `<div class="oe_unbreakable">` +
                    `<div class="oe_unbreakable">l6</div>` +
                    `</div>`,
            });
            await testEditor({
                contentBefore:
                    `<div class="oe_unbreakable">` +
                    `<div class="oe_unbreakable">7a[b</div>` +
                    `<div class="oe_unbreakable">cd</div>` +
                    `<div class="oe_unbreakable">ef</div>` +
                    `</div>` +
                    `<div class="oe_unbreakable">` +
                    `<div class="oe_unbreakable">gh</div>` +
                    `<div class="oe_unbreakable">ij</div>` +
                    `<div class="oe_unbreakable">kl]</div>` +
                    `</div>`,
                stepFunction: (editor) => deleteBackward(editor),
                contentAfter:
                    `<div class="oe_unbreakable">` +
                    `<div class="oe_unbreakable">7a[]</div>` +
                    `</div>`,
            });
        });

        test("should remove empty unbreakable", async () => {
            await testEditor({
                contentBefore:
                    '<div class="accolade"><div><p>ABC</p></div><div class="colibri">X[]</div></div>',
                stepFunction: async (editor) => {
                    await deleteBackward(editor);
                    await deleteBackward(editor);
                    await deleteBackward(editor);
                },
                contentAfter: '<div class="accolade"><div><p>AB[]</p></div></div>',
            });
        });

        test.todo("should not remove empty Bootstrap column", async () => {
            await testEditor({
                contentBefore: '<div><div><p>ABC</p></div><div class="col">X[]</div></div>',
                stepFunction: async (editor) => {
                    await deleteBackward(editor);
                    await deleteBackward(editor);
                    await deleteBackward(editor);
                },
                contentAfter: '<div><div><p>ABC</p></div><div class="col">[]<br></div></div>',
            });
            await testEditor({
                contentBefore: '<div><div><p>ABC</p></div><div class="col-12">X[]</div></div>',
                stepFunction: async (editor) => {
                    await deleteBackward(editor);
                    await deleteBackward(editor);
                    await deleteBackward(editor);
                },
                contentAfter: '<div><div><p>ABC</p></div><div class="col-12">[]<br></div></div>',
            });
            await testEditor({
                contentBefore: '<div><div><p>ABC</p></div><div class="col-lg-3">X[]</div></div>',
                stepFunction: async (editor) => {
                    await deleteBackward(editor);
                    await deleteBackward(editor);
                    await deleteBackward(editor);
                },
                contentAfter: '<div><div><p>ABC</p></div><div class="col-lg-3">[]<br></div></div>',
            });
        });

        test("should remove empty unbreakable  (formated 1)", async () => {
            await testEditor({
                contentBefore: `<div><div><p>ABC</p></div><div>
X[]
</div></div>`,
                stepFunction: async (editor) => {
                    await deleteBackward(editor);
                    await deleteBackward(editor);
                    await deleteBackward(editor);
                },
                contentAfter: "<div><div><p>AB[]</p></div></div>",
            });
        });

        test("should remove empty unbreakable (formated 2)", async () => {
            await testEditor({
                contentBefore: `<div>
                                        <div>
                                            <p>ABC</p>
                                        </div>
                                        <div>X[]</div>
                                    </div>`,
                stepFunction: async (editor) => {
                    await deleteBackward(editor);
                    await deleteBackward(editor);
                    await deleteBackward(editor);
                },
                contentAfter: `<div>
                                        <div>
                                            <p>AB[]</p></div></div>`,
            });
        });

        test("should remove empty unbreakable (formated 3)", async () => {
            await testEditor({
                contentBefore: `<div>
                                        <div>
                                            <p>ABC</p>
                                        </div>
                                        <div>
                                            X[]
                                        </div>
                                    </div>`,
                stepFunction: async (editor) => {
                    await deleteBackward(editor);
                    await deleteBackward(editor);
                    await deleteBackward(editor);
                },
                contentAfter: `<div>
                                        <div>
                                            <p>AB[]</p></div></div>`,
            });
        });

        test.todo("should merge the following inline text node", async () => {
            await testEditor({
                contentBefore: "<p>abc</p>[]def",
                stepFunction: deleteBackward,
                contentAfter: "<p>abc[]def</p>",
            });
            await testEditor({
                contentBefore: "<p>abc</p>[]def<p>ghi</p>",
                stepFunction: deleteBackward,
                contentAfter: "<p>abc[]def</p><p>ghi</p>",
            });
        });

        test.todo("should delete starting white space and merge paragraphs", async () => {
            await testEditor({
                contentBefore: `<p>mollis.</p><p>\n <i>[]Pe</i><i>lentesque</i></p>`,
                stepFunction: deleteBackward,
                contentAfter: `<p>mollis.[]<i>Pelentesque</i></p>`,
            });
        });

        test('should remove contenteditable="false"', async () => {
            await testEditor({
                contentBefore: `<div><span contenteditable="false">abc</span>[]def</div>`,
                stepFunction: async (editor) => {
                    await deleteBackward(editor);
                },
                contentAfter: `<div>[]def</div>`,
            });
        });

        test('should remove contenteditable="False"', async () => {
            await testEditor({
                contentBefore: `<div><span contenteditable="False">abc</span>[]def</div>`,
                stepFunction: async (editor) => {
                    await deleteBackward(editor);
                },
                contentAfter: `<div>[]def</div>`,
            });
        });

        test('should remove contenteditable="false" at the beggining of a P', async () => {
            await testEditor({
                contentBefore: `<p>abc</p><div contenteditable="false">def</div><p>[]ghi</p>`,
                stepFunction: async (editor) => {
                    await deleteBackward(editor);
                },
                contentAfter: `<p>abc</p><p>[]ghi</p>`,
            });
        });

        test("should remove a fontawesome", async () => {
            await testEditor({
                contentBefore: `<div><p>abc</p><span class="fa"></span><p>[]def</p></div>`,
                stepFunction: async (editor) => {
                    await deleteBackward(editor);
                },
                contentAfter: `<div><p>abc</p><p>[]def</p></div>`,
            });
        });

        test.todo("should remove a media element", async () => {
            await testEditor({
                contentBefore: `<p>abc</p><div class="o_image"></div><p>[]def</p>`,
                stepFunction: async (editor) => {
                    await deleteBackward(editor);
                },
                contentAfter: `<p>abc</p><p>[]def</p>`,
            });
        });
    });

    describe("Line breaks", () => {
        describe("Single", () => {
            test("should delete a leading line break", async () => {
                await testEditor({
                    contentBefore: "<p><br>[]abc</p>",
                    stepFunction: deleteBackward,
                    contentAfter: "<p>[]abc</p>",
                });
                await testEditor({
                    contentBefore: "<p><br>[] abc</p>",
                    stepFunction: deleteBackward,
                    // The space after the <br> is expected to be parsed
                    // away, like it is in the DOM.
                    contentAfter: "<p>[]abc</p>",
                });
            });

            test("should delete a line break within a paragraph", async () => {
                await testEditor({
                    contentBefore: "<p>ab<br>[]cd</p>",
                    stepFunction: deleteBackward,
                    contentAfter: "<p>ab[]cd</p>",
                });
                await testEditor({
                    contentBefore: "<p>ab <br>[]cd</p>",
                    stepFunction: deleteBackward,
                    contentAfter: "<p>ab []cd</p>",
                });
                await testEditor({
                    contentBefore: "<p>ab<br>[] cd</p>",
                    stepFunction: deleteBackward,
                    // The space after the <br> is expected to be parsed
                    // away, like it is in the DOM.
                    contentAfter: "<p>ab[]cd</p>",
                });
            });

            test.todo("should delete a trailing line break", async () => {
                await testEditor({
                    contentBefore: "<p>abc<br><br>[]</p>",
                    stepFunction: deleteBackward,
                    contentAfter: "<p>abc[]</p>",
                });
                await testEditor({
                    contentBefore: "<p>abc<br>[]<br></p>",
                    stepFunction: deleteBackward,
                    contentAfter: "<p>abc[]</p>",
                });
                await testEditor({
                    contentBefore: "<p>abc <br><br>[]</p>",
                    stepFunction: deleteBackward,
                    contentAfter: "<p>abc&nbsp;[]</p>",
                });
            });

            test("should delete a character and a line break, emptying a paragraph", async () => {
                await testEditor({
                    contentBefore: "<p>aaa</p><p><br>a[]</p>",
                    stepFunction: async (editor) => {
                        await deleteBackward(editor);
                        await deleteBackward(editor);
                    },
                    contentAfter: "<p>aaa</p><p>[]<br></p>",
                });
            });

            test("should delete a character after a trailing line break", async () => {
                await testEditor({
                    contentBefore: "<p>ab<br>c[]</p>",
                    stepFunction: deleteBackward,
                    // A new <br> should be insterted, to make the first one
                    // visible.
                    contentAfter: "<p>ab<br>[]<br></p>",
                });
            });
        });

        describe("Consecutive", () => {
            test("should merge a paragraph with 4 <br> into a paragraph with text", async () => {
                // 1
                await testEditor({
                    contentBefore: "<p>ab</p><p>[]<br><br><br><br></p><p>cd</p>",
                    stepFunction: deleteBackward,
                    contentAfter: "<p>ab[]<br><br><br><br></p><p>cd</p>",
                });
            });

            test.todo("should delete a line break (1)", async () => {
                // 2-1
                await testEditor({
                    contentBefore: "<p>ab</p><p><br>[]<br><br><br></p><p>cd</p>",
                    stepFunction: deleteBackward,
                    contentAfter: "<p>ab</p><p>[]<br><br><br></p><p>cd</p>",
                });
            });

            test.todo(
                "should delete a line break, then merge a paragraph with 3 <br> into a paragraph with text",
                async () => {
                    // 2-2
                    await testEditor({
                        contentBefore: "<p>ab</p><p><br>[]<br><br><br></p><p>cd</p>",
                        stepFunction: async (editor) => {
                            await deleteBackward(editor);
                            await deleteBackward(editor);
                        },
                        contentAfter: "<p>ab[]<br><br><br></p><p>cd</p>",
                    });
                }
            );

            test.todo("should delete a line break (2)", async () => {
                // 3-1
                await testEditor({
                    contentBefore: "<p>ab</p><p><br><br>[]<br><br></p><p>cd</p>",
                    stepFunction: deleteBackward,
                    contentAfter: "<p>ab</p><p><br>[]<br><br></p><p>cd</p>",
                });
            });

            test.todo("should delete two line breaks (3)", async () => {
                // 3-2
                await testEditor({
                    contentBefore: "<p>ab</p><p><br><br>[]<br><br></p><p>cd</p>",
                    stepFunction: async (editor) => {
                        await deleteBackward(editor);
                        await deleteBackward(editor);
                    },
                    contentAfter: "<p>ab</p><p>[]<br><br></p><p>cd</p>",
                });
            });

            test.todo(
                "should delete two line breaks, then merge a paragraph with 3 <br> into a paragraph with text",
                async () => {
                    // 3-3
                    await testEditor({
                        contentBefore: "<p>ab</p><p><br><br>[]<br><br></p><p>cd</p>",
                        stepFunction: async (editor) => {
                            await deleteBackward(editor);
                            await deleteBackward(editor);
                            await deleteBackward(editor);
                        },
                        contentAfter: "<p>ab[]<br><br></p><p>cd</p>",
                    });
                }
            );

            test.todo("should delete a line break when several", async () => {
                // 4-1
                await testEditor({
                    contentBefore: "<p>ab</p><p><br><br><br>[]<br></p><p>cd</p>",
                    stepFunction: deleteBackward,
                    // A trailing line break is rendered as two <br>.
                    contentAfter: "<p>ab</p><p><br><br>[]<br></p><p>cd</p>",
                });
                // 5-1
                await testEditor({
                    contentBefore: "<p>ab</p><p><br><br><br><br>[]</p><p>cd</p>",
                    stepFunction: deleteBackward,
                    // This should be identical to 4-1
                    contentAfter: "<p>ab</p><p><br><br>[]<br></p><p>cd</p>",
                });
            });

            test.todo("should delete two line breaks", async () => {
                // 4-2
                await testEditor({
                    contentBefore: "<p>ab</p><p><br><br><br>[]<br></p><p>cd</p>",
                    stepFunction: async (editor) => {
                        await deleteBackward(editor);
                        await deleteBackward(editor);
                    },
                    // A trailing line break is rendered as two <br>.
                    contentAfter: "<p>ab</p><p><br>[]<br></p><p>cd</p>",
                });
                // 5-2
                await testEditor({
                    contentBefore: "<p>ab</p><p><br><br><br><br>[]</p><p>cd</p>",
                    stepFunction: async (editor) => {
                        await deleteBackward(editor);
                        await deleteBackward(editor);
                    },
                    // This should be identical to 4-2
                    contentAfter: "<p>ab</p><p><br>[]<br></p><p>cd</p>",
                });
            });

            test.todo("should delete three line breaks (emptying a paragraph)", async () => {
                // 4-3
                await testEditor({
                    contentBefore: "<p>ab</p><p><br><br><br>[]<br></p><p>cd</p>",
                    stepFunction: async (editor) => {
                        await deleteBackward(editor);
                        await deleteBackward(editor);
                        await deleteBackward(editor);
                    },
                    contentAfter: "<p>ab</p><p>[]<br></p><p>cd</p>",
                });
                // 5-3
                await testEditor({
                    contentBefore: "<p>ab</p><p><br><br><br><br>[]</p><p>cd</p>",
                    stepFunction: async (editor) => {
                        await deleteBackward(editor);
                        await deleteBackward(editor);
                        await deleteBackward(editor);
                    },
                    // This should be identical to 4-3
                    contentAfter: "<p>ab</p><p>[]<br></p><p>cd</p>",
                });
            });

            test.todo(
                "should delete three line breaks, then merge an empty parargaph into a paragraph with text",
                async () => {
                    // 4-4
                    await testEditor({
                        contentBefore: "<p>ab</p><p><br><br><br>[]<br></p><p>cd</p>",
                        stepFunction: async (editor) => {
                            await deleteBackward(editor);
                            await deleteBackward(editor);
                            await deleteBackward(editor);
                            await deleteBackward(editor);
                        },
                        // This should be identical to 4-4
                        contentAfter: "<p>ab[]</p><p>cd</p>",
                    });
                    // 5-4
                    await testEditor({
                        contentBefore: "<p>ab</p><p><br><br><br><br>[]</p><p>cd</p>",
                        stepFunction: async (editor) => {
                            await deleteBackward(editor);
                            await deleteBackward(editor);
                            await deleteBackward(editor);
                            await deleteBackward(editor);
                        },
                        contentAfter: "<p>ab[]</p><p>cd</p>",
                    });
                }
            );

            test("should merge a paragraph into a paragraph with 4 <br>", async () => {
                // 6-1
                await testEditor({
                    contentBefore: "<p>ab</p><p><br><br><br><br></p><p>[]cd</p>",
                    stepFunction: deleteBackward,
                    contentAfter: "<p>ab</p><p><br><br><br>[]cd</p>",
                });
            });

            test("should merge a paragraph into a paragraph with 4 <br>, then delete a trailing line break", async () => {
                // 6-2
                await testEditor({
                    contentBefore: "<p>ab</p><p><br><br><br><br></p><p>[]cd</p>",
                    stepFunction: async (editor) => {
                        await deleteBackward(editor);
                        await deleteBackward(editor);
                    },
                    contentAfter: "<p>ab</p><p><br><br>[]cd</p>",
                });
            });

            test("should merge a paragraph into a paragraph with 4 <br>, then delete two line breaks", async () => {
                // 6-3
                await testEditor({
                    contentBefore: "<p>ab</p><p><br><br><br><br></p><p>[]cd</p>",
                    stepFunction: async (editor) => {
                        await deleteBackward(editor);
                        await deleteBackward(editor);
                        await deleteBackward(editor);
                    },
                    contentAfter: "<p>ab</p><p><br>[]cd</p>",
                });
            });

            test("should merge a paragraph into a paragraph with 4 <br>, then delete three line breaks", async () => {
                // 6-4
                await testEditor({
                    contentBefore: "<p>ab</p><p><br><br><br><br></p><p>[]cd</p>",
                    stepFunction: async (editor) => {
                        await deleteBackward(editor);
                        await deleteBackward(editor);
                        await deleteBackward(editor);
                        await deleteBackward(editor);
                    },
                    contentAfter: "<p>ab</p><p>[]cd</p>",
                });
            });

            test("should merge a paragraph into a paragraph with 4 <br>, then delete three line breaks, then merge two paragraphs with text", async () => {
                // 6-5
                await testEditor({
                    contentBefore: "<p>ab</p><p><br><br><br><br></p><p>[]cd</p>",
                    stepFunction: async (editor) => {
                        await deleteBackward(editor);
                        await deleteBackward(editor);
                        await deleteBackward(editor);
                        await deleteBackward(editor);
                        await deleteBackward(editor);
                    },
                    contentAfter: "<p>ab[]cd</p>",
                });
            });
        });
    });

    describe("Pre", () => {
        test("should delete a character in a pre", async () => {
            await testEditor({
                contentBefore: "<pre>ab[]cd</pre>",
                stepFunction: deleteBackward,
                contentAfter: "<pre>a[]cd</pre>",
            });
        });

        test("should delete a character in a pre (space before)", async () => {
            await testEditor({
                contentBefore: "<pre>     ab[]cd</pre>",
                stepFunction: deleteBackward,
                contentAfter: "<pre>     a[]cd</pre>",
            });
        });

        test("should delete a character in a pre (space after)", async () => {
            await testEditor({
                contentBefore: "<pre>ab[]cd     </pre>",
                stepFunction: deleteBackward,
                contentAfter: "<pre>a[]cd     </pre>",
            });
        });

        test("should delete a character in a pre (space before and after)", async () => {
            await testEditor({
                contentBefore: "<pre>     ab[]cd     </pre>",
                stepFunction: deleteBackward,
                contentAfter: "<pre>     a[]cd     </pre>",
            });
        });

        test("should delete a space in a pre", async () => {
            await testEditor({
                contentBefore: "<pre>   []  ab</pre>",
                stepFunction: deleteBackward,
                contentAfter: "<pre>  []  ab</pre>",
            });
        });

        test("should delete a newline in a pre", async () => {
            await testEditor({
                contentBefore: "<pre>ab\n[]cd</pre>",
                stepFunction: deleteBackward,
                contentAfter: "<pre>ab[]cd</pre>",
            });
        });

        test("should delete all leading space in a pre", async () => {
            await testEditor({
                contentBefore: "<pre>     []ab</pre>",
                stepFunction: async (BasicEditor) => {
                    await deleteBackward(BasicEditor);
                    await deleteBackward(BasicEditor);
                    await deleteBackward(BasicEditor);
                    await deleteBackward(BasicEditor);
                    await deleteBackward(BasicEditor);
                },
                contentAfter: "<pre>[]ab</pre>",
            });
        });

        test("should delete all trailing space in a pre", async () => {
            await testEditor({
                contentBefore: "<pre>ab     []</pre>",
                stepFunction: async (BasicEditor) => {
                    await deleteBackward(BasicEditor);
                    await deleteBackward(BasicEditor);
                    await deleteBackward(BasicEditor);
                    await deleteBackward(BasicEditor);
                    await deleteBackward(BasicEditor);
                },
                contentAfter: "<pre>ab[]</pre>",
            });
        });
    });

    describe("Formats", () => {
        test("should delete a character before a format node", async () => {
            await testEditor({
                contentBefore: "<p>abc<b>[]def</b></p>",
                stepFunction: deleteBackward,
                // The selection is normalized so we only have one way
                // to represent a position.
                contentAfter: "<p>ab[]<b>def</b></p>",
            });
            await testEditor({
                contentBefore: "<p>abc[]<b>def</b></p>",
                stepFunction: deleteBackward,
                contentAfter: "<p>ab[]<b>def</b></p>",
            });
        });
    });

    describe("Nested Elements", () => {
        test.todo("should delete a h1 inside a td immediately after insertion", async () => {
            await testEditor({
                contentBefore:
                    "<table><tbody><tr><td>[]<br></td><td><br></td><td><br></td></tr><tr><td><br></td><td><br></td><td><br></td></tr><tr><td><br></td><td><br></td><td><br></td></tr></tbody></table>",
                stepFunction: async (editor) => {
                    await insertText(editor, "/");
                    await insertText(editor, "Heading");
                    dispatch(editor.editable, "keyup");
                    dispatch(editor.editable, "keydown", { key: "Enter" });
                    // TODO @phoenix we may be need a tick or microtick here to replace the previous nextTick
                    await deleteBackward(editor);
                },
                contentAfter:
                    "<table><tbody><tr><td><p>[]<br></p></td><td><br></td><td><br></td></tr><tr><td><br></td><td><br></td><td><br></td></tr><tr><td><br></td><td><br></td><td><br></td></tr></tbody></table>",
            });
        });

        test.todo(
            "should delete a h1 inside a nested list immediately after insertion",
            async () => {
                await testEditor({
                    contentBefore:
                        '<ul><li>abc</li><li class="oe-nested"><ul><li>[]<br></li></ul></li></ul>',
                    stepFunction: async (editor) => {
                        await insertText(editor, "/");
                        await insertText(editor, "Heading");
                        dispatch(editor.editable, "keyup");
                        dispatch(editor.editable, "keydown", { key: "Enter" });
                        await deleteBackward(editor);
                        await deleteBackward(editor);
                    },
                    contentAfter: "<ul><li>abc[]</li></ul>",
                });
            }
        );
    });

    describe("Merging different types of elements", () => {
        test("should merge a paragraph with text into a paragraph with text", async () => {
            await testEditor({
                contentBefore: "<p>ab</p><p>[]cd</p>",
                stepFunction: deleteBackward,
                contentAfter: "<p>ab[]cd</p>",
            });
        });

        test("should merge a paragraph with formated text into a paragraph with text", async () => {
            await testEditor({
                contentBefore: "<p>aa</p><p>[]a<i>bbb</i></p>",
                stepFunction: deleteBackward,
                contentAfter: "<p>aa[]a<i>bbb</i></p>",
            });
        });

        test("should merge a paragraph with text into a heading1 with text", async () => {
            await testEditor({
                contentBefore: "<h1>ab</h1><p>[]cd</p>",
                stepFunction: deleteBackward,
                contentAfter: "<h1>ab[]cd</h1>",
            });
        });

        test("should merge an empty paragraph into a heading1 with text", async () => {
            await testEditor({
                contentBefore: "<h1>ab</h1><p>[]<br></p>",
                stepFunction: deleteBackward,
                contentAfter: "<h1>ab[]</h1>",
            });
            await testEditor({
                contentBefore: "<h1>ab</h1><p><br>[]</p>",
                stepFunction: deleteBackward,
                contentAfter: "<h1>ab[]</h1>",
            });
        });

        test("should remove empty paragraph (keeping the heading)", async () => {
            await testEditor({
                contentBefore: "<p><br></p><h1>[]ab</h1>",
                stepFunction: deleteBackward,
                contentAfter: "<h1>[]ab</h1>",
            });
        });

        test.todo("should merge with previous node (default behaviour)", async () => {
            await testEditor({
                contentBefore: "<jw-block-a>a</jw-block-a><jw-block-b>[]b</jw-block-b>",
                stepFunction: deleteBackward,
                contentAfter: "<jw-block-a>a[]b</jw-block-a>",
            });
            // await testEditor({
            //     contentBefore: '<jw-block-a>a</jw-block-a><jw-block-b>[<br>]</jw-block-b>',
            //     stepFunction: deleteBackward,
            //     contentAfter: '<jw-block-a>a[]</jw-block-a>',
            // });
        });

        test.todo("should merge nested elements (default behaviour)", async () => {
            await testEditor({
                contentBefore:
                    "<jw-block-a><jw-block-b>ab</jw-block-b></jw-block-a><jw-block-c><jw-block-d>[]cd</jw-block-d></jw-block-c>",
                stepFunction: deleteBackward,
                contentAfter: "<jw-block-a><jw-block-b>ab[]cd</jw-block-b></jw-block-a>",
            });
            // await testEditor({
            //     contentBefore:
            //         '<jw-block-a><jw-block-b>ab</jw-block-b></jw-block-a><jw-block-c><jw-block-d>[<br>]</jw-block-d></jw-block-c>',
            //     stepFunction: deleteBackward,
            //     contentAfter: '<jw-block-a><jw-block-b>ab[]</jw-block-b></jw-block-a>',
            // });
        });

        test("should not break unbreakables", async () => {
            await testEditor({
                contentBefore:
                    `<div class="oe_unbreakable"><div class="oe_unbreakable">` +
                    `<div class="oe_unbreakable"><div class="oe_unbreakable"><br></div>` +
                    `<div class="oe_unbreakable">[]abc</div></div></div></div>`,
                stepFunction: deleteBackward,
                contentAfter:
                    `<div class="oe_unbreakable"><div class="oe_unbreakable">` +
                    `<div class="oe_unbreakable"><div class="oe_unbreakable"><br></div>` +
                    `<div class="oe_unbreakable">[]abc</div></div></div></div>`,
            });
        });

        test.todo(
            "should merge a text preceding a paragraph (removing the paragraph)",
            async () => {
                await testEditor({
                    contentBefore: "<div>ab<p>[]cd</p></div>",
                    stepFunction: deleteBackward,
                    contentAfter: "<div>ab[]cd</div>",
                });
                await testEditor({
                    contentBefore: "<div>ab<p>[]cd</p>ef</div>",
                    stepFunction: deleteBackward,
                    contentAfter: "<div>ab[]cd<br>ef</div>",
                });
            }
        );
    });

    describe("With attributes", () => {
        test("should remove paragraph with class", async () => {
            await testEditor({
                contentBefore: '<p class="a"><br></p><p>[]abc</p>',
                stepFunction: deleteBackward,
                contentAfter: "<p>[]abc</p>",
            });
        });

        test.todo("should merge two paragraphs with spans of same classes", async () => {
            await testEditor({
                contentBefore: '<p><span class="a">ab</span></p><p><span class="a">[]cd</span></p>',
                stepFunction: deleteBackward,
                contentAfter: '<p><span class="a">ab[]cd</span></p>',
            });
        });

        test("should merge two paragraphs with spans of different classes without merging the spans", async () => {
            await testEditor({
                contentBefore: '<p><span class="a">ab</span></p><p><span class="b">[]cd</span></p>',
                stepFunction: deleteBackward,
                contentAfter: '<p><span class="a">ab[]</span><span class="b">cd</span></p>',
            });
        });

        test.todo(
            "should merge two paragraphs of different classes, each containing spans of the same class",
            async () => {
                await testEditor({
                    contentBefore:
                        '<p class="a"><span class="b">ab</span></p><p class="c"><span class="b">[]cd</span></p>',
                    stepFunction: deleteBackward,
                    contentAfter: '<p class="a"><span class="b">ab[]cd</span></p>',
                });
            }
        );

        test("should merge two paragraphs of different classes, each containing spans of different classes without merging the spans", async () => {
            await testEditor({
                contentBefore:
                    '<p class="a"><span class="b">ab</span></p><p class="c"><span class="d">[]cd</span></p>',
                stepFunction: deleteBackward,
                contentAfter:
                    '<p class="a"><span class="b">ab[]</span><span class="d">cd</span></p>',
            });
        });

        test.todo(
            "should delete a line break between two spans with bold and merge these formats",
            async () => {
                await testEditor({
                    contentBefore:
                        '<p><span class="a"><b>ab</b></span><br/><span class="a"><b>[]cd</b></span></p>',
                    stepFunction: deleteBackward,
                    contentAfter: '<p><span class="a"><b>ab[]cd</b></span></p>',
                });
            }
        );

        test.todo(
            "should delete a character in a span with bold, then a line break between two spans with bold and merge these formats",
            async () => {
                await testEditor({
                    contentBefore:
                        '<p><span class="a"><b>ab<br></b></span><br><span class="a"><b>c[]de</b></span></p>',
                    stepFunction: async (editor) => {
                        await deleteBackward(editor);
                        await deleteBackward(editor);
                    },
                    contentAfter: '<p><span class="a"><b>ab<br>[]de</b></span></p>',
                });
            }
        );
    });

    describe("Nested editable zone (inside contenteditable=false element)", () => {
        test("should not remove the uneditable nesting zone nor the editable nested zone if the last element of the nested zone is empty", async () => {
            await testEditor({
                contentBefore: unformat(`
                        <div contenteditable="false">
                            <div contenteditable="true">
                                <p>[]<br></p>
                            </div>
                        </div>
                    `),
                stepFunction: deleteBackward,
                contentAfter: unformat(`
                        <div contenteditable="false">
                            <div contenteditable="true">
                                <p>[]<br></p>
                            </div>
                        </div>
                    `),
            });
        });

        test("should not remove the uneditable nesting zone nor the editable nested zone even if there is a paragraph after", async () => {
            await testEditor({
                contentBefore: unformat(`
                        <div contenteditable="false">
                            <div contenteditable="true">
                                <p>[]<br></p>
                            </div>
                        </div>
                        <p>content</p>
                    `),
                stepFunction: deleteBackward,
                contentAfter: unformat(`
                        <div contenteditable="false">
                            <div contenteditable="true">
                                <p>[]<br></p>
                            </div>
                        </div>
                        <p>content</p>
                    `),
            });
        });

        test("should not remove the uneditable nesting zone nor the editable nested zone if the last element of the nested zone is not empty", async () => {
            await testEditor({
                contentBefore: unformat(`
                        <div contenteditable="false">
                            <div contenteditable="true">
                                <p>[]content</p>
                            </div>
                        </div>
                    `),
                stepFunction: deleteBackward,
                contentAfter: unformat(`
                        <div contenteditable="false">
                            <div contenteditable="true">
                                <p>[]content</p>
                            </div>
                        </div>
                    `),
            });
        });

        test("should remove the uneditable nesting zone from the outside", async () => {
            await testEditor({
                contentBefore: unformat(`
                        <div contenteditable="false">
                            <div contenteditable="true">
                                <p>content</p>
                            </div>
                        </div>
                        <p>[]content</p>
                    `),
                stepFunction: deleteBackward,
                contentAfter: unformat(`
                        <p>[]content</p>
                    `),
            });
        });
    });

    describe("POC extra tests", () => {
        test("should delete an unique space between letters", async () => {
            await testEditor({
                contentBefore: "<p>ab []cd</p>",
                stepFunction: deleteBackward,
                contentAfter: "<p>ab[]cd</p>",
            });
        });

        test.todo("should delete the first character in a paragraph (2)", async () => {
            await testEditor({
                contentBefore: "<p>a[] bc</p>",
                stepFunction: deleteBackward,
                contentAfter: "<p>[]&nbsp;bc</p>",
            });
        });

        test("should delete a space", async () => {
            await testEditor({
                contentBefore: "<p>ab [] de</p>",
                stepFunction: deleteBackward,
                contentAfter: "<p>ab[]de</p>",
            });
        });

        test.todo(
            "should delete a one letter word followed by visible space (start of block)",
            async () => {
                await testEditor({
                    contentBefore: "<p>a[] b</p>",
                    stepFunction: deleteBackward,
                    contentAfter: "<p>[]&nbsp;b</p>",
                });
                await testEditor({
                    contentBefore: "<p>[a] b</p>",
                    stepFunction: deleteBackward,
                    contentAfter: "<p>[]&nbsp;b</p>",
                });
            }
        );

        test.todo("should delete a one letter word surrounded by visible space", async () => {
            await testEditor({
                contentBefore: "<p>ab c[] de</p>",
                stepFunction: deleteBackward,
                contentAfter: "<p>ab []&nbsp;de</p>",
            });
            await testEditor({
                contentBefore: "<p>ab [c] de</p>",
                stepFunction: deleteBackward,
                contentAfter: "<p>ab []&nbsp;de</p>",
            });
        });

        test.todo(
            "should delete a one letter word preceded by visible space (end of block)",
            async () => {
                await testEditor({
                    contentBefore: "<p>a b[]</p>",
                    stepFunction: deleteBackward,
                    contentAfter: "<p>a&nbsp;[]</p>",
                });
                await testEditor({
                    contentBefore: "<p>a [b]</p>",
                    stepFunction: deleteBackward,
                    contentAfter: "<p>a&nbsp;[]</p>",
                });
            }
        );

        test("should delete an empty paragraph in a table cell", async () =>
            await testEditor({
                contentBefore:
                    "<table><tbody><tr><td><p>a<br></p><p>[]<br></p></td></tr></tbody></table>",
                stepFunction: deleteBackward,
                contentAfter: "<table><tbody><tr><td><p>a[]</p></td></tr></tbody></table>",
            }));

        test.todo("should fill empty block with a <br>", async () => {
            await testEditor({
                contentBefore: "<p>a[]</p>",
                stepFunction: deleteBackward,
                contentAfter: "<p>[]<br></p>",
            });
            await testEditor({
                contentBefore: "<p><img>[]</p>",
                stepFunction: deleteBackward,
                contentAfter: "<p>[]<br></p>",
            });
        });

        test("should merge a paragraph with text into a paragraph with text removing spaces", async () => {
            await testEditor({
                contentBefore: "<p>ab   </p>    <p>   []cd</p>",
                stepFunction: deleteBackward,
                // This is a tricky case: the spaces after ab are
                // visible on Firefox but not on Chrome... to be
                // consistent we enforce the space removal here but
                // maybe not a good idea... see next case ->
                contentAfter: "<p>ab[]cd</p>",
            });
            await testEditor({
                contentBefore: "<p>ab   <br></p>    <p>   []cd</p>",
                stepFunction: deleteBackward,
                // This is the same visible case as the one above. The
                // difference is that here the space after ab is visible
                // on both Firefox and Chrome, so it should stay
                // visible.
                contentAfter: "<p>ab   []cd</p>",
            });
        });

        test("should remove a br and remove following spaces", async () => {
            await testEditor({
                contentBefore: "<p>ab<br><b>[]   </b>cd</p>",
                stepFunction: deleteBackward,
                contentAfter: "<p>ab[]cd</p>",
            });
            await testEditor({
                contentBefore: "<p>ab<br><b>[]   x</b>cd</p>",
                stepFunction: deleteBackward,
                contentAfter: "<p>ab[]<b>x</b>cd</p>",
            });
        });

        test("should ignore empty inline node between blocks being merged", async () => {
            await testEditor({
                contentBefore: "<div><p>abc</p><i> </i><p>[]def</p></div>",
                stepFunction: deleteBackward,
                contentAfter: "<div><p>abc[]def</p></div>",
            });
        });

        test("should merge in nested paragraphs and remove invisible inline content", async () => {
            await testEditor({
                contentBefore:
                    '<custom-block style="display: block;"><p>ab</p>    </custom-block><p>[]c</p>',
                stepFunction: deleteBackward,
                contentAfter: '<custom-block style="display: block;"><p>ab[]c</p></custom-block>',
            });
            await testEditor({
                contentBefore:
                    '<custom-block style="display: block;"><p>ab</p> <i> </i> </custom-block><p>[]c</p>',
                stepFunction: deleteBackward,
                contentAfter: '<custom-block style="display: block;"><p>ab[]c</p></custom-block>',
            });
        });

        test("should not merge in nested blocks if inline content afterwards", async () => {
            await testEditor({
                contentBefore:
                    '<custom-block style="display: block;"><p>ab</p>de</custom-block><p>[]fg</p>',
                stepFunction: deleteBackward,
                contentAfter:
                    '<custom-block style="display: block;"><p>ab</p>de[]fg</custom-block>',
            });
            await testEditor({
                contentBefore:
                    '<custom-block style="display: block;"><p>ab</p><img></custom-block><p>[]fg</p>',
                stepFunction: deleteBackward,
                contentAfter:
                    '<custom-block style="display: block;"><p>ab</p><img>[]fg</custom-block>',
            });
        });

        test("should move paragraph content to empty block", async () => {
            await testEditor({
                contentBefore: "<p>abc</p><h1><br></h1><p>[]def</p>",
                stepFunction: deleteBackward,
                contentAfter: "<p>abc</p><p>[]def</p>",
            });
        });

        test.todo("should remove only one br between contents", async () => {
            await testEditor({
                contentBefore: "<p>abc<br>[]<br>def</p>",
                stepFunction: deleteBackward,
                contentAfter: "<p>abc[]<br>def</p>",
            });
        });

        test("should remove an empty block instead of merging it", async () => {
            await testEditor({
                contentBefore: "<p><br></p><p>[]<br></p>",
                stepFunction: deleteBackward,
                contentAfter: "<p>[]<br></p>",
            });
        });

        test.todo("should not remove a table without selecting it", async () => {
            await testEditor({
                contentBefore: unformat(
                    `<p>ab</p>
                        <table><tbody>
                            <tr><td>cd</td><td>ef</td></tr>
                            <tr><td>gh</td><td>ij</td></tr>
                        </tbody></table>
                        <p>[]kl</p>`
                ),
                stepFunction: deleteBackward,
                contentAfter: unformat(
                    `<p>ab</p>
                        <table><tbody>
                            <tr><td>cd</td><td>ef</td></tr>
                            <tr><td>gh</td><td>ij</td></tr>
                        </tbody></table>
                        <p>[]kl</p>`
                ),
            });
        });

        test("should not merge a table into its previous sibling", async () => {
            await testEditor({
                contentBefore: unformat(
                    `<p>ab</p>
                        <table><tbody>
                            <tr><td>[]cd</td><td>ef</td></tr>
                            <tr><td>gh</td><td>ij</td></tr>
                        </tbody></table>
                        <p>kl</p>`
                ),
                stepFunction: deleteBackward,
                contentAfter: unformat(
                    `<p>ab</p>
                        <table><tbody>
                            <tr><td>[]cd</td><td>ef</td></tr>
                            <tr><td>gh</td><td>ij</td></tr>
                        </tbody></table>
                        <p>kl</p>`
                ),
            });
        });

        test.todo("should delete an image that is displayed as a block", async () => {
            await testEditor({
                contentBefore: unformat(`<div>a[b<img style="display: block;"/>c]d</div>`),
                stepFunction: deleteBackward,
                contentAfter: unformat(`<div>a[]d</div>`),
            });
        });
    });
});

describe("Selection not collapsed", () => {
    test.todo("ZWS : should keep inline block", async () => {
        await testEditor({
            contentBefore: '<div><p>ab <span class="style">[c]</span> d</p></div>',
            stepFunction: async (editor) => {
                await deleteBackward(editor);
            },
            contentAfterEdit:
                '<div><p>ab <span class="style" data-oe-zws-empty-inline="">[]\u200B</span> d</p></div>',
            contentAfter: '<div><p>ab <span class="style">[]\u200B</span> d</p></div>',
        });
        await testEditor({
            contentBefore: '<div><p>ab <span class="style">[c]</span> d</p></div>',
            stepFunction: async (editor) => {
                await deleteBackward(editor);
                await insertText(editor, "x");
            },
            contentAfterEdit:
                '<div><p>ab <span class="style" data-oe-zws-empty-inline="">x[]\u200B</span> d</p></div>',
            contentAfter: '<div><p>ab <span class="style">x[]</span> d</p></div>',
        });
        await testEditor({
            contentBefore: '<div><p>ab<span class="style">[c]</span>d</p></div>',
            stepFunction: async (editor) => {
                await deleteBackward(editor);
                await insertText(editor, "x");
            },
            contentAfterEdit:
                '<div><p>ab<span class="style" data-oe-zws-empty-inline="">x[]\u200B</span>d</p></div>',
            contentAfter: '<div><p>ab<span class="style">x[]</span>d</p></div>',
        });
        await testEditor({
            contentBefore: '<div><p>ab <span class="style">[cde]</span> f</p></div>',
            stepFunction: async (editor) => {
                await deleteBackward(editor);
                await insertText(editor, "x");
            },
            contentAfterEdit:
                '<div><p>ab <span class="style" data-oe-zws-empty-inline="">x[]\u200B</span> f</p></div>',
            contentAfter: '<div><p>ab <span class="style">x[]</span> f</p></div>',
        });
    });

    test.todo("should merge node correctly (1)", async () => {
        await testEditor({
            contentBefore: '<div>a<span class="a">b[c</span><p>d]e</p>f<br>g</div>',
            stepFunction: deleteBackward,
            // FIXME ?? : Maybe this should bing the content inside the <p>
            // Instead of removing the <p>,
            // ex : <div><p>a<span class="a">b[]</span>e</p>f<br>g</div>
            contentAfter: '<div>a<span class="a">b[]</span>e<br>f<br>g</div>',
        });
    });

    test.todo("should merge node correctly (2)", async () => {
        await testEditor({
            contentBefore: '<div>a<p>b[c</p><span class="a">d]e</span>f<p>xxx</p></div>',
            stepFunction: deleteBackward,
            contentAfter: '<div>a<p>b[]<span class="a">e</span>f</p><p>xxx</p></div>',
        });
    });

    test.todo("should delete part of the text within a paragraph", async () => {
        // Forward selection
        await testEditor({
            contentBefore: "<p>ab[cd]ef</p>",
            stepFunction: deleteBackward,
            contentAfter: "<p>ab[]ef</p>",
        });
        // Backward selection
        await testEditor({
            contentBefore: "<p>ab]cd[ef</p>",
            stepFunction: deleteBackward,
            contentAfter: "<p>ab[]ef</p>",
        });
    });

    test.todo("should delete across two paragraphs", async () => {
        // Forward selection
        await testEditor({
            contentBefore: "<p>ab[cd</p><p>ef]gh</p>",
            stepFunction: deleteBackward,
            contentAfter: "<p>ab[]gh</p>",
        });
        // Backward selection
        await testEditor({
            contentBefore: "<p>ab]cd</p><p>ef[gh</p>",
            stepFunction: deleteBackward,
            contentAfter: "<p>ab[]gh</p>",
        });
    });

    test.todo("should delete part of the text across two paragraphs", async () => {
        // Forward selection
        await testEditor({
            contentBefore: "<div>a<p>b[c</p><p>d]e</p>f</div>",
            stepFunction: deleteBackward,
            contentAfter: "<div>a<p>b[]e</p>f</div>",
        });
        // Backward selection
        await testEditor({
            contentBefore: "<div>a<p>b]c</p><p>d[e</p>f</div>",
            stepFunction: deleteBackward,
            contentAfter: "<div>a<p>b[]e</p>f</div>",
        });
    });

    test.todo("should delete all the text in a paragraph", async () => {
        // Forward selection
        await testEditor({
            contentBefore: "<p>[abc]</p>",
            stepFunction: deleteBackward,
            contentAfter: "<p>[]<br></p>",
        });
        // Backward selection
        await testEditor({
            contentBefore: "<p>]abc[</p>",
            stepFunction: deleteBackward,
            contentAfter: "<p>[]<br></p>",
        });
    });

    test.todo(
        "should delete a complex selection accross format nodes and multiple paragraphs",
        async () => {
            // Forward selection
            await testEditor({
                contentBefore: "<p><b>ab[cd</b></p><p><b>ef<br/>gh</b>ij<i>kl]</i>mn</p>",
                stepFunction: deleteBackward,
                contentAfter: "<p><b>ab[]</b>mn</p>",
            });
            await testEditor({
                contentBefore: "<p><b>ab[cd</b></p><p><b>ef<br/>gh</b>ij<i>k]l</i>mn</p>",
                stepFunction: deleteBackward,
                contentAfter: "<p><b>ab[]</b><i>l</i>mn</p>",
            });
            // Backward selection
            await testEditor({
                contentBefore: "<p><b>ab]cd</b></p><p><b>ef<br/>gh</b>ij<i>kl[</i>mn</p>",
                stepFunction: deleteBackward,
                contentAfter: "<p><b>ab[]</b>mn</p>",
            });
            await testEditor({
                contentBefore: "<p><b>ab]cd</b></p><p><b>ef<br/>gh</b>ij<i>k[l</i>mn</p>",
                stepFunction: deleteBackward,
                contentAfter: "<p><b>ab[]</b><i>l</i>mn</p>",
            });
        }
    );

    test.todo(
        "should delete all contents of a complex DOM with format nodes and multiple paragraphs",
        async () => {
            // Forward selection
            await testEditor({
                contentBefore: "<p><b>[abcd</b></p><p><b>ef<br/>gh</b>ij<i>kl</i>mn]</p>",
                stepFunction: deleteBackward,
                contentAfter: "<p>[]<br></p>",
            });
            // Backward selection
            await testEditor({
                contentBefore: "<p><b>]abcd</b></p><p><b>ef<br/>gh</b>ij<i>kl</i>mn[</p>",
                stepFunction: deleteBackward,
                contentAfter: "<p>[]<br></p>",
            });
        }
    );

    test.todo("should delete a selection accross a heading1 and a paragraph", async () => {
        // Forward selection
        await testEditor({
            contentBefore: "<h1>ab [cd</h1><p>ef]gh</p>",
            stepFunction: deleteBackward,
            contentAfter: "<h1>ab []gh</h1>",
        });
        // Backward selection
        await testEditor({
            contentBefore: "<h1>ab ]cd</h1><p>ef[gh</p>",
            stepFunction: deleteBackward,
            contentAfter: "<h1>ab []gh</h1>",
        });
    });

    test.todo(
        "should delete a selection from the beginning of a heading1 with a format to the middle of a paragraph",
        async () => {
            // Forward selection
            await testEditor({
                contentBefore: "<h1><b>[abcd</b></h1><p>ef]gh1</p>",
                stepFunction: deleteBackward,
                contentAfter: "<p>[]gh1</p>",
            });
            await testEditor({
                contentBefore: "<h1>[<b>abcd</b></h1><p>ef]gh2</p>",
                stepFunction: deleteBackward,
                contentAfter: "<p>[]gh2</p>",
            });
            // Backward selection
            await testEditor({
                contentBefore: "<h1><b>]abcd</b></h1><p>ef[gh3</p>",
                stepFunction: deleteBackward,
                contentAfter: "<p>[]gh3</p>",
            });
            await testEditor({
                contentBefore: "<h1>]<b>abcd</b></h1><p>ef[gh4</p>",
                stepFunction: deleteBackward,
                contentAfter: "<p>[]gh4</p>",
            });
        }
    );

    test.todo("should delete a heading (triple click backspace)", async () => {
        await testEditor({
            contentBefore: "<h1>[abc</h1><p>]def</p>",
            stepFunction: deleteBackward,
            // JW cAfter: '<p>[]def</p>',
            contentAfter: "<h1>[]<br></h1><p>def</p>",
        });
        await testEditor({
            contentBefore: "<h1>[abc</h1><p>]<br></p><p>def</p>",
            stepFunction: deleteBackward,
            contentAfter: "<h1>[]<br></h1><p><br></p><p>def</p>",
        });
    });

    test.todo(
        "should delete last character of paragraph, ignoring the selected paragraph break",
        async () => {
            await testEditor({
                contentBefore: "<p>ab[c</p><p>]def</p>",
                // This type of selection (typically done with a triple
                // click) is "corrected" before remove so triple clicking
                // doesn't remove a paragraph break.
                stepFunction: deleteBackward,
                contentAfter: "<p>ab[]</p><p>def</p>",
            });
            await testEditor({
                contentBefore: "<p>ab[c</p><p>]<br></p><p>def</p>",
                // This type of selection (typically done with a triple
                // click) is "corrected" before remove so triple clicking
                // doesn't remove a paragraph break.
                stepFunction: deleteBackward,
                contentAfter: "<p>ab[]</p><p><br></p><p>def</p>",
            });
        }
    );

    test.todo(
        "should delete first character of paragraph, as well as selected paragraph break",
        async () => {
            await testEditor({
                contentBefore: "<p>abc[</p><p>d]ef</p>",
                stepFunction: deleteBackward,
                contentAfter: "<p>abc[]ef</p>",
            });
        }
    );

    test.todo(
        "should delete last character of paragraph, ignoring the selected paragraph break leading to an unbreakable",
        async () => {
            await testEditor({
                contentBefore: '<p>ab[c</p><p t="unbreak">]def</p>',
                // This type of selection (typically done with a triple
                // click) is "corrected" before remove so triple clicking
                // doesn't remove a paragraph break.
                stepFunction: deleteBackward,
                contentAfter: '<p>ab[]</p><p t="unbreak">def</p>',
            });
            await testEditor({
                contentBefore: '<p>ab[c</p><p t="unbreak">]<br></p><p>def</p>',
                // This type of selection (typically done with a triple
                // click) is "corrected" before remove so triple clicking
                // doesn't remove a paragraph break.
                stepFunction: deleteBackward,
                contentAfter: '<p>ab[]</p><p t="unbreak"><br></p><p>def</p>',
            });
            await testEditor({
                contentBefore: '<p>ab[c</p><p>]<br></p><p t="unbreak">def</p>',
                // This type of selection (typically done with a triple
                // click) is "corrected" before remove so triple clicking
                // doesn't remove a paragraph break.
                stepFunction: deleteBackward,
                contentAfter: '<p>ab[]</p><p><br></p><p t="unbreak">def</p>',
            });
        }
    );

    test.todo(
        "should delete first character of unbreakable, ignoring selected paragraph break",
        async () => {
            await testEditor({
                contentBefore: '<p>abc[</p><p t="unbreak">d]ef</p>',
                stepFunction: deleteBackward,
                contentAfter: '<p>abc[]</p><p t="unbreak">ef</p>',
            });
        }
    );

    test.todo("should remove a fully selected table", async () => {
        await testEditor({
            contentBefore: unformat(
                `<p>a[b</p>
                    <table><tbody>
                        <tr><td>cd</td><td>ef</td></tr>
                        <tr><td>gh</td><td>ij</td></tr>
                    </tbody></table>
                    <p>k]l</p>`
            ),
            stepFunction: deleteBackward,
            contentAfter: "<p>a[]l</p>",
        });
    });

    test("should delete nothing when in an empty table cell", async () => {
        await testEditor({
            contentBefore:
                "<table><tbody><tr><td>abc</td><td>[]<br></td><td>abc</td></tr></tbody></table>",
            stepFunction: deleteBackward,
            contentAfter:
                "<table><tbody><tr><td>abc</td><td>[]<br></td><td>abc</td></tr></tbody></table>",
        });
    });

    test.todo(
        "should only remove the text content of cells in a partly selected table",
        async () => {
            await testEditor({
                contentBefore: unformat(
                    `<table><tbody>
                        <tr><td>cd</td><td class="o_selected_td">e[f</td><td>gh</td></tr>
                        <tr><td>ij</td><td class="o_selected_td">k]l</td><td>mn</td></tr>
                        <tr><td>op</td><td>qr</td><td>st</td></tr>
                    </tbody></table>`
                ),
                stepFunction: deleteBackward,
                contentAfter: unformat(
                    `<table><tbody>
                        <tr><td>cd</td><td>[]<br></td><td>gh</td></tr>
                        <tr><td>ij</td><td><br></td><td>mn</td></tr>
                        <tr><td>op</td><td>qr</td><td>st</td></tr>
                    </tbody></table>`
                ),
            });
        }
    );

    test.todo(
        "should remove some text and a table (even if the table is partly selected)",
        async () => {
            await testEditor({
                contentBefore: unformat(
                    `<p>a[b</p>
                    <table><tbody>
                        <tr><td>cd</td><td>ef</td></tr>
                        <tr><td>g]h</td><td>ij</td></tr>
                    </tbody></table>
                    <p>kl</p>`
                ),
                stepFunction: deleteBackward,
                contentAfter: unformat(
                    `<p>a[]</p>
                    <p>kl</p>`
                ),
            });
        }
    );

    test.todo(
        "should remove a table and some text (even if the table is partly selected)",
        async () => {
            await testEditor({
                contentBefore: unformat(
                    `<p>ab</p>
                    <table><tbody>
                        <tr><td>cd</td><td>ef</td></tr>
                        <tr><td>gh</td><td>i[j</td></tr>
                    </tbody></table>
                    <p>k]l</p>`
                ),
                stepFunction: deleteBackward,
                contentAfter: unformat(
                    `<p>ab</p>
                    <p>[]l</p>`
                ),
            });
        }
    );

    test.todo("should remove some text, a table and some more text", async () => {
        await testEditor({
            contentBefore: unformat(
                `<p>a[b</p>
                    <table><tbody>
                        <tr><td>cd</td><td>ef</td></tr>
                        <tr><td>gh</td><td>ij</td></tr>
                    </tbody></table>
                    <p>k]l</p>`
            ),
            stepFunction: deleteBackward,
            contentAfter: `<p>a[]l</p>`,
        });
    });

    test.todo("should remove a selection of several tables", async () => {
        await testEditor({
            contentBefore: unformat(
                `<table><tbody>
                        <tr><td>cd</td><td>e[f</td></tr>
                        <tr><td>gh</td><td>ij</td></tr>
                    </tbody></table>
                    <table><tbody>
                        <tr><td>cd</td><td>ef</td></tr>
                        <tr><td>gh</td><td>ij</td></tr>
                    </tbody></table>
                    <table><tbody>
                        <tr><td>cd</td><td>e]f</td></tr>
                        <tr><td>gh</td><td>ij</td></tr>
                    </tbody></table>`
            ),
            stepFunction: deleteBackward,
            contentAfter: `<p>[]<br></p>`,
        });
    });

    test.todo("should remove a selection including several tables", async () => {
        await testEditor({
            contentBefore: unformat(
                `<p>0[1</p>
                    <table><tbody>
                        <tr><td>cd</td><td>ef</td></tr>
                        <tr><td>gh</td><td>ij</td></tr>
                    </tbody></table>
                    <p>23</p>
                    <table><tbody>
                        <tr><td>cd</td><td>ef</td></tr>
                        <tr><td>gh</td><td>ij</td></tr>
                    </tbody></table>
                    <p>45</p>
                    <table><tbody>
                        <tr><td>cd</td><td>ef</td></tr>
                        <tr><td>gh</td><td>ij</td></tr>
                    </tbody></table>
                    <p>67]</p>`
            ),
            stepFunction: deleteBackward,
            contentAfter: `<p>0[]</p>`,
        });
    });

    test.todo("should remove everything, including several tables", async () => {
        await testEditor({
            contentBefore: unformat(
                `<p>[01</p>
                    <table><tbody>
                        <tr><td>cd</td><td>ef</td></tr>
                        <tr><td>gh</td><td>ij</td></tr>
                    </tbody></table>
                    <p>23</p>
                    <table><tbody>
                        <tr><td>cd</td><td>ef</td></tr>
                        <tr><td>gh</td><td>ij</td></tr>
                    </tbody></table>
                    <p>45</p>
                    <table><tbody>
                        <tr><td>cd</td><td>ef</td></tr>
                        <tr><td>gh</td><td>ij</td></tr>
                    </tbody></table>
                    <p>67]</p>`
            ),
            stepFunction: deleteBackward,
            contentAfter: `<p>[]<br></p>`,
        });
    });

    test.todo("should empty an inline unremovable but remain in it", async () => {
        await testEditor({
            contentBefore: '<p>ab<b class="oe_unremovable">[cd]</b>ef</p>',
            stepFunction: deleteBackward,
            contentAfter: '<p>ab<b class="oe_unremovable">[]\u200B</b>ef</p>',
        });
    });

    test("should delete if first element and append in paragraph", async () => {
        await testEditor({
            contentBefore: `<blockquote><br>[]</blockquote>`,
            stepFunction: deleteBackward,
            contentAfter: `<p>[]<br></p>`,
        });
        await testEditor({
            contentBefore: `<h1>[]abcd</h1>`,
            stepFunction: deleteBackward,
            contentAfter: `<p>[]abcd</p>`,
        });
    });

    test.todo("should not delete styling nodes if not selected", async () => {
        // deleteBackward selection
        await testEditor({
            contentBefore: '<p>a<span class="style-class">[bcde]</span>f</p>',
            stepFunction: deleteBackward,
            contentAfter: '<p>a<span class="style-class">[]\u200B</span>f</p>',
        });
    });

    test.todo("should delete styling nodes when delete if empty", async () => {
        // deleteBackward selection
        await testEditor({
            contentBefore: '<p>ab <span class="style-class">[cd]</span> ef</p>',
            stepFunction: async (editor) => {
                await deleteBackward(editor);
                await deleteBackward(editor);
            },
            contentAfter: "<p>ab[]&nbsp;ef</p>",
        });
        await testEditor({
            contentBefore: '<p>uv<span class="style-class">[wx]</span>yz</p>',
            stepFunction: async (editor) => {
                await deleteBackward(editor);
                await deleteBackward(editor);
            },
            contentAfter: "<p>u[]yz</p>",
        });
    });

    test.todo(
        "should transform the last space of a container to an &nbsp; after removing the last word through deleteRange",
        async () => {
            await testEditor({
                contentBefore: `<p>a [b]</p>`,
                stepFunction: async (editor) => {
                    await deleteBackward(editor);
                },
                contentAfter: `<p>a&nbsp;[]</p>`,
            });
        }
    );

    describe("Nested editable zone (inside contenteditable=false element)", () => {
        test.todo(
            "should extend the range to fully include contenteditable=false that are partially selected at the end of the range",
            async () => {
                await testEditor({
                    contentBefore: unformat(`
                        <p>before[o</p>
                        <div contenteditable="false">
                            <div contenteditable="true"><p>intruder]</p></div>
                        </div>
                        <p>after</p>`),
                    stepFunction: async (editor) => {
                        await deleteBackward(editor);
                    },
                    contentAfter: unformat(`
                        <p>before[]</p><p>after</p>`),
                });
            }
        );

        test.todo(
            "should extend the range to fully include contenteditable=false that are partially selected at the start of the range",
            async () => {
                await testEditor({
                    contentBefore: unformat(`
                        <p>before</p>
                        <div contenteditable="false">
                            <div contenteditable="true"><p>[intruder</p></div>
                        </div>
                        <p>o]after</p>`),
                    stepFunction: async (editor) => {
                        await deleteBackward(editor);
                    },
                    contentAfter: unformat(`
                        <p>before[]after</p>`),
                });
            }
        );

        test.todo(
            "should remove element which is contenteditable=true even if their parent is contenteditable=false",
            async () => {
                await testEditor({
                    contentBefore: unformat(`
                        <p>before[o</p>
                        <div contenteditable="false">
                            <div contenteditable="true"><p>intruder</p></div>
                        </div>
                        <p>o]after</p>`),
                    stepFunction: async (editor) => {
                        await deleteBackward(editor);
                    },
                    contentAfter: unformat(`
                        <p>before[]after</p>`),
                });
            }
        );
    });
});
