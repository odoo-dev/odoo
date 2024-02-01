import { test, describe } from "@odoo/hoot";
import { testEditor } from "../../test_helpers/editor";
import { unformat } from "../../test_helpers/format";
import { insertParagraphBreak } from "../../test_helpers/user_actions";

function insertText() {
    throw new Error("need a proper implementation");
}

describe("Selection collapsed", () => {
    describe("Ordered", () => {
        describe("Basic", () => {
            test("should add an empty list item before a list item", async () => {
                await testEditor({
                    contentBefore: "<ol><li>[]abc</li></ol>",
                    stepFunction: insertParagraphBreak,
                    contentAfter: "<ol><li><br></li><li>[]abc</li></ol>",
                });
            });

            test("should split a list item in two", async () => {
                await testEditor({
                    contentBefore: "<ol><li>ab[]cd</li></ol>",
                    stepFunction: insertParagraphBreak,
                    contentAfter: "<ol><li>ab</li><li>[]cd</li></ol>",
                });
            });

            test("should add an empty list item after a list item", async () => {
                await testEditor({
                    contentBefore: "<ol><li>abc[]</li></ol>",
                    stepFunction: insertParagraphBreak,
                    contentAfter: "<ol><li>abc</li><li>[]<br></li></ol>",
                });
            });

            test.todo(
                "should indent an item in an ordered list and add value (with dom mutations)",
                async () => {
                    await testEditor({
                        contentBefore: unformat(`
                            <ol>
                                <li>a</li>
                                <li class="oe-nested">
                                    <ol>
                                        <li>b</li>
                                    </ol>
                                </li>
                                <li>c[]</li>
                            </ol>`),
                        stepFunction: async (editor) => {
                            const ol = editor.editable.querySelector("ol");
                            const li = document.createElement("li");
                            const br = document.createElement("br");
                            li.append(br);
                            ol.insertBefore(li, ol.lastElementChild);
                            await editor.execCommand("oEnter"); // new line
                        },
                        contentAfter: unformat(`
                            <ol>
                                <li>a</li>
                                <li class="oe-nested">
                                    <ol>
                                        <li>b</li>
                                    </ol>
                                </li>
                                <li><br></li>
                                <li>c</li>
                                <li>[]<br></li>
                            </ol>`),
                    });
                }
            );
        });
        describe("Removing items", () => {
            test.todo(
                "should add an empty list item at the end of a list, then remove it",
                async () => {
                    await testEditor({
                        contentBefore: "<ol><li>abc[]</li></ol>",
                        stepFunction: async (editor) => {
                            await insertParagraphBreak(editor);
                            await insertParagraphBreak(editor);
                        },
                        contentAfter: "<ol><li>abc</li></ol><p>[]<br></p>",
                    });
                }
            );

            test.todo(
                "should add an empty list item at the end of an indented list, then remove it",
                async () => {
                    await testEditor({
                        contentBefore:
                            '<ol><li>abc</li><li class="oe-nested"><ol><li>def[]</li></ol></li><li>ghi</li></ol>',
                        stepFunction: async (editor) => {
                            await insertParagraphBreak(editor);
                            await insertParagraphBreak(editor);
                        },
                        contentAfter:
                            '<ol><li>abc</li><li class="oe-nested"><ol><li>def</li></ol></li><li>[]<br></li><li>ghi</li></ol>',
                    });
                }
            );

            test.todo("should remove a list with p", async () => {
                await testEditor({
                    contentBefore: "<ol><li><p>[]<br></p></li></ol>",
                    stepFunction: insertParagraphBreak,
                    contentAfter: "<p>[]<br></p>",
                });
            });

            test.todo("should remove a list set to bold", async () => {
                await testEditor({
                    contentBefore: "<ol><li><p><b>[]<br></b></p></li></ol>",
                    stepFunction: insertParagraphBreak,
                    contentAfter: "<p>[]<br></p>",
                });
            });
        });
        describe("With attributes", () => {
            test.todo("should add two list items at the end of a list with a class", async () => {
                await testEditor({
                    contentBefore: '<ol class="a"><li>abc[]</li></ol>',
                    stepFunction: async (editor) => {
                        await insertParagraphBreak(editor);
                        await insertText(editor, "b");
                        await insertParagraphBreak(editor);
                    },
                    contentAfter: '<ol class="a"><li>abc</li><li>b</li><li>[]<br></li></ol>',
                });
            });

            test.todo("should add two list items with a class at the end of a list", async () => {
                await testEditor({
                    contentBefore: '<ol><li class="a">abc[]</li></ol>',
                    stepFunction: async (editor) => {
                        await insertParagraphBreak(editor);
                        await insertText(editor, "b");
                        await insertParagraphBreak(editor);
                    },
                    contentAfter:
                        '<ol><li class="a">abc</li><li class="a">b</li><li class="a">[]<br></li></ol>',
                });
            });

            test.todo("should create list items after one with a block in it", async () => {
                await testEditor({
                    contentBefore:
                        '<ol><li class="a"><custom-block style="display: block;">abc[]</custom-block></li></ol>',
                    stepFunction: async (editor) => {
                        await insertParagraphBreak(editor);
                        await insertText(editor, "b");
                        await insertParagraphBreak(editor);
                    },
                    contentAfter:
                        '<ol><li class="a"><custom-block style="display: block;">abc</custom-block></li>' +
                        '<li class="a"><custom-block style="display: block;">b</custom-block></li>' +
                        '<li class="a"><custom-block style="display: block;">[]<br></custom-block></li></ol>',
                });
                await testEditor({
                    contentBefore:
                        '<ol><li><custom-block class="a" style="display: block;">abc[]</custom-block></li></ol>',
                    stepFunction: async (editor) => {
                        await insertParagraphBreak(editor);
                        await insertText(editor, "b");
                        await insertParagraphBreak(editor);
                    },
                    contentAfter:
                        '<ol><li><custom-block class="a" style="display: block;">abc</custom-block></li>' +
                        '<li><custom-block class="a" style="display: block;">b</custom-block></li>' +
                        '<li><custom-block class="a" style="display: block;">[]<br></custom-block></li></ol>',
                });
            });

            test.todo(
                "should add two list items with a font at the end of a list within a list",
                async () => {
                    await testEditor({
                        contentBefore: unformat(`
                            <ul>
                                <li>ab</li>
                                <li class="oe-nested">
                                    <ul>
                                        <li>
                                            <font style="color: red;">cd[]</font>
                                        </li>
                                    </ul>
                                </li>
                                <li>ef</li>
                            </ul>`),
                        stepFunction: async (editor) => {
                            await insertParagraphBreak(editor);
                            await insertText(editor, "b");
                            await insertParagraphBreak(editor);
                        },
                        contentAfter: unformat(`
                            <ul>
                                <li>ab</li>
                                <li class="oe-nested">
                                    <ul>
                                        <li><font style="color: red;">cd</font></li>
                                        <li>b</li>
                                        <li>[]<br></li>
                                    </ul>
                                </li>
                                <li>ef</li>
                            </ul>`),
                    });
                }
            );
        });
    });
    describe("Unordered", () => {
        describe("Basic", () => {
            test("should add an empty list item before a list item", async () => {
                await testEditor({
                    contentBefore: "<ul><li>[]abc</li></ul>",
                    stepFunction: insertParagraphBreak,
                    contentAfter: "<ul><li><br></li><li>[]abc</li></ul>",
                });
            });

            test("should split a list item in two", async () => {
                await testEditor({
                    contentBefore: "<ul><li>ab[]cd</li></ul>",
                    stepFunction: insertParagraphBreak,
                    contentAfter: "<ul><li>ab</li><li>[]cd</li></ul>",
                });
            });

            test("should add an empty list item after a list item", async () => {
                await testEditor({
                    contentBefore: "<ul><li>abc[]</li></ul>",
                    stepFunction: insertParagraphBreak,
                    contentAfter: "<ul><li>abc</li><li>[]<br></li></ul>",
                });
            });
        });
        describe("Removing items", () => {
            test.todo(
                "should add an empty list item at the end of a list, then remove it",
                async () => {
                    await testEditor({
                        contentBefore: "<ul><li>abc[]</li></ul>",
                        stepFunction: async (editor) => {
                            await insertParagraphBreak(editor);
                            await insertParagraphBreak(editor);
                        },
                        contentAfter: "<ul><li>abc</li></ul><p>[]<br></p>",
                    });
                }
            );

            test.todo(
                "should add an empty list item at the end of an indented list, then remove it",
                async () => {
                    await testEditor({
                        contentBefore:
                            '<ul><li>abc</li><li class="oe-nested"><ul><li>def[]</li></ul></li><li>ghi</li></ul>',
                        stepFunction: async (editor) => {
                            await insertParagraphBreak(editor);
                            await insertParagraphBreak(editor);
                        },
                        contentAfter:
                            '<ul><li>abc</li><li class="oe-nested"><ul><li>def</li></ul></li><li>[]<br></li><li>ghi</li></ul>',
                    });
                }
            );

            test.todo("should remove a list", async () => {
                await testEditor({
                    contentBefore: "<ul><li><p>[]<br></p></li></ul>",
                    stepFunction: insertParagraphBreak,
                    contentAfter: "<p>[]<br></p>",
                });
            });

            test.todo("should remove a list set to bold", async () => {
                await testEditor({
                    contentBefore: "<ul><li><p><b>[]<br></b></p></li></ul>",
                    stepFunction: insertParagraphBreak,
                    contentAfter: "<p>[]<br></p>",
                });
            });
        });
        describe("With attributes", () => {
            test.todo("should add two list items at the end of a list with a class", async () => {
                await testEditor({
                    contentBefore: '<ul class="a"><li>abc[]</li></ul>',
                    stepFunction: async (editor) => {
                        await insertParagraphBreak(editor);
                        await insertText(editor, "b");
                        await insertParagraphBreak(editor);
                    },
                    contentAfter: '<ul class="a"><li>abc</li><li>b</li><li>[]<br></li></ul>',
                });
            });

            test.todo("should add two list items with a class at the end of a list", async () => {
                await testEditor({
                    contentBefore: '<ul><li class="a">abc[]</li></ul>',
                    stepFunction: async (editor) => {
                        await insertParagraphBreak(editor);
                        await insertText(editor, "b");
                        await insertParagraphBreak(editor);
                    },
                    contentAfter:
                        '<ul><li class="a">abc</li><li class="a">b</li><li class="a">[]<br></li></ul>',
                });
            });

            test.todo("should create list items after one with a block in it", async () => {
                await testEditor({
                    contentBefore:
                        '<ul><li class="a"><custom-block style="display: block;">abc[]</custom-block></li></ul>',
                    stepFunction: async (editor) => {
                        await insertParagraphBreak(editor);
                        await insertText(editor, "b");
                        await insertParagraphBreak(editor);
                    },
                    contentAfter:
                        '<ul><li class="a"><custom-block style="display: block;">abc</custom-block></li>' +
                        '<li class="a"><custom-block style="display: block;">b</custom-block></li>' +
                        '<li class="a"><custom-block style="display: block;">[]<br></custom-block></li></ul>',
                });
                await testEditor({
                    contentBefore:
                        '<ul><li><custom-block class="a" style="display: block;">abc[]</custom-block></li></ul>',
                    stepFunction: async (editor) => {
                        await insertParagraphBreak(editor);
                        await insertText(editor, "b");
                        await insertParagraphBreak(editor);
                    },
                    contentAfter:
                        '<ul><li><custom-block class="a" style="display: block;">abc</custom-block></li>' +
                        '<li><custom-block class="a" style="display: block;">b</custom-block></li>' +
                        '<li><custom-block class="a" style="display: block;">[]<br></custom-block></li></ul>',
                });
            });

            test("should keep the list-style when add li", async () => {
                await testEditor({
                    contentBefore: unformat(`
                            <ul>
                                <li style="list-style: cambodian;">a[]</li>
                            </ul>`),
                    stepFunction: insertParagraphBreak,
                    contentAfter: unformat(`
                        <ul>
                            <li style="list-style: cambodian;">a</li>
                            <li style="list-style: cambodian;">[]<br></li>
                        </ul>`),
                });
            });
        });
    });
    describe("Checklist", () => {
        describe("Basic", () => {
            test("should add an empty list item before a checklist item (unchecked)", async () => {
                await testEditor({
                    removeCheckIds: true,
                    contentBefore: '<ul class="o_checklist"><li>[]abc</li></ul>',
                    stepFunction: insertParagraphBreak,
                    contentAfter: '<ul class="o_checklist"><li><br></li><li>[]abc</li></ul>',
                });
            });

            test("should add an empty list item before a checklist item (checked)", async () => {
                await testEditor({
                    removeCheckIds: true,
                    contentBefore: '<ul class="o_checklist"><li>[]abc</li></ul>',
                    stepFunction: insertParagraphBreak,
                    contentAfter: '<ul class="o_checklist"><li><br></li><li>[]abc</li></ul>',
                });
            });

            test("should split a checklist item in two (unchecked)", async () => {
                await testEditor({
                    removeCheckIds: true,
                    contentBefore: '<ul class="o_checklist"><li>ab[]cd</li></ul>',
                    stepFunction: insertParagraphBreak,
                    contentAfter: '<ul class="o_checklist"><li>ab</li><li>[]cd</li></ul>',
                });
            });

            test.todo("should split a checklist item in two (checked)", async () => {
                await testEditor({
                    removeCheckIds: true,
                    contentBefore: '<ul class="o_checklist"><li class="o_checked">ab[]cd</li></ul>',
                    stepFunction: insertParagraphBreak,
                    contentAfter:
                        '<ul class="o_checklist"><li class="o_checked">ab</li><li>[]cd</li></ul>',
                });
            });

            test.todo(
                "should add an empty list item after a checklist item (unchecked)",
                async () => {
                    await testEditor({
                        removeCheckIds: true,
                        contentBefore:
                            '<ul class="o_checklist"><li class="o_checked">abc[]</li></ul>',
                        stepFunction: insertParagraphBreak,
                        contentAfter:
                            '<ul class="o_checklist"><li class="o_checked">abc</li><li>[]<br></li></ul>',
                    });
                }
            );

            test.todo(
                "should add an empty list item after a checklist item (checked)",
                async () => {
                    await testEditor({
                        removeCheckIds: true,
                        contentBefore:
                            '<ul class="o_checklist"><li class="o_checked">abc[]</li></ul>',
                        stepFunction: insertParagraphBreak,
                        contentAfter:
                            '<ul class="o_checklist"><li class="o_checked">abc</li><li>[]<br></li></ul>',
                    });
                }
            );
        });
        describe("Removing items", () => {
            test.todo(
                "should add an empty list item at the end of a checklist, then remove it",
                async () => {
                    await testEditor({
                        removeCheckIds: true,
                        contentBefore:
                            '<ul class="o_checklist"><li class="o_checked">abc[]</li></ul>',
                        stepFunction: async (editor) => {
                            await insertParagraphBreak(editor);
                            await insertParagraphBreak(editor);
                        },
                        contentAfter:
                            '<ul class="o_checklist"><li class="o_checked">abc</li></ul><p>[]<br></p>',
                    });
                }
            );

            test.todo(
                "should add an empty list item at the end of an indented list, then outdent it (checked)",
                async () => {
                    await testEditor({
                        removeCheckIds: true,
                        contentBefore:
                            '<ul class="o_checklist"><li class="o_checked">abc</li><li class="oe-nested"><ul class="o_checklist"><li class="o_checked">def[]</li></ul></li><li class="o_checked">ghi</li></ul>',
                        stepFunction: async (editor) => {
                            await insertParagraphBreak(editor);
                            await insertParagraphBreak(editor);
                        },
                        contentAfter:
                            '<ul class="o_checklist"><li class="o_checked">abc</li><li class="oe-nested"><ul class="o_checklist"><li class="o_checked">def</li></ul></li><li>[]<br></li><li class="o_checked">ghi</li></ul>',
                    });
                }
            );

            test.todo(
                "should add an empty list item at the end of an indented list, then outdent it (unchecked)",
                async () => {
                    await testEditor({
                        removeCheckIds: true,
                        contentBefore:
                            '<ul class="o_checklist"><li>abc</li><li class="oe-nested"><ul class="o_checklist"><li>def[]</li></ul></li><li class="o_checked">ghi</li></ul>',
                        stepFunction: async (editor) => {
                            await insertParagraphBreak(editor);
                            await insertParagraphBreak(editor);
                        },
                        contentAfter:
                            '<ul class="o_checklist"><li>abc</li><li class="oe-nested"><ul class="o_checklist"><li>def</li></ul></li><li>[]<br></li><li class="o_checked">ghi</li></ul>',
                    });
                }
            );

            test.todo("should remove a checklist", async () => {
                await testEditor({
                    contentBefore:
                        '<ul class="o_checklist"><li class="o_checked"><p>[]<br></p></li></ul>',
                    stepFunction: insertParagraphBreak,
                    contentAfter: "<p>[]<br></p>",
                });
            });

            test.todo("should remove a checklist set to bold", async () => {
                await testEditor({
                    contentBefore:
                        '<ul class="o_checklist"><li class="o_checked"><p><b>[]<br></b></p></li></ul>',
                    stepFunction: insertParagraphBreak,
                    contentAfter: "<p>[]<br></p>",
                });
            });
        });
        describe("With attributes", () => {
            describe("after unchecked item", () => {
                test.todo(
                    "should add two list items at the end of a checklist with a class",
                    async () => {
                        await testEditor({
                            contentBefore: '<ul class="checklist a"><li>abc[]</li></ul>',
                            stepFunction: async (editor) => {
                                await insertParagraphBreak(editor);
                                await insertText(editor, "d");
                                await insertParagraphBreak(editor);
                            },
                            contentAfter:
                                '<ul class="checklist a"><li>abc</li><li>d</li><li>[]<br></li></ul>',
                        });
                    }
                );

                test.todo(
                    "should add two list items with a class at the end of a checklist",
                    async () => {
                        await testEditor({
                            removeCheckIds: true,
                            contentBefore: '<ul class="o_checklist"><li class="a">abc[]</li></ul>',
                            stepFunction: async (editor) => {
                                await insertParagraphBreak(editor);
                                await insertText(editor, "d");
                                await insertParagraphBreak(editor);
                            },
                            contentAfter:
                                '<ul class="o_checklist"><li class="a">abc</li><li class="a">d</li><li class="a">[]<br></li></ul>',
                        });
                    }
                );

                test.todo("should create list items after one with a block in it", async () => {
                    await testEditor({
                        removeCheckIds: true,
                        contentBefore:
                            '<ul class="o_checklist"><li class="a"><custom-block style="display: block;">abc[]</custom-block></li></ul>',
                        stepFunction: async (editor) => {
                            await insertParagraphBreak(editor);
                            await insertText(editor, "d");
                            await insertParagraphBreak(editor);
                        },
                        contentAfter:
                            '<ul class="o_checklist"><li class="a"><custom-block style="display: block;">abc</custom-block></li>' +
                            '<li class="a"><custom-block style="display: block;">d</custom-block></li>' +
                            '<li class="a"><custom-block style="display: block;">[]<br></custom-block></li></ul>',
                    });
                    await testEditor({
                        removeCheckIds: true,
                        contentBefore:
                            '<ul class="o_checklist"><li><custom-block class="a" style="display: block;">abc[]</custom-block></li></ul>',
                        stepFunction: async (editor) => {
                            await insertParagraphBreak(editor);
                            await insertText(editor, "d");
                            await insertParagraphBreak(editor);
                        },
                        contentAfter:
                            '<ul class="o_checklist"><li><custom-block class="a" style="display: block;">abc</custom-block></li>' +
                            '<li><custom-block class="a" style="display: block;">d</custom-block></li>' +
                            '<li><custom-block class="a" style="display: block;">[]<br></custom-block></li></ul>',
                    });
                });

                test.todo(
                    "should add two list items with a font at the end of a checklist within a checklist",
                    async () => {
                        await testEditor({
                            removeCheckIds: true,
                            contentBefore: unformat(`
                            <ul class="o_checklist">
                                <li>ab</li>
                                <li class="oe-nested">
                                    <ul class="o_checklist">
                                        <li>
                                            <font style="color: red;">cd[]</font>
                                        </li>
                                    </ul>
                                </li>
                                <li class="o_checked">ef</li>
                            </ul>`),
                            stepFunction: async (editor) => {
                                await insertParagraphBreak(editor);
                                await insertText(editor, "0");
                                await insertParagraphBreak(editor);
                            },
                            contentAfter: unformat(`
                            <ul class="o_checklist">
                                <li>ab</li>
                                <li class="oe-nested">
                                    <ul class="o_checklist">
                                        <li><font style="color: red;">cd</font></li>
                                        <li>0</li>
                                        <li>[]<br></li>
                                    </ul>
                                </li>
                                <li class="o_checked">ef</li>
                            </ul>`),
                        });
                    }
                );
            });
            describe("after checked item", () => {
                // TODO: do not clone the `IsChecked` modifier
                // on split (waiting for `preserve` property of
                // `Modifier`).

                test.todo(
                    "should add two list items at the end of a checklist with a class",
                    async () => {
                        await testEditor({
                            removeCheckIds: true,
                            contentBefore:
                                '<ul class="checklist a"><li class="o_checked">abc[]</li></ul>',
                            stepFunction: async (editor) => {
                                await insertParagraphBreak(editor);
                                await insertText(editor, "d");
                                await insertParagraphBreak(editor);
                            },
                            contentAfter:
                                '<ul class="checklist a"><li class="o_checked">abc</li><li>d</li><li>[]<br></li></ul>',
                        });
                    }
                );

                test.todo(
                    "should add two list items with a class at the end of a checklist",
                    async () => {
                        await testEditor({
                            removeCheckIds: true,
                            contentBefore:
                                '<ul class="o_checklist"><li class="a o_checked">abc[]</li></ul>',
                            stepFunction: async (editor) => {
                                await insertParagraphBreak(editor);
                                await insertText(editor, "d");
                                await insertParagraphBreak(editor);
                            },
                            contentAfter:
                                '<ul class="o_checklist"><li class="a o_checked">abc</li><li class="a">d</li><li class="a">[]<br></li></ul>',
                        });
                    }
                );
                test.skip("should add two list items with a class and a div at the end of a checklist", async () => {
                    await testEditor({
                        removeCheckIds: true,
                        contentBefore:
                            '<ul class="o_checklist"><li class="a o_checked"><div>abc[]</div></li></ul>',
                        stepFunction: async (editor) => {
                            await insertParagraphBreak(editor);
                            await insertText(editor, "d");
                            await insertParagraphBreak(editor);
                        },
                        contentAfter:
                            '<ul class="o_checklist"><li class="a o_checked"><div>abc</div></li><li class="a"><div>d</div></li><li class="a"><div>[]<br></div></li></ul>',
                    });
                });
                test.skip("should add two list items with a div with a class at the end of a checklist", async () => {
                    await testEditor({
                        removeCheckIds: true,
                        contentBefore:
                            '<ul class="o_checklist"><li class="o_checked"><div class="a">abc[]</div></li></ul>',
                        stepFunction: async (editor) => {
                            await insertParagraphBreak(editor);
                            await insertText(editor, "d");
                            await insertParagraphBreak(editor);
                        },
                        contentAfter:
                            '<ul class="o_checklist"><li class="o_checked"><div class="a">abc</div></li><li><div class="a">d</div></li><li><div class="a">[]<br></div></li></ul>',
                    });
                });

                test.todo(
                    "should add two list items with a font at the end of a checklist within a checklist",
                    async () => {
                        await testEditor({
                            removeCheckIds: true,
                            contentBefore: unformat(`
                            <ul class="o_checklist">
                                <li class="o_checked">ab</li>
                                <li class="oe-nested">
                                    <ul class="o_checklist">
                                        <li class="o_checked">
                                            <font style="color: red;">cd[]</font>
                                        </li>
                                    </ul>
                                </li>
                                <li class="o_checked">ef</li>
                            </ul>`),
                            stepFunction: async (editor) => {
                                await insertParagraphBreak(editor);
                                await insertText(editor, "0");
                                await insertParagraphBreak(editor);
                            },
                            contentAfter: unformat(`
                            <ul class="o_checklist">
                                <li class="o_checked">ab</li>
                                <li class="oe-nested">
                                    <ul class="o_checklist">
                                        <li class="o_checked"><font style="color: red;">cd</font></li>
                                        <li>0</li>
                                        <li>[]<br></li>
                                    </ul>
                                </li>
                                <li class="o_checked">ef</li>
                            </ul>`),
                        });
                    }
                );
            });
        });
    });
    describe("Mixed", () => {
        describe("Ordered to unordered", () => {});
        describe("Unordered to ordered", () => {});
    });
});
describe("Selection not collapsed", () => {
    test.todo("should delete part of a list item, then split it", async () => {
        // Forward selection
        await testEditor({
            contentBefore: "<ul><li>ab[cd]ef</li></ul>",
            stepFunction: insertParagraphBreak,
            contentAfter: "<ul><li>ab</li><li>[]ef</li></ul>",
        });
        // Backward selection
        await testEditor({
            contentBefore: "<ul><li>ab]cd[ef</li></ul>",
            stepFunction: insertParagraphBreak,
            contentAfter: "<ul><li>ab</li><li>[]ef</li></ul>",
        });
    });

    test.todo("should delete all contents of a list item, then split it", async () => {
        // Forward selection
        await testEditor({
            contentBefore: "<ul><li>[abc]</li></ul>",
            stepFunction: insertParagraphBreak,
            // JW cAfter: '<ul><li><br></li><li>[]<br></li></ul>',
            contentAfter: "<p>[]<br></p>",
        });
        // Backward selection
        await testEditor({
            contentBefore: "<ul><li>]abc[</li></ul>",
            stepFunction: insertParagraphBreak,
            contentAfter: "<p>[]<br></p>",
            // JW cAfter: '<ul><li><br></li><li>[]<br></li></ul>',
        });
    });

    test.todo("should delete across two list items, then split what's left", async () => {
        // Forward selection
        await testEditor({
            contentBefore: "<ul><li>ab[cd</li><li>ef]gh</li></ul>",
            stepFunction: insertParagraphBreak,
            contentAfter: "<ul><li>ab</li><li>[]gh</li></ul>",
        });
        // Backward selection
        await testEditor({
            contentBefore: "<ul><li>ab]cd</li><li>ef[gh</li></ul>",
            stepFunction: insertParagraphBreak,
            contentAfter: "<ul><li>ab</li><li>[]gh</li></ul>",
        });
    });

    test.todo("should delete part of a checklist item, then split it", async () => {
        // Forward selection
        await testEditor({
            contentBefore: "<ul><li>ab[cd]ef</li></ul>",
            stepFunction: insertParagraphBreak,
            contentAfter: "<ul><li>ab</li><li>[]ef</li></ul>",
        });
        // Backward selection
        await testEditor({
            contentBefore: "<ul><li>ab]cd[ef</li></ul>",
            stepFunction: insertParagraphBreak,
            contentAfter: "<ul><li>ab</li><li>[]ef</li></ul>",
        });
    });

    test.todo("should delete all contents of a checklist item, then split it", async () => {
        // Forward selection
        await testEditor({
            contentBefore: "<ul><li>[abc]</li></ul>",
            stepFunction: insertParagraphBreak,
            // JW cAfter: '<ul><li><br></li><li>[]<br></li></ul>',
            contentAfter: "<p>[]<br></p>",
        });
        // Backward selection
        await testEditor({
            contentBefore: "<ul><li>]abc[</li></ul>",
            stepFunction: insertParagraphBreak,
            // JW cAfter: '<ul><li><br></li><li>[]<br></li></ul>',
            contentAfter: "<p>[]<br></p>",
        });
    });
});
