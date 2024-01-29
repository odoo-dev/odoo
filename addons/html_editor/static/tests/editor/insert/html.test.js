/** @odoo-module */

import { parseHTML } from "@html_editor/editor/utils/html";
import { setCursorEnd } from "@html_editor/editor/utils/selection";
import { describe, test } from "@odoo/hoot";
import { testEditor } from "../../test_helpers/editor";
import { unformat } from "../../test_helpers/format";

function span(text) {
    const span = document.createElement("span");
    span.innerText = text;
    span.classList.add("a");
    return span;
}

describe("collapsed selection", () => {
    test.todo("should insert html in an empty paragraph / empty editable", async () => {
        await testEditor({
            contentBefore: "<p>[]<br></p>",
            stepFunction: async (editor) => {
                await editor.dispatch(
                    "INSERT",
                    parseHTML(editor.document, '<i class="fa fa-pastafarianism"></i>')
                );
            },
            contentAfterEdit:
                '<p><i class="fa fa-pastafarianism" contenteditable="false">\u200b</i>[]<br></p>',
            contentAfter: '<p><i class="fa fa-pastafarianism"></i>[]<br></p>',
        });
    });

    test.todo("should insert html after an empty paragraph", async () => {
        await testEditor(
            {
                // This scenario is only possible with the allowInlineAtRoot option.
                contentBefore: "<p><br></p>[]",
                stepFunction: async (editor) => {
                    await editor.dispatch(
                        "INSERT",
                        parseHTML(editor.document, '<i class="fa fa-pastafarianism"></i>')
                    );
                },
                contentAfterEdit:
                    '<p><br></p><i class="fa fa-pastafarianism" contenteditable="false">\u200b</i>[]',
                contentAfter: '<p><br></p><i class="fa fa-pastafarianism"></i>[]',
            },
            { allowInlineAtRoot: true }
        );
    });

    test.todo("should insert html between two letters", async () => {
        await testEditor({
            contentBefore: "<p>a[]b<br></p>",
            stepFunction: async (editor) => {
                await editor.dispatch(
                    "INSERT",
                    parseHTML(editor.document, '<i class="fa fa-pastafarianism"></i>')
                );
            },
            contentAfterEdit:
                '<p>a<i class="fa fa-pastafarianism" contenteditable="false">\u200b</i>[]b<br></p>',
            contentAfter: '<p>a<i class="fa fa-pastafarianism"></i>[]b<br></p>',
        });
    });

    test.todo("should insert html in between naked text in the editable", async () => {
        await testEditor({
            contentBefore: "<p>a[]b<br></p>",
            stepFunction: async (editor) => {
                await editor.dispatch(
                    "INSERT",
                    parseHTML(editor.document, '<i class="fa fa-pastafarianism"></i>')
                );
            },
            contentAfterEdit:
                '<p>a<i class="fa fa-pastafarianism" contenteditable="false">\u200b</i>[]b<br></p>',
            contentAfter: '<p>a<i class="fa fa-pastafarianism"></i>[]b<br></p>',
        });
    });

    test.todo(
        "should insert several html nodes in between naked text in the editable",
        async () => {
            await testEditor({
                contentBefore: "<p>a[]e<br></p>",
                stepFunction: async (editor) => {
                    await editor.dispatch(
                        "INSERT",
                        parseHTML(editor.document, "<p>b</p><p>c</p><p>d</p>")
                    );
                },
                contentAfter: "<p>ab</p><p>c</p><p>d[]e<br></p>",
            });
        }
    );

    test.todo("should keep a paragraph after a div block", async () => {
        await testEditor({
            contentBefore: "<p>[]<br></p>",
            stepFunction: async (editor) => {
                await editor.dispatch(
                    "INSERT",
                    parseHTML(editor.document, "<div><p>content</p></div>")
                );
            },
            contentAfter: "<div><p>content</p></div><p>[]<br></p>",
        });
    });

    test.todo("should not split a pre to insert another pre but just insert the text", async () => {
        await testEditor({
            contentBefore: "<pre>abc[]<br>ghi</pre>",
            stepFunction: async (editor) => {
                await editor.dispatch("INSERT", parseHTML(editor.document, "<pre>def</pre>"));
            },
            contentAfter: "<pre>abcdef[]<br>ghi</pre>",
        });
    });

    test.todo(
        'should keep an "empty" block which contains fontawesome nodes when inserting multiple nodes',
        async () => {
            await testEditor({
                contentBefore: "<p>content[]</p>",
                stepFunction: async (editor) => {
                    await editor.dispatch(
                        "INSERT",
                        parseHTML(
                            editor.document,
                            '<p>unwrapped</p><div><i class="fa fa-circle-o-notch"></i></div><p>culprit</p><p>after</p>'
                        )
                    );
                },
                contentAfter:
                    '<p>contentunwrapped</p><div><i class="fa fa-circle-o-notch"></i></div><p>culprit</p><p>after[]</p>',
            });
        }
    );

    test.todo(
        "should not unwrap single node if the selection anchorNode is the editable",
        async () => {
            await testEditor({
                contentBefore: "<p>content</p>",
                stepFunction: async (editor) => {
                    setCursorEnd(editor.editable, false);
                    await editor.dispatch("INSERT", parseHTML(editor.document, "<p>def</p>"));
                },
                contentAfter: "<p>content</p><p>def[]</p>",
            });
        }
    );

    test.todo("should not unwrap nodes if the selection anchorNode is the editable", async () => {
        await testEditor({
            contentBefore: "<p>content</p>",
            stepFunction: async (editor) => {
                setCursorEnd(editor.editable, false);
                await editor.dispatch(
                    "INSERT",
                    parseHTML(editor.document, "<div>abc</div><p>def</p>")
                );
            },
            contentAfter: "<p>content</p><div>abc</div><p>def[]</p>",
        });
    });
});

describe("not collapsed selection", () => {
    test.todo("should delete selection and insert html in its place", async () => {
        await testEditor({
            contentBefore: "<p>[a]<br></p>",
            stepFunction: async (editor) => {
                await editor.dispatch(
                    "INSERT",
                    parseHTML(editor.document, '<i class="fa fa-pastafarianism"></i>')
                );
            },
            contentAfterEdit:
                '<p><i class="fa fa-pastafarianism" contenteditable="false">\u200b</i>[]<br></p>',
            contentAfter: '<p><i class="fa fa-pastafarianism"></i>[]<br></p>',
        });
    });

    test.todo("should delete selection and insert html in its place (2)", async () => {
        await testEditor({
            contentBefore: "<p>a[b]c<br></p>",
            stepFunction: async (editor) => {
                await editor.dispatch(
                    "INSERT",
                    parseHTML(editor.document, '<i class="fa fa-pastafarianism"></i>')
                );
            },
            contentAfterEdit:
                '<p>a<i class="fa fa-pastafarianism" contenteditable="false">\u200b</i>[]c<br></p>',
            contentAfter: '<p>a<i class="fa fa-pastafarianism"></i>[]c<br></p>',
        });
    });

    test.todo("should remove a fully selected table then insert a span before it", async () => {
        await testEditor({
            contentBefore: unformat(
                `<p>a[b</p>
                    <table><tbody>
                        <tr><td>cd</td><td>ef</td></tr>
                        <tr><td>gh</td><td>ij</td></tr>
                    </tbody></table>
                    <p>k]l</p>`
            ),
            stepFunction: (editor) => editor.dispatch("INSERT", span("TEST")),
            contentAfter: '<p>a<span class="a">TEST</span>[]l</p>',
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
                stepFunction: (editor) => editor.dispatch("INSERT", span("TEST")),
                contentAfter: unformat(
                    `<table><tbody>
                        <tr><td>cd</td><td><span class="a">TEST</span>[]<br></td><td>gh</td></tr>
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
                stepFunction: (editor) => editor.dispatch("INSERT", span("TEST")),
                contentAfter: unformat(
                    `<p>a<span class="a">TEST</span>[]</p>
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
                stepFunction: (editor) => editor.dispatch("INSERT", span("TEST")),
                contentAfter: unformat(
                    `<p>ab</p>
                    <p><span class="a">TEST</span>[]l</p>`
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
            stepFunction: (editor) => editor.dispatch("INSERT", span("TEST")),
            contentAfter: `<p>a<span class="a">TEST</span>[]l</p>`,
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
            stepFunction: (editor) => editor.dispatch("INSERT", span("TEST")),
            contentAfter: `<p><span class="a">TEST</span>[]<br></p>`,
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
            stepFunction: (editor) => editor.dispatch("INSERT", span("TEST")),
            contentAfter: `<p>0<span class="a">TEST</span>[]</p>`,
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
            stepFunction: (editor) => editor.dispatch("INSERT", span("TEST")),
            contentAfter: `<p><span class="a">TEST</span>[]<br></p>`,
        });
    });
});
