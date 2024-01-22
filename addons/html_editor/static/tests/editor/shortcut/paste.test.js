/** @odoo-module */

import { CLIPBOARD_WHITELISTS } from "@html_editor/editor/utils/clipboard";
import { setSelection } from "@html_editor/editor/utils/selection";
import { describe, test } from "@odoo/hoot";
import { dispatch } from "@odoo/hoot-dom";
import { setSelection as setTestSelection, testEditor } from "../../helpers";

// Mock an paste event and send it to the editor.
async function pasteData(editor, text, type) {
    const mockEvent = {
        dataType: "text/plain",
        data: text,
        clipboardData: {
            getData: (datatype) => (type === datatype ? text : null),
            files: [],
            items: [],
        },
        preventDefault: () => {},
    };
    // TODO @phoenix need to replace _onPaste.
    await editor._onPaste(mockEvent);
}
function pasteText(editor, text) {
    return pasteData(editor, text, "text/plain");
}
function pasteHtml(editor, html) {
    return pasteData(editor, html, "text/html");
}
function pasteOdooEditorHtml(editor, html) {
    return pasteData(editor, html, "text/odoo-editor");
}

function isInline(node) {
    return ["I", "B", "U", "S", "EM", "STRONG", "IMG", "BR", "A", "FONT"].includes(node);
}

function toIgnore(node) {
    return ["TABLE", "THEAD", "TH", "TBODY", "TR", "TD", "IMG", "BR", "LI", ".fa"].includes(node);
}

describe("Html Paste cleaning - whitelist", () => {
    test.todo("should keep whitelisted Tags tag", async () => {
        for (const node of CLIPBOARD_WHITELISTS.nodes) {
            if (!toIgnore(node)) {
                const html = isInline(node)
                    ? `a<${node.toLowerCase()}>b</${node.toLowerCase()}>c`
                    : `a</p><${node.toLowerCase()}>b</${node.toLowerCase()}><p>c`;

                await testEditor({
                    contentBefore: "<p>123[]4</p>",
                    stepFunction: async (editor) => {
                        await pasteHtml(
                            editor,
                            `a<${node.toLowerCase()}>b</${node.toLowerCase()}>c`
                        );
                    },
                    contentAfter: "<p>123" + html.replace(/<\/?font>/g, "") + "[]4</p>",
                });
            }
        }
    });

    test.todo("should keep whitelisted Tags tag (2)", async () => {
        const tagsToKeep = [
            'a<img src="http://www.imgurl.com/img.jpg">d', // img tag
            "a<br>b", // br tags
        ];

        for (const tagToKeep of tagsToKeep) {
            await testEditor({
                contentBefore: "<p>123[]</p>",
                stepFunction: async (editor) => {
                    await pasteHtml(editor, tagToKeep);
                },
                contentAfter: "<p>123" + tagToKeep + "[]</p>",
            });
        }
    });

    test.todo("should keep tables Tags tag and add classes", async () => {
        await testEditor({
            contentBefore: "<p>123[]</p>",
            stepFunction: async (editor) => {
                await pasteHtml(
                    editor,
                    "a<table><thead><tr><th>h</th></tr></thead><tbody><tr><td>b</td></tr></tbody></table>d"
                );
            },
            contentAfter:
                '<p>123a</p><table class="table table-bordered"><thead><tr><th>h</th></tr></thead><tbody><tr><td>b</td></tr></tbody></table><p>d[]</p>',
        });
    });

    test.todo("should not keep span", async () => {
        await testEditor({
            contentBefore: "<p>123[]</p>",
            stepFunction: async (editor) => {
                await pasteHtml(editor, "a<span>bc</span>d");
            },
            contentAfter: "<p>123abcd[]</p>",
        });
    });

    test.todo("should not keep orphan LI", async () => {
        await testEditor({
            contentBefore: "<p>123[]</p>",
            stepFunction: async (editor) => {
                await pasteHtml(editor, "a<li>bc</li>d");
            },
            contentAfter: "<p>123a</p><p>bc</p><p>d[]</p>",
        });
    });

    test.todo("should keep LI in UL", async () => {
        await testEditor({
            contentBefore: "<p>123[]</p>",
            stepFunction: async (editor) => {
                await pasteHtml(editor, "a<ul><li>bc</li></ul>d");
            },
            contentAfter: "<p>123a</p><ul><li>bc</li></ul><p>d[]</p>",
        });
    });

    test.todo("should keep P and B and not span", async () => {
        await testEditor({
            contentBefore: "<p>123[]xx</p>",
            stepFunction: async (editor) => {
                await pasteHtml(editor, "a<p>bc</p>d<span>e</span>f<b>g</b>h");
            },
            contentAfter: "<p>123a</p><p>bc</p><p>def<b>g</b>h[]xx</p>",
        });
    });

    test.todo("should keep styled span", async () => {
        await testEditor({
            contentBefore: "<p>123[]</p>",
            stepFunction: async (editor) => {
                await pasteHtml(editor, 'a<span style="text-decoration: underline">bc</span>d');
            },
            contentAfter: "<p>123abcd[]</p>",
        });
    });

    test.todo(
        "should remove unwanted styles and b tag when pasting from paragraph from gdocs",
        async () => {
            await testEditor({
                contentBefore: "<p>[]<br></p>",
                stepFunction: async (editor) => {
                    await pasteHtml(
                        editor,
                        `<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-ddad60c5-7fff-0a8f-fdd5-c1107201fe26"><p dir="ltr" style="line-height:1.38;margin-top:0pt;margin-bottom:0pt;"><span style="font-size:11pt;font-family:Arial,sans-serif;color:#000000;background-color:transparent;font-weight:400;font-style:normal;font-variant:normal;text-decoration:none;vertical-align:baseline;white-space:pre;white-space:pre-wrap;">test1</span></p><p dir="ltr" style="line-height:1.38;margin-top:0pt;margin-bottom:0pt;"><span style="font-size:11pt;font-family:Arial,sans-serif;color:#000000;background-color:transparent;font-weight:400;font-style:normal;font-variant:normal;text-decoration:none;vertical-align:baseline;white-space:pre;white-space:pre-wrap;">test2</span></p></b>`
                    );
                },
                contentAfter: "<p>test1</p><p>test2[]<br></p>",
            });
        }
    );

    test.todo(
        "should remove unwanted b tag and p tag with unwanted styles when pasting list from gdocs",
        async () => {
            await testEditor({
                contentBefore: "<p>[]<br></p>",
                stepFunction: async (editor) => {
                    await pasteHtml(
                        editor,
                        '<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-5d8bcf85-7fff-ebec-8604-eedd96f2d601"><ul style="margin-top:0;margin-bottom:0;padding-inline-start:48px;"><li dir="ltr" style="list-style-type:disc;font-size:11pt;font-family:Arial,sans-serif;color:#000000;background-color:transparent;font-weight:400;font-style:normal;font-variant:normal;text-decoration:none;vertical-align:baseline;white-space:pre;" aria-level="1"><p dir="ltr" style="line-height:1.38;margin-top:0pt;margin-bottom:0pt;" role="presentation"><span style="font-size:11pt;font-family:Arial,sans-serif;color:#000000;background-color:transparent;font-weight:400;font-style:normal;font-variant:normal;text-decoration:none;vertical-align:baseline;white-space:pre;white-space:pre-wrap;">Google</span></p></li><li dir="ltr" style="list-style-type:disc;font-size:11pt;font-family:Arial,sans-serif;color:#000000;background-color:transparent;font-weight:400;font-style:normal;font-variant:normal;text-decoration:none;vertical-align:baseline;white-space:pre;" aria-level="1"><p dir="ltr" style="line-height:1.38;margin-top:0pt;margin-bottom:0pt;" role="presentation"><span style="font-size:11pt;font-family:Arial,sans-serif;color:#000000;background-color:transparent;font-weight:400;font-style:normal;font-variant:normal;text-decoration:none;vertical-align:baseline;white-space:pre;white-space:pre-wrap;">Test</span></p></li><li dir="ltr" style="list-style-type:disc;font-size:11pt;font-family:Arial,sans-serif;color:#000000;background-color:transparent;font-weight:400;font-style:normal;font-variant:normal;text-decoration:none;vertical-align:baseline;white-space:pre;" aria-level="1"><p dir="ltr" style="line-height:1.38;margin-top:0pt;margin-bottom:0pt;" role="presentation"><span style="font-size:11pt;font-family:Arial,sans-serif;color:#000000;background-color:transparent;font-weight:400;font-style:normal;font-variant:normal;text-decoration:none;vertical-align:baseline;white-space:pre;white-space:pre-wrap;">test2</span></p></li></ul></b>'
                    );
                },
                contentAfter: "<ul><li>Google</li><li>Test</li><li>test2</li></ul><p>[]<br></p>",
            });
        }
    );

    test.todo(
        "should remove unwanted styles and keep tags when pasting list from gdoc",
        async () => {
            await testEditor({
                contentBefore: "<p>[]<br></p>",
                stepFunction: async (editor) => {
                    await pasteHtml(
                        editor,
                        '<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-477946a8-7fff-f959-18a4-05014997e161"><ul style="margin-top:0;margin-bottom:0;padding-inline-start:48px;"><li dir="ltr" style="list-style-type:disc;font-size:20pt;font-family:Arial,sans-serif;color:#000000;background-color:transparent;font-weight:400;font-style:normal;font-variant:normal;text-decoration:none;vertical-align:baseline;white-space:pre;" aria-level="1"><h1 dir="ltr" style="line-height:1.38;margin-top:20pt;margin-bottom:0pt;" role="presentation"><span style="font-size:20pt;font-family:Arial,sans-serif;color:#000000;background-color:transparent;font-weight:400;font-style:normal;font-variant:normal;text-decoration:none;vertical-align:baseline;white-space:pre;white-space:pre-wrap;">Google</span></h1></li><li dir="ltr" style="list-style-type:disc;font-size:20pt;font-family:Arial,sans-serif;color:#000000;background-color:transparent;font-weight:400;font-style:normal;font-variant:normal;text-decoration:none;vertical-align:baseline;white-space:pre;" aria-level="1"><h1 dir="ltr" style="line-height:1.38;margin-top:0pt;margin-bottom:6pt;" role="presentation"><span style="font-size:20pt;font-family:Arial,sans-serif;color:#000000;background-color:transparent;font-weight:400;font-style:normal;font-variant:normal;text-decoration:none;vertical-align:baseline;white-space:pre;white-space:pre-wrap;">Test</span></h1></li><li dir="ltr" style="list-style-type:disc;font-size:20pt;font-family:Arial,sans-serif;color:#000000;background-color:transparent;font-weight:400;font-style:normal;font-variant:normal;text-decoration:none;vertical-align:baseline;white-space:pre;" aria-level="1"><h1 dir="ltr" style="line-height:1.38;margin-top:20pt;margin-bottom:0pt;" role="presentation"><span style="font-size:20pt;font-family:Arial,sans-serif;color:#000000;background-color:transparent;font-weight:400;font-style:normal;font-variant:normal;text-decoration:none;vertical-align:baseline;white-space:pre;white-space:pre-wrap;">test2</span></h1></li></ul></b>'
                    );
                },
                contentAfter:
                    "<ul><li><h1>Google</h1></li><li><h1>Test</h1></li><li><h1>test2</h1></li></ul><p>[]<br></p>",
            });
        }
    );
});

describe("Simple text", () => {
    describe("range collapsed", () => {
        test.todo("should paste a text at the beginning of a p", async () => {
            await testEditor({
                contentBefore: "<p>[]abcd</p>",
                stepFunction: async (editor) => {
                    await pasteHtml(editor, "x");
                },
                contentAfter: "<p>x[]abcd</p>",
            });
        });

        test.todo("should paste a text in a p", async () => {
            await testEditor({
                contentBefore: "<p>ab[]cd</p>",
                stepFunction: async (editor) => {
                    await pasteText(editor, "x");
                },
                contentAfter: "<p>abx[]cd</p>",
            });
            await testEditor({
                contentBefore: "<p>ab[]cd</p>",
                stepFunction: async (editor) => {
                    await pasteText(editor, "xyz 123");
                },
                contentAfter: "<p>abxyz 123[]cd</p>",
            });
            await testEditor({
                contentBefore: "<p>ab[]cd</p>",
                stepFunction: async (editor) => {
                    await pasteText(editor, "x    y");
                },
                contentAfter: "<p>abx&nbsp; &nbsp; y[]cd</p>",
            });
        });

        test.todo("should paste a text in a span", async () => {
            await testEditor({
                contentBefore: '<p>a<span class="a">b[]c</span>d</p>',
                stepFunction: async (editor) => {
                    await pasteText(editor, "x");
                },
                contentAfter: '<p>a<span class="a">bx[]c</span>d</p>',
            });
        });
        // TODO: We might want to have it consider \n as paragraph breaks
        // instead of linebreaks but that would be an opinionated choice.
        test.todo("should paste text and understand \\n newlines", async () => {
            await testEditor({
                contentBefore: "<p>[]<br/></p>",
                stepFunction: async (editor) => {
                    await pasteText(editor, "a\nb\nc\nd");
                },
                contentAfter:
                    '<p style="margin-bottom: 0px;">a</p>' +
                    '<p style="margin-bottom: 0px;">b</p>' +
                    '<p style="margin-bottom: 0px;">c</p>' +
                    "<p>d[]<br></p>",
            });
        });

        test.todo("should paste text and understand \\r\\n newlines", async () => {
            await testEditor({
                contentBefore: "<p>[]<br/></p>",
                stepFunction: async (editor) => {
                    await pasteText(editor, "a\r\nb\r\nc\r\nd");
                },
                contentAfter:
                    '<p style="margin-bottom: 0px;">a</p>' +
                    '<p style="margin-bottom: 0px;">b</p>' +
                    '<p style="margin-bottom: 0px;">c</p>' +
                    "<p>d[]<br></p>",
            });
        });
    });

    describe("range not collapsed", () => {
        test.todo("should paste a text in a p", async () => {
            await testEditor({
                contentBefore: "<p>a[bc]d</p>",
                stepFunction: async (editor) => {
                    await pasteText(editor, "x");
                },
                contentAfter: "<p>ax[]d</p>",
            });
            await testEditor({
                contentBefore: "<p>a[bc]d</p>",
                stepFunction: async (editor) => {
                    await pasteText(editor, "xyz 123");
                },
                contentAfter: "<p>axyz 123[]d</p>",
            });
            await testEditor({
                contentBefore: "<p>a[bc]d</p>",
                stepFunction: async (editor) => {
                    await pasteText(editor, "x    y");
                },
                contentAfter: "<p>ax&nbsp; &nbsp; y[]d</p>",
            });
        });

        test.todo("should paste a text in a span", async () => {
            await testEditor({
                contentBefore: '<p>a<span class="a">b[cd]e</span>f</p>',
                stepFunction: async (editor) => {
                    await pasteText(editor, "x");
                },
                contentAfter: '<p>a<span class="a">bx[]e</span>f</p>',
            });
        });

        test.todo("should paste a text when selection across two span", async () => {
            await testEditor({
                contentBefore: '<p>a<span class="a">b[c</span><span class="a">d]e</span>f</p>',
                stepFunction: async (editor) => {
                    await pasteText(editor, "x");
                },
                contentAfter: '<p>a<span class="a">bx[]e</span>f</p>',
            });
            await testEditor({
                contentBefore: '<p>a<span class="a">b[c</span>- -<span class="a">d]e</span>f</p>',
                stepFunction: async (editor) => {
                    await pasteText(editor, "y");
                },
                contentAfter: '<p>a<span class="a">by[]e</span>f</p>',
            });
        });

        test.todo("should paste a text when selection across two p", async () => {
            await testEditor({
                contentBefore: "<div>a<p>b[c</p><p>d]e</p>f</div>",
                stepFunction: async (editor) => {
                    await pasteText(editor, "x");
                },
                contentAfter: "<div>a<p>bx[]e</p>f</div>",
            });
            await testEditor({
                contentBefore: "<div>a<p>b[c</p>- -<p>d]e</p>f</div>",
                stepFunction: async (editor) => {
                    await pasteText(editor, "y");
                },
                contentAfter: "<div>a<p>by[]e</p>f</div>",
            });
        });

        test.todo("should paste a text when selection leave a span", async () => {
            await testEditor({
                contentBefore: '<div>ab<span class="a">c[d</span>e]f</div>',
                stepFunction: async (editor) => {
                    await pasteText(editor, "x");
                },
                contentAfter: '<div>ab<span class="a">cx[]</span>f</div>',
            });
            await testEditor({
                contentBefore: '<div>a[b<span class="a">c]d</span>ef</div>',
                stepFunction: async (editor) => {
                    await pasteText(editor, "y");
                },
                contentAfter: '<div>ay[]<span class="a">d</span>ef</div>',
            });
        });

        test.todo("should paste a text when selection across two element", async () => {
            await testEditor({
                contentBefore: '<div>1a<p>b[c</p><span class="a">d]e</span>f</div>',
                stepFunction: async (editor) => {
                    await pasteText(editor, "x");
                },
                contentAfter: '<div>1a<p>bx[]<span class="a">e</span>f</p></div>',
            });
            await testEditor({
                contentBefore: '<div>2a<span class="a">b[c</span><p>d]e</p>f</div>',
                stepFunction: async (editor) => {
                    await pasteText(editor, "x");
                },
                contentAfter: '<div>2a<span class="a">bx[]</span>e<br>f</div>',
            });
        });
    });
});

describe("Simple html span", () => {
    const simpleHtmlCharX =
        '<span style="font-family: -apple-system, BlinkMacSystemFont, &quot;Segoe UI&quot;, Roboto, &quot;Helvetica Neue&quot;, Arial, &quot;Noto Sans&quot;, sans-serif, &quot;Apple Color Emoji&quot;, &quot;Segoe UI Emoji&quot;, &quot;Segoe UI Symbol&quot;, &quot;Noto Color Emoji&quot;; font-variant-ligatures: normal; font-variant-caps: normal; letter-spacing: normal; orphans: 2; text-align: left; text-indent: 0px; text-transform: none; white-space: normal; widows: 2; word-spacing: 0px; -webkit-text-stroke-width: 0px; text-decoration-thickness: initial; text-decoration-style: initial; text-decoration-color: initial; display: inline !important; float: none;">x</span>';

    describe("range collapsed", () => {
        test.todo("should paste a text at the beginning of a p", async () => {
            await testEditor({
                contentBefore: "<p>[]abcd</p>",
                stepFunction: async (editor) => {
                    await pasteHtml(editor, simpleHtmlCharX);
                },
                contentAfter: "<p>x[]abcd</p>",
            });
        });

        test.todo("should paste a text in a p", async () => {
            await testEditor({
                contentBefore: "<p>ab[]cd</p>",
                stepFunction: async (editor) => {
                    await pasteHtml(editor, simpleHtmlCharX);
                },
                contentAfter: "<p>abx[]cd</p>",
            });
        });

        test.todo("should paste a text in a span", async () => {
            await testEditor({
                contentBefore: '<p>a<span class="a">b[]c</span>d</p>',
                stepFunction: async (editor) => {
                    await pasteHtml(editor, simpleHtmlCharX);
                },
                contentAfter: '<p>a<span class="a">bx[]c</span>d</p>',
            });
        });
    });

    describe("range not collapsed", () => {
        test.todo("should paste a text in a p", async () => {
            await testEditor({
                contentBefore: "<p>a[bc]d</p>",
                stepFunction: async (editor) => {
                    await pasteHtml(editor, simpleHtmlCharX);
                },
                contentAfter: "<p>ax[]d</p>",
            });
        });

        test.todo("should paste a text in a span", async () => {
            await testEditor({
                contentBefore: '<p>a<span class="a">b[cd]e</span>f</p>',
                stepFunction: async (editor) => {
                    await pasteHtml(editor, simpleHtmlCharX);
                },
                contentAfter: '<p>a<span class="a">bx[]e</span>f</p>',
            });
        });

        test.todo("should paste a text when selection across two span", async () => {
            await testEditor({
                contentBefore: '<p>a<span class="a">b[c</span><span class="a">d]e</span>f</p>',
                stepFunction: async (editor) => {
                    await pasteHtml(editor, simpleHtmlCharX);
                },
                contentAfter: '<p>a<span class="a">bx[]e</span>f</p>',
            });
            await testEditor({
                contentBefore: '<p>a<span class="a">b[c</span>- -<span class="a">d]e</span>f</p>',
                stepFunction: async (editor) => {
                    await pasteHtml(editor, simpleHtmlCharX);
                },
                contentAfter: '<p>a<span class="a">bx[]e</span>f</p>',
            });
        });

        test.todo("should paste a text when selection across two p", async () => {
            await testEditor({
                contentBefore: "<div>1a<p>b[c</p><p>d]e</p>f</div>",
                stepFunction: async (editor) => {
                    await pasteHtml(editor, simpleHtmlCharX);
                },
                contentAfter: "<div>1a<p>bx[]e</p>f</div>",
            });
            await testEditor({
                contentBefore: "<div>2a<p>b[c</p>- -<p>d]e</p>f</div>",
                stepFunction: async (editor) => {
                    await pasteHtml(editor, simpleHtmlCharX);
                },
                contentAfter: "<div>2a<p>bx[]e</p>f</div>",
            });
        });

        test.todo("should paste a text when selection leave a span", async () => {
            await testEditor({
                contentBefore: '<div>ab<span class="a">c[d</span>e]f</div>',
                stepFunction: async (editor) => {
                    await pasteHtml(editor, simpleHtmlCharX);
                },
                contentAfter: '<div>ab<span class="a">cx[]</span>f</div>',
            });
            await testEditor({
                contentBefore: '<div>a[b<span class="a">c]d</span>ef</div>',
                stepFunction: async (editor) => {
                    await pasteHtml(editor, simpleHtmlCharX);
                },
                contentAfter: '<div>ax[]<span class="a">d</span>ef</div>',
            });
        });

        test.todo("should paste a text when selection across two element", async () => {
            await testEditor({
                contentBefore: '<div>1a<p>b[c</p><span class="a">d]e</span>f</div>',
                stepFunction: async (editor) => {
                    await pasteHtml(editor, simpleHtmlCharX);
                },
                contentAfter: '<div>1a<p>bx[]<span class="a">e</span>f</p></div>',
            });
            await testEditor({
                contentBefore: '<div>2a<span class="a">b[c</span><p>d]e</p>f</div>',
                stepFunction: async (editor) => {
                    await pasteHtml(editor, simpleHtmlCharX);
                },
                contentAfter: '<div>2a<span class="a">bx[]</span>e<br>f</div>',
            });
            await testEditor({
                contentBefore: "<div>3a<p>b[c</p><p>d]e</p>f</div>",
                stepFunction: async (editor) => {
                    await pasteHtml(editor, simpleHtmlCharX);
                },
                contentAfter: "<div>3a<p>bx[]e</p>f</div>",
            });
        });
    });
});

describe("Simple html p", () => {
    const simpleHtmlCharX = "<p>x</p>";

    describe("range collapsed", () => {
        test.todo("should paste a text at the beginning of a p", async () => {
            await testEditor({
                contentBefore: "<p>[]abcd</p>",
                stepFunction: async (editor) => {
                    await pasteHtml(editor, simpleHtmlCharX);
                },
                contentAfter: "<p>x[]abcd</p>",
            });
        });

        test.todo("should paste a text in a p", async () => {
            await testEditor({
                contentBefore: "<p>ab[]cd</p>",
                stepFunction: async (editor) => {
                    await pasteHtml(editor, simpleHtmlCharX);
                },
                contentAfter: "<p>abx[]cd</p>",
            });
        });

        test.todo("should paste a text in a span", async () => {
            await testEditor({
                contentBefore: '<p>a<span class="a">b[]c</span>d</p>',
                stepFunction: async (editor) => {
                    await pasteHtml(editor, simpleHtmlCharX);
                },
                contentAfter: '<p>a<span class="a">bx[]c</span>d</p>',
            });
        });
    });

    describe("range not collapsed", () => {
        test.todo("should paste a text in a p", async () => {
            await testEditor({
                contentBefore: "<p>a[bc]d</p>",
                stepFunction: async (editor) => {
                    await pasteHtml(editor, simpleHtmlCharX);
                },
                contentAfter: "<p>ax[]d</p>",
            });
        });

        test.todo("should paste a text in a span", async () => {
            await testEditor({
                contentBefore: '<p>a<span class="a">b[cd]e</span>f</p>',
                stepFunction: async (editor) => {
                    await pasteHtml(editor, simpleHtmlCharX);
                },
                contentAfter: '<p>a<span class="a">bx[]e</span>f</p>',
            });
        });

        test.todo("should paste a text when selection across two span", async () => {
            await testEditor({
                contentBefore: '<p>a<span class="a">b[c</span><span class="a">d]e</span>f</p>',
                stepFunction: async (editor) => {
                    await pasteHtml(editor, simpleHtmlCharX);
                },
                contentAfter: '<p>a<span class="a">bx[]e</span>f</p>',
            });
            await testEditor({
                contentBefore: '<p>a<span class="a">b[c</span>- -<span class="a">d]e</span>f</p>',
                stepFunction: async (editor) => {
                    await pasteHtml(editor, simpleHtmlCharX);
                },
                contentAfter: '<p>a<span class="a">bx[]e</span>f</p>',
            });
        });

        test.todo("should paste a text when selection across two p", async () => {
            await testEditor({
                contentBefore: "<div>1a<p>b[c</p><p>d]e</p>f</div>",
                stepFunction: async (editor) => {
                    await pasteHtml(editor, simpleHtmlCharX);
                },
                contentAfter: "<div>1a<p>bx[]e</p>f</div>",
            });
            await testEditor({
                contentBefore: "<div>2a<p>b[c</p>- -<p>d]e</p>f</div>",
                stepFunction: async (editor) => {
                    await pasteHtml(editor, simpleHtmlCharX);
                },
                contentAfter: "<div>2a<p>bx[]e</p>f</div>",
            });
        });

        test.todo("should paste a text when selection leave a span", async () => {
            await testEditor({
                contentBefore: '<div>ab<span class="a">c[d</span>e]f</div>',
                stepFunction: async (editor) => {
                    await pasteHtml(editor, simpleHtmlCharX);
                },
                contentAfter: '<div>ab<span class="a">cx[]</span>f</div>',
            });
            await testEditor({
                contentBefore: '<div>a[b<span class="a">c]d</span>ef</div>',
                stepFunction: async (editor) => {
                    await pasteHtml(editor, simpleHtmlCharX);
                },
                contentAfter: '<div>ax[]<span class="a">d</span>ef</div>',
            });
        });

        test.todo("should paste a text when selection across two element", async () => {
            await testEditor({
                contentBefore: '<div>1a<p>b[c</p><span class="a">d]e</span>f</div>',
                stepFunction: async (editor) => {
                    await pasteHtml(editor, simpleHtmlCharX);
                },
                contentAfter: '<div>1a<p>bx[]<span class="a">e</span>f</p></div>',
            });
            await testEditor({
                contentBefore: '<div>2a<span class="a">b[c</span><p>d]e</p>f</div>',
                stepFunction: async (editor) => {
                    await pasteHtml(editor, simpleHtmlCharX);
                },
                contentAfter: '<div>2a<span class="a">bx[]</span>e<br>f</div>',
            });
            await testEditor({
                contentBefore: "<div>3a<p>b[c</p><p>d]e</p>f</div>",
                stepFunction: async (editor) => {
                    await pasteHtml(editor, simpleHtmlCharX);
                },
                contentAfter: "<div>3a<p>bx[]e</p>f</div>",
            });
        });
    });
});

describe("Complex html span", () => {
    const complexHtmlData =
        '<span style="font-family: -apple-system, BlinkMacSystemFont, &quot;Segoe UI&quot;, Roboto, &quot;Helvetica Neue&quot;, Arial, &quot;Noto Sans&quot;, sans-serif, &quot;Apple Color Emoji&quot;, &quot;Segoe UI Emoji&quot;, &quot;Segoe UI Symbol&quot;, &quot;Noto Color Emoji&quot;; font-variant-ligatures: normal; font-variant-caps: normal; letter-spacing: normal; orphans: 2; text-align: left; text-indent: 0px; text-transform: none; white-space: normal; widows: 2; word-spacing: 0px; -webkit-text-stroke-width: 0px; text-decoration-thickness: initial; text-decoration-style: initial; text-decoration-color: initial; display: inline !important; float: none;">1</span><b style="box-sizing: border-box; font-weight: bolder; font-family: -apple-system, BlinkMacSystemFont, &quot;Segoe UI&quot;, Roboto, &quot;Helvetica Neue&quot;, Arial, &quot;Noto Sans&quot;, sans-serif, &quot;Apple Color Emoji&quot;, &quot;Segoe UI Emoji&quot;, &quot;Segoe UI Symbol&quot;, &quot;Noto Color Emoji&quot;; font-variant-ligatures: normal; font-variant-caps: normal; letter-spacing: normal; orphans: 2; text-align: left; text-indent: 0px; text-transform: none; white-space: normal; widows: 2; word-spacing: 0px; -webkit-text-stroke-width: 0px; text-decoration-thickness: initial; text-decoration-style: initial; text-decoration-color: initial;">23</b><span style="font-family: -apple-system, BlinkMacSystemFont, &quot;Segoe UI&quot;, Roboto, &quot;Helvetica Neue&quot;, Arial, &quot;Noto Sans&quot;, sans-serif, &quot;Apple Color Emoji&quot;, &quot;Segoe UI Emoji&quot;, &quot;Segoe UI Symbol&quot;, &quot;Noto Color Emoji&quot;; font-variant-ligatures: normal; font-variant-caps: normal; letter-spacing: normal; orphans: 2; text-align: left; text-indent: 0px; text-transform: none; white-space: normal; widows: 2; word-spacing: 0px; -webkit-text-stroke-width: 0px; text-decoration-thickness: initial; text-decoration-style: initial; text-decoration-color: initial; display: inline !important; float: none;"><span> </span>4</span>';

    describe("range collapsed", () => {
        test.todo("should paste a text at the beginning of a p", async () => {
            await testEditor({
                contentBefore: "<p>[]abcd</p>",
                stepFunction: async (editor) => {
                    await pasteHtml(editor, complexHtmlData);
                },
                contentAfter: "<p>1<b>23</b>&nbsp;4[]abcd</p>",
            });
        });

        test.todo("should paste a text in a p", async () => {
            await testEditor({
                contentBefore: "<p>ab[]cd</p>",
                stepFunction: async (editor) => {
                    await pasteHtml(editor, complexHtmlData);
                },
                contentAfter: "<p>ab1<b>23</b>&nbsp;4[]cd</p>",
            });
        });

        test.todo("should paste a text in a span", async () => {
            await testEditor({
                contentBefore: '<p>a<span class="a">b[]c</span>d</p>',
                stepFunction: async (editor) => {
                    await pasteHtml(editor, complexHtmlData);
                },
                contentAfter: '<p>a<span class="a">b1<b>23</b>&nbsp;4[]c</span>d</p>',
            });
        });
    });

    describe("range not collapsed", () => {
        test.todo("should paste a text in a p", async () => {
            await testEditor({
                contentBefore: "<p>a[bc]d</p>",
                stepFunction: async (editor) => {
                    await pasteHtml(editor, complexHtmlData);
                },
                contentAfter: "<p>a1<b>23</b>&nbsp;4[]d</p>",
            });
        });

        test.todo("should paste a text in a span", async () => {
            await testEditor({
                contentBefore: '<p>a<span class="a">b[cd]e</span>f</p>',
                stepFunction: async (editor) => {
                    await pasteHtml(editor, complexHtmlData);
                },
                contentAfter: '<p>a<span class="a">b1<b>23</b>&nbsp;4[]e</span>f</p>',
            });
        });

        test.todo("should paste a text when selection across two span", async () => {
            await testEditor({
                contentBefore: '<p>a<span class="a">b[c</span><span class="a">d]e</span>f</p>',
                stepFunction: async (editor) => {
                    await pasteHtml(editor, complexHtmlData);
                },
                contentAfter: '<p>a<span class="a">b1<b>23</b>&nbsp;4[]e</span>f</p>',
            });
            await testEditor({
                contentBefore: '<p>a<span class="a">b[c</span>- -<span class="a">d]e</span>f</p>',
                stepFunction: async (editor) => {
                    await pasteHtml(editor, complexHtmlData);
                },
                contentAfter: '<p>a<span class="a">b1<b>23</b>&nbsp;4[]e</span>f</p>',
            });
        });

        test.todo("should paste a text when selection across two p", async () => {
            await testEditor({
                contentBefore: "<div>a<p>b[c</p><p>d]e</p>f</div>",
                stepFunction: async (editor) => {
                    await pasteHtml(editor, complexHtmlData);
                },
                contentAfter: "<div>a<p>b1<b>23</b>&nbsp;4[]e</p>f</div>",
            });
            await testEditor({
                contentBefore: "<div>a<p>b[c</p>- -<p>d]e</p>f</div>",
                stepFunction: async (editor) => {
                    await pasteHtml(editor, complexHtmlData);
                },
                contentAfter: "<div>a<p>b1<b>23</b>&nbsp;4[]e</p>f</div>",
            });
        });

        test.todo("should paste a text when selection leave a span", async () => {
            await testEditor({
                contentBefore: '<div>ab<span class="a">c[d</span>e]f</div>',
                stepFunction: async (editor) => {
                    await pasteHtml(editor, complexHtmlData);
                },
                contentAfter: '<div>ab<span class="a">c1<b>23</b>&nbsp;4[]</span>f</div>',
            });
            await testEditor({
                contentBefore: '<div>a[b<span class="a">c]d</span>ef</div>',
                stepFunction: async (editor) => {
                    await pasteHtml(editor, complexHtmlData);
                },
                contentAfter: '<div>a1<b>23</b>&nbsp;4[]<span class="a">d</span>ef</div>',
            });
        });

        test.todo("should paste a text when selection across two element", async () => {
            await testEditor({
                contentBefore: '<div>1a<p>b[c</p><span class="a">d]e</span>f</div>',
                stepFunction: async (editor) => {
                    await pasteHtml(editor, complexHtmlData);
                },
                contentAfter: '<div>1a<p>b1<b>23</b>&nbsp;4[]<span class="a">e</span>f</p></div>',
            });
            await testEditor({
                contentBefore: '<div>2a<span class="a">b[c</span><p>d]e</p>f</div>',
                stepFunction: async (editor) => {
                    await pasteHtml(editor, complexHtmlData);
                },
                contentAfter: '<div>2a<span class="a">b1<b>23</b>&nbsp;4[]</span>e<br>f</div>',
            });
            await testEditor({
                contentBefore: "<div>3a<p>b[c</p><p>d]e</p>f</div>",
                stepFunction: async (editor) => {
                    await pasteHtml(editor, complexHtmlData);
                },
                contentAfter: "<div>3a<p>b1<b>23</b>&nbsp;4[]e</p>f</div>",
            });
        });
    });
});

describe("Complex html p", () => {
    const complexHtmlData =
        '<p style="box-sizing: border-box; margin-top: 0px; margin-bottom: 1rem; color: rgb(0, 0, 0); font-family: -apple-system, BlinkMacSystemFont, &quot;Segoe UI&quot;, Roboto, &quot;Helvetica Neue&quot;, Arial, &quot;Noto Sans&quot;, sans-serif, &quot;Apple Color Emoji&quot;, &quot;Segoe UI Emoji&quot;, &quot;Segoe UI Symbol&quot;, &quot;Noto Color Emoji&quot;; font-size: 16px; font-style: normal; font-variant-ligatures: normal; font-variant-caps: normal; font-weight: 400; letter-spacing: normal; orphans: 2; text-align: left; text-indent: 0px; text-transform: none; white-space: normal; widows: 2; word-spacing: 0px; -webkit-text-stroke-width: 0px; background-color: rgb(255, 255, 255); text-decoration-thickness: initial; text-decoration-style: initial; text-decoration-color: initial;">12</p><p style="box-sizing: border-box; margin-top: 0px; margin-bottom: 1rem; color: rgb(0, 0, 0); font-family: -apple-system, BlinkMacSystemFont, &quot;Segoe UI&quot;, Roboto, &quot;Helvetica Neue&quot;, Arial, &quot;Noto Sans&quot;, sans-serif, &quot;Apple Color Emoji&quot;, &quot;Segoe UI Emoji&quot;, &quot;Segoe UI Symbol&quot;, &quot;Noto Color Emoji&quot;; font-size: 16px; font-style: normal; font-variant-ligatures: normal; font-variant-caps: normal; font-weight: 400; letter-spacing: normal; orphans: 2; text-align: left; text-indent: 0px; text-transform: none; white-space: normal; widows: 2; word-spacing: 0px; -webkit-text-stroke-width: 0px; background-color: rgb(255, 255, 255); text-decoration-thickness: initial; text-decoration-style: initial; text-decoration-color: initial;">34</p>';

    describe("range collapsed", () => {
        test.todo("should paste a text at the beginning of a p", async () => {
            await testEditor({
                contentBefore: "<p>[]abcd</p>",
                stepFunction: async (editor) => {
                    await pasteHtml(editor, complexHtmlData);
                },
                contentAfter: "<p>12</p><p>34[]abcd</p>",
            });
        });

        test.todo("should paste a text in a p", async () => {
            await testEditor({
                contentBefore: "<p>ab[]cd</p>",
                stepFunction: async (editor) => {
                    await pasteHtml(editor, complexHtmlData);
                },
                contentAfter: "<p>ab12</p><p>34[]cd</p>",
            });
        });

        test.todo("should paste a text in a span", async () => {
            await testEditor({
                contentBefore: '<p>a<span class="a">b[]c</span>d</p>',
                stepFunction: async (editor) => {
                    await pasteHtml(editor, complexHtmlData);
                },
                contentAfter:
                    '<p>a<span class="a">b12</span></p><p><span class="a">34[]c</span>d</p>',
            });
        });
    });

    describe("range not collapsed", () => {
        test.todo("should paste a text in a p", async () => {
            await testEditor({
                contentBefore: "<p>a[bc]d</p>",
                stepFunction: async (editor) => {
                    await pasteHtml(editor, complexHtmlData);
                },
                contentAfter: "<p>a12</p><p>34[]d</p>",
            });
        });

        test.todo("should paste a text in a span", async () => {
            await testEditor({
                contentBefore: '<p>a<span class="a">b[cd]e</span>f</p>',
                stepFunction: async (editor) => {
                    await pasteHtml(editor, complexHtmlData);
                },
                contentAfter:
                    '<p>a<span class="a">b12</span></p><p><span class="a">34[]e</span>f</p>',
            });
        });

        test.todo("should paste a text when selection across two span (1)", async () => {
            await testEditor({
                contentBefore: '<p>1a<span class="a">b[c</span><span class="a">d]e</span>f</p>',
                stepFunction: async (editor) => {
                    await pasteHtml(editor, complexHtmlData);
                },
                contentAfter:
                    '<p>1a<span class="a">b12</span></p><p><span class="a">34[]e</span>f</p>',
            });
        });

        test.todo("should paste a text when selection across two span (2)", async () => {
            await testEditor({
                contentBefore: '<p>2a<span class="a">b[c</span>- -<span class="a">d]e</span>f</p>',
                stepFunction: async (editor) => {
                    await pasteHtml(editor, complexHtmlData);
                },
                contentAfter:
                    '<p>2a<span class="a">b12</span></p><p><span class="a">34[]e</span>f</p>',
            });
        });

        test.todo("should paste a text when selection across two p", async () => {
            await testEditor({
                contentBefore: "<div>a<p>b[c</p><p>d]e</p>f</div>",
                stepFunction: async (editor) => {
                    await pasteHtml(editor, complexHtmlData);
                },
                contentAfter: "<div>a<p>b12</p><p>34[]e</p>f</div>",
            });
            await testEditor({
                contentBefore: "<div>a<p>b[c</p>- -<p>d]e</p>f</div>",
                stepFunction: async (editor) => {
                    await pasteHtml(editor, complexHtmlData);
                },
                contentAfter: "<div>a<p>b12</p><p>34[]e</p>f</div>",
            });
        });

        test.todo("should paste a text when selection leave a span (1)", async () => {
            await testEditor({
                contentBefore: '<div>1ab<span class="a">c[d</span>e]f</div>',
                stepFunction: async (editor) => {
                    await pasteHtml(editor, complexHtmlData);
                },
                contentAfter: '<div>1ab<span class="a">c12<br>34[]</span>f</div>',
            });
            await testEditor({
                contentBefore: '<div>2a[b<span class="a">c]d</span>ef</div>',
                stepFunction: async (editor) => {
                    await pasteHtml(editor, complexHtmlData);
                },
                contentAfter: '<div>2a12<br>34[]<span class="a">d</span>ef</div>',
            });
        });

        test.todo("should paste a text when selection leave a span (2)", async () => {
            await testEditor({
                contentBefore: '<p>1ab<span class="a">c[d</span>e]f</p>',
                stepFunction: async (editor) => {
                    await pasteHtml(editor, complexHtmlData);
                },
                contentAfter:
                    '<p>1ab<span class="a">c12</span></p><p><span class="a">34[]</span>f</p>',
            });
            await testEditor({
                contentBefore: '<p>2a[b<span class="a">c]d</span>ef</p>',
                stepFunction: async (editor) => {
                    await pasteHtml(editor, complexHtmlData);
                },
                contentAfter: '<p>2a12</p><p>34[]<span class="a">d</span>ef</p>',
            });
        });

        test.todo("should paste a text when selection across two element (1)", async () => {
            await testEditor({
                contentBefore: '<div>1a<p>b[c</p><span class="a">d]e</span>f</div>',
                stepFunction: async (editor) => {
                    await pasteHtml(editor, complexHtmlData);
                },
                // FIXME: Bringing `e` and `f` into the `<p>` is a tradeOff
                // Should we change it ? How ? Might warrant a discussion.
                // possible alt contentAfter : <div>1a<p>b12</p>34[]<span>e</span>f</div>
                contentAfter: '<div>1a<p>b12</p><p>34[]<span class="a">e</span>f</p></div>',
            });
        });

        test.todo("should paste a text when selection across two element (2)", async () => {
            await testEditor({
                contentBefore: '<div>2a<span class="a">b[c</span><p>d]e</p>f</div>',
                stepFunction: async (editor) => {
                    await pasteHtml(editor, complexHtmlData);
                },
                contentAfter: '<div>2a<span class="a">b12<br>34[]</span>e<br>f</div>',
            });
        });
    });
});

describe("Complex html 3 p", () => {
    const complexHtmlData = "<p>1<i>X</i>2</p><p>3<i>X</i>4</p><p>5<i>X</i>6</p>";

    describe("range collapsed", () => {
        test.todo("should paste a text at the beginning of a p", async () => {
            await testEditor({
                contentBefore: "<p>[]abcd</p>",
                stepFunction: async (editor) => {
                    await pasteHtml(editor, complexHtmlData);
                },
                contentAfter: "<p>1<i>X</i>2</p><p>3<i>X</i>4</p><p>5<i>X</i>6[]abcd</p>",
            });
        });

        test.todo("should paste a text in a p", async () => {
            await testEditor({
                contentBefore: "<p>ab[]cd</p>",
                stepFunction: async (editor) => {
                    await pasteHtml(editor, complexHtmlData);
                },
                contentAfter: "<p>ab1<i>X</i>2</p><p>3<i>X</i>4</p><p>5<i>X</i>6[]cd</p>",
            });
        });

        test.todo("should paste a text in a span", async () => {
            await testEditor({
                contentBefore: '<p>a<span class="a">b[]c</span>d</p>',
                stepFunction: async (editor) => {
                    await pasteHtml(editor, complexHtmlData);
                },
                contentAfter:
                    '<p>a<span class="a">b1<i>X</i>2</span></p><p>3<i>X</i>4</p><p><span class="a">5<i>X</i>6[]c</span>d</p>',
            });
        });
    });

    describe("range not collapsed", () => {
        test.todo("should paste a text in a p", async () => {
            await testEditor({
                contentBefore: "<p>a[bc]d</p>",
                stepFunction: async (editor) => {
                    await pasteHtml(editor, complexHtmlData);
                },
                contentAfter: "<p>a1<i>X</i>2</p><p>3<i>X</i>4</p><p>5<i>X</i>6[]d</p>",
            });
        });

        test.todo("should paste a text in a span", async () => {
            await testEditor({
                contentBefore: '<p>a<span class="a">b[cd]e</span>f</p>',
                stepFunction: async (editor) => {
                    await pasteHtml(editor, complexHtmlData);
                },
                contentAfter:
                    '<p>a<span class="a">b1<i>X</i>2</span></p><p>3<i>X</i>4</p><p><span class="a">5<i>X</i>6[]e</span>f</p>',
            });
        });

        test.todo("should paste a text when selection across two span (1)", async () => {
            await testEditor({
                contentBefore: '<p>1a<span class="a">b[c</span><span class="a">d]e</span>f</p>',
                stepFunction: async (editor) => {
                    await pasteHtml(editor, complexHtmlData);
                },
                contentAfter:
                    '<p>1a<span class="a">b1<i>X</i>2</span></p><p>3<i>X</i>4</p><p><span class="a">5<i>X</i>6[]e</span>f</p>',
            });
        });

        test.todo("should paste a text when selection across two span (2)", async () => {
            await testEditor({
                contentBefore: '<p>2a<span class="a">b[c</span>- -<span class="a">d]e</span>f</p>',
                stepFunction: async (editor) => {
                    await pasteHtml(editor, complexHtmlData);
                },
                contentAfter:
                    '<p>2a<span class="a">b1<i>X</i>2</span></p><p>3<i>X</i>4</p><p><span class="a">5<i>X</i>6[]e</span>f</p>',
            });
        });

        test.todo("should paste a text when selection across two p", async () => {
            await testEditor({
                contentBefore: "<div>a<p>b[c</p><p>d]e</p>f</div>",
                stepFunction: async (editor) => {
                    await pasteHtml(editor, complexHtmlData);
                },
                contentAfter:
                    "<div>a<p>b1<i>X</i>2</p><p>3<i>X</i>4</p><p>5<i>X</i>6[]e</p>f</div>",
            });
            await testEditor({
                contentBefore: "<div>a<p>b[c</p>- -<p>d]e</p>f</div>",
                stepFunction: async (editor) => {
                    await pasteHtml(editor, complexHtmlData);
                },
                contentAfter:
                    "<div>a<p>b1<i>X</i>2</p><p>3<i>X</i>4</p><p>5<i>X</i>6[]e</p>f</div>",
            });
        });

        test.todo("should paste a text when selection leave a span (1)", async () => {
            await testEditor({
                contentBefore: '<div>1ab<span class="a">c[d</span>e]f</div>',
                stepFunction: async (editor) => {
                    await pasteHtml(editor, complexHtmlData);
                },
                contentAfter:
                    '<div>1ab<span class="a">c1<i>X</i>2</span><p>3<i>X</i>4</p><span class="a">5<i>X</i>6[]</span>f</div>',
            });
            await testEditor({
                contentBefore: '<div>2a[b<span class="a">c]d</span>ef</div>',
                stepFunction: async (editor) => {
                    await pasteHtml(editor, complexHtmlData);
                },
                contentAfter:
                    '<div>2a1<i>X</i>2<p>3<i>X</i>4</p>5<i>X</i>6[]<span class="a">d</span>ef</div>',
            });
        });

        test.todo("should paste a text when selection leave a span (2)", async () => {
            await testEditor({
                contentBefore: '<p>1ab<span class="a">c[d</span>e]f</p>',
                stepFunction: async (editor) => {
                    await pasteHtml(editor, complexHtmlData);
                },
                contentAfter:
                    '<p>1ab<span class="a">c1<i>X</i>2</span></p><p>3<i>X</i>4</p><p><span class="a">5<i>X</i>6[]</span>f</p>',
            });
            await testEditor({
                contentBefore: '<p>2a[b<span class="a">c]d</span>ef</p>',
                stepFunction: async (editor) => {
                    await pasteHtml(editor, complexHtmlData);
                },
                contentAfter:
                    '<p>2a1<i>X</i>2</p><p>3<i>X</i>4</p><p>5<i>X</i>6[]<span class="a">d</span>ef</p>',
            });
        });

        test.todo("should paste a text when selection across two element (1)", async () => {
            await testEditor({
                contentBefore: '<div>1a<p>b[c</p><span class="a">d]e</span>f</div>',
                stepFunction: async (editor) => {
                    await pasteHtml(editor, complexHtmlData);
                },
                contentAfter:
                    '<div>1a<p>b1<i>X</i>2</p><p>3<i>X</i>4</p><p>5<i>X</i>6[]<span class="a">e</span>f</p></div>',
            });
        });

        test.todo("should paste a text when selection across two element (2)", async () => {
            await testEditor({
                contentBefore: '<div>2a<span class="a">b[c</span><p>d]e</p>f</div>',
                stepFunction: async (editor) => {
                    await pasteHtml(editor, complexHtmlData);
                },
                contentAfter:
                    '<div>2a<span class="a">b1<i>X</i>2</span><p>3<i>X</i>4</p><span class="a">5<i>X</i>6[]</span>e<br>f</div>',
            });
        });
    });
});

describe("Complex html p+i", () => {
    const complexHtmlData =
        '<p style="box-sizing: border-box; margin-top: 0px; margin-bottom: 1rem; color: rgb(0, 0, 0); font-family: -apple-system, BlinkMacSystemFont, &quot;Segoe UI&quot;, Roboto, &quot;Helvetica Neue&quot;, Arial, &quot;Noto Sans&quot;, sans-serif, &quot;Apple Color Emoji&quot;, &quot;Segoe UI Emoji&quot;, &quot;Segoe UI Symbol&quot;, &quot;Noto Color Emoji&quot;; font-size: 16px; font-style: normal; font-variant-ligatures: normal; font-variant-caps: normal; font-weight: 400; letter-spacing: normal; orphans: 2; text-align: left; text-indent: 0px; text-transform: none; white-space: normal; widows: 2; word-spacing: 0px; -webkit-text-stroke-width: 0px; background-color: rgb(255, 255, 255); text-decoration-thickness: initial; text-decoration-style: initial; text-decoration-color: initial;">12</p><p style="box-sizing: border-box; margin-top: 0px; margin-bottom: 1rem; color: rgb(0, 0, 0); font-family: -apple-system, BlinkMacSystemFont, &quot;Segoe UI&quot;, Roboto, &quot;Helvetica Neue&quot;, Arial, &quot;Noto Sans&quot;, sans-serif, &quot;Apple Color Emoji&quot;, &quot;Segoe UI Emoji&quot;, &quot;Segoe UI Symbol&quot;, &quot;Noto Color Emoji&quot;; font-size: 16px; font-style: normal; font-variant-ligatures: normal; font-variant-caps: normal; font-weight: 400; letter-spacing: normal; orphans: 2; text-align: left; text-indent: 0px; text-transform: none; white-space: normal; widows: 2; word-spacing: 0px; -webkit-text-stroke-width: 0px; background-color: rgb(255, 255, 255); text-decoration-thickness: initial; text-decoration-style: initial; text-decoration-color: initial;"><i style="box-sizing: border-box;">ii</i></p>';

    describe("range collapsed", () => {
        test.todo("should paste a text at the beginning of a p", async () => {
            await testEditor({
                contentBefore: "<p>[]abcd</p>",
                stepFunction: async (editor) => {
                    await pasteHtml(editor, complexHtmlData);
                },
                contentAfter: "<p>12</p><p><i>ii</i>[]abcd</p>",
            });
        });

        test.todo("should paste a text in a p", async () => {
            await testEditor({
                contentBefore: "<p>ab[]cd</p>",
                stepFunction: async (editor) => {
                    await pasteHtml(editor, complexHtmlData);
                },
                contentAfter: "<p>ab12</p><p><i>ii</i>[]cd</p>",
            });
        });

        test.todo("should paste a text in a span", async () => {
            await testEditor({
                contentBefore: '<p>a<span class="a">b[]c</span>d</p>',
                stepFunction: async (editor) => {
                    await pasteHtml(editor, complexHtmlData);
                },
                contentAfter:
                    '<p>a<span class="a">b12</span></p><p><span class="a"><i>ii</i>[]c</span>d</p>',
            });
        });
    });

    describe("range not collapsed", () => {
        test.todo("should paste a text in a p", async () => {
            await testEditor({
                contentBefore: "<p>a[bc]d</p>",
                stepFunction: async (editor) => {
                    await pasteHtml(editor, complexHtmlData);
                },
                contentAfter: "<p>a12</p><p><i>ii</i>[]d</p>",
            });
        });

        test.todo("should paste a text in a span", async () => {
            await testEditor({
                contentBefore: '<p>a<span class="a">b[cd]e</span>f</p>',
                stepFunction: async (editor) => {
                    await pasteHtml(editor, complexHtmlData);
                },
                contentAfter:
                    '<p>a<span class="a">b12</span></p><p><span class="a"><i>ii</i>[]e</span>f</p>',
            });
        });

        test.todo("should paste a text when selection across two span", async () => {
            await testEditor({
                contentBefore: '<p>a<span class="a">b[c</span><span class="a">d]e</span>f</p>',
                stepFunction: async (editor) => {
                    await pasteHtml(editor, complexHtmlData);
                },
                contentAfter:
                    '<p>a<span class="a">b12</span></p><p><span class="a"><i>ii</i>[]e</span>f</p>',
            });
            await testEditor({
                contentBefore: '<p>a<span class="a">b[c</span>- -<span class="a">d]e</span>f</p>',
                stepFunction: async (editor) => {
                    await pasteHtml(editor, complexHtmlData);
                },
                contentAfter:
                    '<p>a<span class="a">b12</span></p><p><span class="a"><i>ii[]</i>e</span>f</p>',
            });
        });

        test.todo("should paste a text when selection across two p", async () => {
            await testEditor({
                contentBefore: "<div>a<p>b[c</p><p>d]e</p>f</div>",
                stepFunction: async (editor) => {
                    await pasteHtml(editor, complexHtmlData);
                },
                contentAfter: "<div>a<p>b12</p><p><i>ii</i>[]e</p>f</div>",
            });
            await testEditor({
                contentBefore: "<div>a<p>b[c</p>- -<p>d]e</p>f</div>",
                stepFunction: async (editor) => {
                    await pasteHtml(editor, complexHtmlData);
                },
                contentAfter: "<div>a<p>b12</p><p><i>ii</i>[]e</p>f</div>",
            });
        });

        test.todo("should paste a text when selection leave a span (1)", async () => {
            await testEditor({
                contentBefore: '<div>1ab<span class="a">c[d</span>e]f</div>',
                stepFunction: async (editor) => {
                    await pasteHtml(editor, complexHtmlData);
                },
                contentAfter: '<div>1ab<span class="a">c12<i><br>ii</i>[]</span>f</div>',
            });
            await testEditor({
                contentBefore: '<div>2a[b<span class="a">c]d</span>ef</div>',
                stepFunction: async (editor) => {
                    await pasteHtml(editor, complexHtmlData);
                },
                contentAfter: '<div>2a12<i><br>ii</i>[]<span class="a">d</span>ef</div>',
            });
        });

        test.todo("should paste a text when selection leave a span (2)", async () => {
            await testEditor({
                contentBefore: '<p>1ab<span class="a">c[d</span>e]f</p>',
                stepFunction: async (editor) => {
                    await pasteHtml(editor, complexHtmlData);
                },
                contentAfter:
                    '<p>1ab<span class="a">c12</span></p><p><span class="a"><i>ii</i>[]</span>f</p>',
            });
            await testEditor({
                contentBefore: '<p>2a[b<span class="a">c]d</span>ef</p>',
                stepFunction: async (editor) => {
                    await pasteHtml(editor, complexHtmlData);
                },
                contentAfter: '<p>2a12</p><p><i>ii</i>[]<span class="a">d</span>ef</p>',
            });
        });

        test.todo("should paste a text when selection across two element (1)", async () => {
            await testEditor({
                contentBefore: '<div>1a<p>b[c</p><span class="a">d]e</span>f</div>',
                stepFunction: async (editor) => {
                    await pasteHtml(editor, complexHtmlData);
                },
                contentAfter: '<div>1a<p>b12</p><p><i>ii</i>[]<span class="a">e</span>f</p></div>',
            });
        });

        test.todo("should paste a text when selection across two element (2)", async () => {
            await testEditor({
                contentBefore: '<div>2a<span class="a">b[c</span><p>d]e</p>f</div>',
                stepFunction: async (editor) => {
                    await pasteHtml(editor, complexHtmlData);
                },
                contentAfter: '<div>2a<span class="a">b12<i><br>ii</i>[]</span>e<br>f</div>',
            });
        });
    });
});

describe("Complex html 3p+b", () => {
    const complexHtmlData = "<p>1<b>23</b></p><p>zzz</p><p>45<b>6</b>7</p>";

    describe("range collapsed", () => {
        test.todo("should paste a text at the beginning of a p", async () => {
            await testEditor({
                contentBefore: "<p>[]abcd</p>",
                stepFunction: async (editor) => {
                    await pasteHtml(editor, complexHtmlData);
                },
                contentAfter: "<p>1<b>23</b></p><p>zzz</p><p>45<b>6</b>7[]abcd</p>",
            });
        });

        test.todo("should paste a text in a p", async () => {
            await testEditor({
                contentBefore: "<p>ab[]cd</p>",
                stepFunction: async (editor) => {
                    await pasteHtml(editor, complexHtmlData);
                },
                contentAfter: "<p>ab1<b>23</b></p><p>zzz</p><p>45<b>6</b>7[]cd</p>",
            });
        });

        test.todo("should paste a text in a span", async () => {
            await testEditor({
                contentBefore: '<p>a<span class="a">b[]c</span>d</p>',
                stepFunction: async (editor) => {
                    await pasteHtml(editor, complexHtmlData);
                },
                contentAfter:
                    '<p>a<span class="a">b1<b>23</b></span></p><p>zzz</p><p><span class="a">45<b>6</b>7[]c</span>d</p>',
            });
        });
    });

    describe("range not collapsed", () => {
        test.todo("should paste a text in a p", async () => {
            await testEditor({
                contentBefore: "<p>a[bc]d</p>",
                stepFunction: async (editor) => {
                    await pasteHtml(editor, complexHtmlData);
                },
                contentAfter: "<p>a1<b>23</b></p><p>zzz</p><p>45<b>6</b>7[]d</p>",
            });
        });

        test.todo("should paste a text in a span", async () => {
            await testEditor({
                contentBefore: '<p>a<span class="a">b[cd]e</span>f</p>',
                stepFunction: async (editor) => {
                    await pasteHtml(editor, complexHtmlData);
                },
                contentAfter:
                    '<p>a<span class="a">b1<b>23</b></span></p><p>zzz</p><p><span class="a">45<b>6</b>7[]e</span>f</p>',
            });
        });

        test.todo("should paste a text when selection across two span", async () => {
            await testEditor({
                contentBefore: '<p>a<span class="a">b[c</span><span class="a">d]e</span>f</p>',
                stepFunction: async (editor) => {
                    await pasteHtml(editor, complexHtmlData);
                },
                contentAfter:
                    '<p>a<span class="a">b1<b>23</b></span></p><p>zzz</p><p><span class="a">45<b>6</b>7[]e</span>f</p>',
            });
            await testEditor({
                contentBefore: '<p>a<span class="a">b[c</span>- -<span class="a">d]e</span>f</p>',
                stepFunction: async (editor) => {
                    await pasteHtml(editor, complexHtmlData);
                },
                contentAfter:
                    '<p>a<span class="a">b1<b>23</b></span></p><p>zzz</p><p><span class="a">45<b>6</b>7[]e</span>f</p>',
            });
        });

        test.todo("should paste a text when selection across two p", async () => {
            await testEditor({
                contentBefore: "<div>a<p>b[c</p><p>d]e</p>f</div>",
                stepFunction: async (editor) => {
                    await pasteHtml(editor, complexHtmlData);
                },
                contentAfter: "<div>a<p>b1<b>23</b></p><p>zzz</p><p>45<b>6</b>7[]e</p>f</div>",
            });
            await testEditor({
                contentBefore: "<div>a<p>b[c</p>- -<p>d]e</p>f</div>",
                stepFunction: async (editor) => {
                    await pasteHtml(editor, complexHtmlData);
                },
                contentAfter: "<div>a<p>b1<b>23</b></p><p>zzz</p><p>45<b>6</b>7[]e</p>f</div>",
            });
        });

        test.todo("should paste a text when selection leave a span (1)", async () => {
            await testEditor({
                contentBefore: '<div>1ab<span class="a">c[d</span>e]f</div>',
                stepFunction: async (editor) => {
                    await pasteHtml(editor, complexHtmlData);
                },
                contentAfter:
                    '<div>1ab<span class="a">c1<b>23</b></span><p>zzz</p><span class="a">45<b>6</b>7[]</span>f</div>',
            });
            await testEditor({
                contentBefore: '<div>2a[b<span class="a">c]d</span>ef</div>',
                stepFunction: async (editor) => {
                    await pasteHtml(editor, complexHtmlData);
                },
                contentAfter:
                    '<div>2a1<b>23</b><p>zzz</p>45<b>6</b>7[]<span class="a">d</span>ef</div>',
            });
        });

        test.todo("should paste a text when selection across two element (1)", async () => {
            await testEditor({
                contentBefore: '<div>1a<p>b[c</p><span class="a">d]e</span>f</div>',
                stepFunction: async (editor) => {
                    await pasteHtml(editor, complexHtmlData);
                },
                contentAfter:
                    '<div>1a<p>b1<b>23</b></p><p>zzz</p><p>45<b>6</b>7[]<span class="a">e</span>f</p></div>',
            });
        });

        test.todo("should paste a text when selection across two element (2)", async () => {
            await testEditor({
                contentBefore: '<div>2a<span class="a">b[c</span><p>d]e</p>f</div>',
                stepFunction: async (editor) => {
                    await pasteHtml(editor, complexHtmlData);
                },
                contentAfter:
                    '<div>2a<span class="a">b1<b>23</b></span><p>zzz</p><span class="a">45<b>6</b>7[]</span>e<br>f</div>',
            });
        });
    });
});

describe("Special cases", () => {
    describe("lists", () => {
        test.todo("should paste a list in a p", async () => {
            await testEditor({
                contentBefore: "<p>12[]34</p>",
                stepFunction: async (editor) => {
                    await pasteHtml(editor, "<ul><li>abc</li><li>def</li><li>ghi</li></ul>");
                },
                contentAfter: "<p>12</p><ul><li>abc</li><li>def</li><li>ghi</li></ul><p>[]34</p>",
            });
        });

        test.todo("should paste the text of an li into another li", async () => {
            await testEditor({
                contentBefore: "<ul><li>abc</li><li>de[]f</li><li>ghi</li></ul>",
                stepFunction: async (editor) => {
                    await pasteHtml(editor, "<ul><li>123</li></ul>");
                },
                contentAfter: "<ul><li>abc</li><li>de123[]f</li><li>ghi</li></ul>",
            });
        });

        test.todo(
            "should paste the text of an li into another li, and the text of another li into the next li",
            async () => {
                await testEditor({
                    contentBefore: "<ul><li>abc</li><li>de[]f</li><li>ghi</li></ul>",
                    stepFunction: async (editor) => {
                        await pasteHtml(editor, "<ul><li>123</li><li>456</li></ul>");
                    },
                    contentAfter: "<ul><li>abc</li><li>de123</li><li>456[]f</li><li>ghi</li></ul>",
                });
            }
        );

        test.todo(
            "should paste the text of an li into another li, insert a new li, and paste the text of a third li into the next li",
            async () => {
                await testEditor({
                    contentBefore: "<ul><li>abc</li><li>de[]f</li><li>ghi</li></ul>",
                    stepFunction: async (editor) => {
                        await pasteHtml(editor, "<ul><li>123</li><li>456</li><li>789</li></ul>");
                    },
                    contentAfter:
                        "<ul><li>abc</li><li>de123</li><li>456</li><li>789[]f</li><li>ghi</li></ul>",
                });
            }
        );

        test.todo(
            "should paste the text of an li into another li and insert a new li at the end of a list",
            async () => {
                await testEditor({
                    contentBefore: "<ul><li>abc</li><li>def</li><li>ghi[]</li></ul>",
                    stepFunction: async (editor) => {
                        await pasteHtml(editor, "<ul><li>123</li><li>456</li></ul>");
                    },
                    contentAfter: "<ul><li>abc</li><li>def</li><li>ghi123</li><li>456[]</li></ul>",
                });
            }
        );

        test.todo(
            "should insert a new li at the beginning of a list and paste the text of another li into the next li",
            async () => {
                await testEditor({
                    contentBefore: "<ul><li>[]abc</li><li>def</li><li>ghi</li></ul>",
                    stepFunction: async (editor) => {
                        await pasteHtml(editor, "<ul><li>123</li><li>456</li></ul>");
                    },
                    contentAfter: "<ul><li>123</li><li>456[]abc</li><li>def</li><li>ghi</li></ul>",
                });
            }
        );
    });
});

describe("link", () => {
    describe("range collapsed", () => {
        test.todo("should paste and transform an URL in a p", async () => {
            await testEditor({
                contentBefore: "<p>ab[]cd</p>",
                stepFunction: async (editor) => {
                    await pasteText(editor, "http://www.xyz.com");
                },
                contentAfter: '<p>ab<a href="http://www.xyz.com">http://www.xyz.com</a>[]cd</p>',
            });
        });

        test.todo("should paste and transform an URL in a span", async () => {
            await testEditor({
                contentBefore: '<p>a<span class="a">b[]c</span>d</p>',
                stepFunction: async (editor) => {
                    await pasteText(editor, "http://www.xyz.com");
                },
                contentAfter:
                    '<p>a<span class="a">b<a href="http://www.xyz.com">http://www.xyz.com</a>[]c</span>d</p>',
            });
        });

        test.todo("should paste and not transform an URL in a existing link", async () => {
            await testEditor({
                contentBefore: '<p>a<a href="http://existing.com">b[]c</a>d</p>',
                stepFunction: async (editor) => {
                    await pasteText(editor, "http://www.xyz.com");
                },
                contentAfter: '<p>a<a href="http://existing.com">bhttp://www.xyz.com[]c</a>d</p>',
            });
            await testEditor({
                contentBefore: '<p>a<a href="http://existing.com">b[]c</a>d</p>',
                stepFunction: async (editor) => {
                    await pasteText(editor, "random");
                },
                contentAfter: '<p>a<a href="http://existing.com">brandom[]c</a>d</p>',
            });
        });

        test.todo(
            "should paste and transform an URL in a existing link if pasting valid url",
            async () => {
                await testEditor({
                    contentBefore: '<p>a<a href="http://existing.com">[]c</a>d</p>',
                    stepFunction: async (editor) => {
                        await pasteText(editor, "https://www.xyz.xdc");
                    },
                    contentAfter:
                        '<p>a<a href="https://www.xyz.xdcc">https://www.xyz.xdc[]c</a>d</p>',
                });
                await testEditor({
                    contentBefore: '<p>a<a href="http://existing.com">b[].com</a>d</p>',
                    stepFunction: async (editor) => {
                        await pasteText(editor, "oom");
                    },
                    contentAfter: '<p>a<a href="http://boom.com">boom[].com</a>d</p>',
                });
            }
        );

        test.todo("should replace link for new content when pasting in an empty link", async () => {
            await testEditor({
                contentBefore: '<p><a href="#" oe-zws-empty-inline="">[]\u200B</a></p>',
                stepFunction: async (editor) => {
                    await pasteText(editor, "abc");
                },
                contentAfter: "<p>abc[]</p>",
            });
            await testEditor({
                contentBefore: '<p>xy<a href="#" oe-zws-empty-inline="">\u200B[]</a>z</p>',
                stepFunction: async (editor) => {
                    await pasteText(editor, "abc");
                },
                contentAfter: "<p>xyabc[]z</p>",
            });
            await testEditor({
                contentBefore: '<p>xy<a href="#" oe-zws-empty-inline="">\u200B[]</a>z</p>',
                stepFunction: async (editor) => {
                    await pasteText(editor, "http://odoo.com");
                },
                contentAfter: '<p>xy<a href="http://odoo.com">http://odoo.com</a>[]z</p>',
            });
            const imageUrl =
                "https://download.odoocdn.com/icons/website/static/description/icon.png";
            await testEditor({
                contentBefore: '<p>xy<a href="#" oe-zws-empty-inline="">\u200B[]</a>z</p>',
                stepFunction: async (editor) => {
                    await pasteText(editor, imageUrl);
                    // Ensure the powerbox is active
                    expect(editor.powerbox.isOpen).toBeTruthy();
                    // Pick the first command (Embed image)
                    dispatch(editor.editable, "keydown", { key: "Enter" });
                },
                contentAfter: `<p>xy<img src="${imageUrl}">[]z</p>`,
            });
            await testEditor({
                contentBefore: '<p>xy<a href="#" oe-zws-empty-inline="">\u200B[]</a>z</p>',
                stepFunction: async (editor) => {
                    await pasteText(editor, imageUrl);
                    // Ensure the powerbox is active
                    expect(editor.powerbox.isOpen).toBeTruthy();
                    // Pick the second command (Paste as URL)
                    dispatch(editor.editable, "keydown", { key: "ArrowDown" });
                    dispatch(editor.editable, "keydown", { key: "Enter" });
                },
                contentAfter: `<p>xy<a href="${imageUrl}">${imageUrl}</a>[]z</p>`,
            });
        });

        test.todo("should paste and transform plain text content over an empty link", async () => {
            await testEditor({
                contentBefore: '<p><a href="#">[]\u200B</a></p>',
                stepFunction: async (editor) => {
                    await pasteText(editor, "abc www.odoo.com xyz");
                },
                contentAfter: '<p>abc <a href="http://www.odoo.com">www.odoo.com</a> xyz[]</p>',
            });
            await testEditor({
                contentBefore: '<p><a href="#">[]\u200B</a></p>',
                stepFunction: async (editor) => {
                    await pasteText(editor, "odoo.com\ngoogle.com");
                },
                contentAfter:
                    '<p style="margin-bottom: 0px;"><a href="http://odoo.com">odoo.com</a></p>' +
                    '<p><a href="http://google.com">google.com</a>[]<br></p>',
            });
        });

        test.todo("should paste html content over an empty link", async () => {
            await testEditor({
                contentBefore: '<p><a href="#">[]\u200B</a></p>',
                stepFunction: async (editor) => {
                    await pasteHtml(
                        editor,
                        '<a href="www.odoo.com">odoo.com</a><br><a href="www.google.com">google.com</a>'
                    );
                },
                contentAfter:
                    '<p><a href="www.odoo.com">odoo.com</a><br><a href="www.google.com">google.com</a>[]</p>',
            });
        });

        test.todo("should paste and transform URL among text", async () => {
            const url = "https://www.odoo.com";
            const imgUrl = "https://download.odoocdn.com/icons/website/static/description/icon.png";
            const videoUrl = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
            await testEditor({
                contentBefore: "<p>[]</p>",
                stepFunction: async (editor) => {
                    await pasteText(editor, `abc ${url} def`);
                    // Powerbox should not open
                    expect(editor.powerbox.isOpen).not.toBeTruthy();
                },
                contentAfter: `<p>abc <a href="${url}">${url}</a> def[]</p>`,
            });
            await testEditor({
                contentBefore: "<p>[]</p>",
                stepFunction: async (editor) => {
                    await pasteText(editor, `abc ${imgUrl} def`);
                    // Powerbox should not open
                    expect(editor.powerbox.isOpen).not.toBeTruthy();
                },
                contentAfter: `<p>abc <a href="${imgUrl}">${imgUrl}</a> def[]</p>`,
            });
            await testEditor({
                contentBefore: "<p>[]</p>",
                stepFunction: async (editor) => {
                    await pasteText(editor, `abc ${videoUrl} def`);
                    // Powerbox should not open
                    expect(editor.powerbox.isOpen).not.toBeTruthy();
                },
                contentAfter: `<p>abc <a href="${videoUrl}">${videoUrl}</a> def[]</p>`,
            });
        });

        test.todo("should paste and transform multiple URLs", async () => {
            const url = "https://www.odoo.com";
            const imgUrl = "https://download.odoocdn.com/icons/website/static/description/icon.png";
            const videoUrl = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
            await testEditor({
                contentBefore: "<p>[]</p>",
                stepFunction: async (editor) => {
                    await pasteText(editor, `${url} ${videoUrl} ${imgUrl}`);
                    // Powerbox should not open
                    expect(editor.powerbox.isOpen).not.toBeTruthy();
                },
                contentAfter: `<p><a href="${url}">${url}</a> <a href="${videoUrl}">${videoUrl}</a> <a href="${imgUrl}">${imgUrl}</a>[]</p>`,
            });
            await testEditor({
                contentBefore: "<p>[]</p>",
                stepFunction: async (editor) => {
                    await pasteText(editor, `${url} abc ${videoUrl} def ${imgUrl}`);
                    // Powerbox should not open
                    expect(editor.powerbox.isOpen).not.toBeTruthy();
                },
                contentAfter: `<p><a href="${url}">${url}</a> abc <a href="${videoUrl}">${videoUrl}</a> def <a href="${imgUrl}">${imgUrl}</a>[]</p>`,
            });
        });

        test.todo("should paste plain text inside non empty link", async () => {
            await testEditor({
                contentBefore: '<p><a href="#">a[]b</a></p>',
                stepFunction: async (editor) => {
                    await pasteHtml(editor, "<span>123</span>");
                },
                contentAfter: '<p><a href="#">a123[]b</a></p>',
            });
        });
    });

    describe("range not collapsed", () => {
        test.todo("should paste and transform an URL in a p", async () => {
            await testEditor({
                contentBefore: "<p>ab[xxx]cd</p>",
                stepFunction: async (editor) => {
                    await pasteText(editor, "http://www.xyz.com");
                },
                contentAfter: '<p>ab<a href="http://www.xyz.com">http://www.xyz.com</a>[]cd</p>',
            });
        });

        test.todo("should paste and transform an URL in a span", async () => {
            await testEditor({
                contentBefore:
                    '<p>a<span class="a">b[x<a href="http://existing.com">546</a>x]c</span>d</p>',
                stepFunction: async (editor) => {
                    await pasteText(editor, "http://www.xyz.com");
                },
                contentAfter:
                    '<p>a<span class="a">b<a href="http://www.xyz.com">http://www.xyz.com</a>[]c</span>d</p>',
            });
        });

        test.todo("should paste and not transform an URL in a existing link", async () => {
            await testEditor({
                contentBefore: '<p>a<a href="http://existing.com">b[qsdqsd]c</a>d</p>',
                stepFunction: async (editor) => {
                    await pasteText(editor, "http://www.xyz.com");
                },
                contentAfter: '<p>a<a href="http://existing.com">bhttp://www.xyz.com[]c</a>d</p>',
            });
        });

        test.todo("should restore selection when pasting plain text followed by UNDO", async () => {
            await testEditor({
                contentBefore: "<p>[abc]</p>",
                stepFunction: async (editor) => {
                    await pasteText(editor, "def");
                    editor.historyUndo();
                },
                contentAfter: "<p>[abc]</p>",
            });
            await testEditor({
                contentBefore: "<p>[abc]</p>",
                stepFunction: async (editor) => {
                    await pasteText(editor, "www.odoo.com");
                    editor.historyUndo();
                },
                contentAfter: "<p>[abc]</p>",
            });
            await testEditor({
                contentBefore: "<p>[abc]</p>",
                stepFunction: async (editor) => {
                    await pasteText(editor, "def www.odoo.com xyz");
                    editor.historyUndo();
                },
                contentAfter: "<p>[abc]</p>",
            });
        });

        test.todo("should restore selection after pasting HTML followed by UNDO", async () => {
            await testEditor({
                contentBefore: "<p>[abc]</p>",
                stepFunction: async (editor) => {
                    await pasteHtml(
                        editor,
                        '<a href="www.odoo.com">odoo.com</a><br><a href="www.google.com">google.com</a>'
                    );
                    editor.historyUndo();
                },
                contentAfter: "<p>[abc]</p>",
            });
        });

        test.todo("should paste and transform URLs among text or multiple URLs", async () => {
            const url = "https://www.odoo.com";
            const imgUrl = "https://download.odoocdn.com/icons/website/static/description/icon.png";
            const videoUrl = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
            await testEditor({
                contentBefore: "<p>[xyz]<br></p>",
                stepFunction: async (editor) => {
                    await pasteText(editor, `abc ${url} def`);
                    // Powerbox should not open
                    expect(editor.powerbox.isOpen).not.toBeTruthy();
                },
                contentAfter: `<p>abc <a href="${url}">${url}</a> def[]<br></p>`,
            });
            await testEditor({
                contentBefore: "<p>[xyz]<br></p>",
                stepFunction: async (editor) => {
                    await pasteText(editor, `abc ${imgUrl} def`);
                    // Powerbox should not open
                    expect(editor.powerbox.isOpen).not.toBeTruthy();
                },
                contentAfter: `<p>abc <a href="${imgUrl}">${imgUrl}</a> def[]<br></p>`,
            });
            await testEditor({
                contentBefore: "<p>[xyz]<br></p>",
                stepFunction: async (editor) => {
                    await pasteText(editor, `abc ${videoUrl} def`);
                    // Powerbox should not open
                    expect(editor.powerbox.isOpen).not.toBeTruthy();
                },
                contentAfter: `<p>abc <a href="${videoUrl}">${videoUrl}</a> def[]<br></p>`,
            });
            await testEditor({
                contentBefore: "<p>[xyz]<br></p>",
                stepFunction: async (editor) => {
                    await pasteText(editor, `${url} ${videoUrl} ${imgUrl}`);
                    // Powerbox should not open
                    expect(editor.powerbox.isOpen).not.toBeTruthy();
                },
                contentAfter: `<p><a href="${url}">${url}</a> <a href="${videoUrl}">${videoUrl}</a> <a href="${imgUrl}">${imgUrl}</a>[]<br></p>`,
            });
        });

        test.todo("should paste and transform URL over the existing url", async () => {
            await testEditor({
                contentBefore: '<p>ab[<a href="http://www.xyz.com">http://www.xyz.com</a>]cd</p>',
                stepFunction: async (editor) => {
                    await pasteText(editor, "https://www.xyz.xdc ");
                },
                contentAfter: '<p>ab<a href="https://www.xyz.xdc">https://www.xyz.xdc</a> []cd</p>',
            });
        });

        test.todo(
            "should paste plain text content over a link if all of its contents is selected",
            async () => {
                await testEditor({
                    contentBefore: '<p>a<a href="#">[xyz]</a>d</p>',
                    stepFunction: async (editor) => {
                        await pasteText(editor, "bc");
                    },
                    contentAfter: "<p>abc[]d</p>",
                });
            }
        );

        test.todo(
            "should paste and transform plain text content over a link if all of its contents is selected",
            async () => {
                await testEditor({
                    contentBefore: '<p><a href="#">[xyz]</a></p>',
                    stepFunction: async (editor) => {
                        await pasteText(editor, "www.odoo.com");
                    },
                    contentAfter: '<p><a href="http://www.odoo.com">www.odoo.com</a>[]</p>',
                });
                await testEditor({
                    contentBefore: '<p><a href="#">[xyz]</a></p>',
                    stepFunction: async (editor) => {
                        await pasteText(editor, "abc www.odoo.com xyz");
                    },
                    contentAfter: '<p>abc <a href="http://www.odoo.com">www.odoo.com</a> xyz[]</p>',
                });
                const imageUrl =
                    "https://download.odoocdn.com/icons/website/static/description/icon.png";
                await testEditor({
                    contentBefore:
                        '<p>ab<a href="http://www.xyz.com">[http://www.xyz.com]</a>cd</p>',
                    stepFunction: async (editor) => {
                        await pasteText(editor, imageUrl);
                        // Ensure the powerbox is active
                        expect(editor.powerbox.isOpen).toBeTruthy();
                        // Pick the first command (Embed image)
                        dispatch(editor.editable, "keydown", { key: "Enter" });
                    },
                    contentAfter: `<p>ab<img src="${imageUrl}">[]cd</p>`,
                });
                await testEditor({
                    contentBefore:
                        '<p>ab<a href="http://www.xyz.com">[http://www.xyz.com]</a>cd</p>',
                    stepFunction: async (editor) => {
                        await pasteText(editor, imageUrl);
                        // Ensure the powerbox is active
                        expect(editor.powerbox.isOpen).toBeTruthy();
                        // Pick the second command (Paste as URL)
                        dispatch(editor.editable, "keydown", { key: "ArrowDown" });
                        dispatch(editor.editable, "keydown", { key: "Enter" });
                    },
                    contentAfter: `<p>ab<a href="${imageUrl}">${imageUrl}</a>[]cd</p>`,
                });
            }
        );

        test.todo(
            "should paste html content over a link if all of its contents is selected",
            async () => {
                await testEditor({
                    contentBefore: '<p><a href="#">[xyz]</a></p>',
                    stepFunction: async (editor) => {
                        await pasteHtml(
                            editor,
                            '<a href="www.odoo.com">odoo.com</a><br><a href="www.google.com">google.com</a>'
                        );
                    },
                    contentAfter:
                        '<p><a href="www.odoo.com">odoo.com</a><br><a href="www.google.com">google.com</a>[]</p>',
                });
            }
        );
    });
});

describe("images", () => {
    describe("range collapsed", () => {
        test.todo("should paste and transform an image URL in a p", async () => {
            await testEditor({
                contentBefore: "<p>ab[]cd</p>",
                stepFunction: async (editor) => {
                    await pasteText(
                        editor,
                        "https://download.odoocdn.com/icons/website/static/description/icon.png"
                    );
                    // Ensure the powerbox is active
                    expect(editor.powerbox.isOpen).toBeTruthy();
                    // Force powerbox validation on the default first choice
                    await editor.powerbox._pickCommand();
                },
                contentAfter:
                    '<p>ab<img src="https://download.odoocdn.com/icons/website/static/description/icon.png">[]cd</p>',
            });
        });

        test.todo("should paste and transform an image URL in a span", async () => {
            await testEditor({
                contentBefore: '<p>a<span class="a">b[]c</span>d</p>',
                stepFunction: async (editor) => {
                    await pasteText(
                        editor,
                        "https://download.odoocdn.com/icons/website/static/description/icon.png"
                    );
                    // Ensure the powerbox is active
                    expect(editor.powerbox.isOpen).toBeTruthy();
                    // Force powerbox validation on the default first choice
                    await editor.powerbox._pickCommand();
                },
                contentAfter:
                    '<p>a<span class="a">b<img src="https://download.odoocdn.com/icons/website/static/description/icon.png">[]c</span>d</p>',
            });
        });

        test.todo("should paste and transform an image URL in an existing link", async () => {
            await testEditor({
                contentBefore: '<p>a<a href="http://existing.com">b[]c</a>d</p>',
                stepFunction: async (editor) => {
                    await pasteText(
                        editor,
                        "https://download.odoocdn.com/icons/website/static/description/icon.png"
                    );
                    // Powerbox should not open
                    expect(editor.powerbox.isOpen).not.toBeTruthy();
                },
                contentAfter:
                    '<p>a<a href="http://existing.com">b<img src="https://download.odoocdn.com/icons/website/static/description/icon.png">[]c</a>d</p>',
            });
        });

        test.todo("should paste an image URL as a link in a p", async () => {
            const url = "https://download.odoocdn.com/icons/website/static/description/icon.png";
            await testEditor({
                contentBefore: "<p>[]</p>",
                stepFunction: async (editor) => {
                    await pasteText(editor, url);
                    // Ensure the powerbox is active
                    expect(editor.powerbox.isOpen).toBeTruthy();
                    // Pick the second command (Paste as URL)
                    dispatch(editor.editable, "keydown", { key: "ArrowDown" });
                    dispatch(editor.editable, "keydown", { key: "Enter" });
                },
                contentAfter: `<p><a href="${url}">${url}</a>[]</p>`,
            });
        });

        test.todo(
            "should not revert a history step when pasting an image URL as a link",
            async () => {
                const url =
                    "https://download.odoocdn.com/icons/website/static/description/icon.png";
                await testEditor({
                    contentBefore: "<p>[]</p>",
                    stepFunction: async (editor) => {
                        // paste text to have a history step recorded
                        await pasteText(editor, "*should not disappear*");
                        await pasteText(editor, url);
                        // Ensure the powerbox is active
                        expect(editor.powerbox.isOpen).toBeTruthy();
                        // Pick the second command (Paste as URL)
                        dispatch(editor.editable, "keydown", { key: "ArrowDown" });
                        dispatch(editor.editable, "keydown", { key: "Enter" });
                    },
                    contentAfter: `<p>*should not disappear*<a href="${url}">${url}</a>[]</p>`,
                });
            }
        );
    });

    describe("range not collapsed", () => {
        test.todo("should paste and transform an image URL in a p", async () => {
            await testEditor({
                contentBefore: "<p>ab[xxx]cd</p>",
                stepFunction: async (editor) => {
                    await pasteText(
                        editor,
                        "https://download.odoocdn.com/icons/website/static/description/icon.png"
                    );
                    // Ensure the powerbox is active
                    expect(editor.powerbox.isOpen).toBeTruthy();
                    // Force powerbox validation on the default first choice
                    await editor.powerbox._pickCommand();
                },
                contentAfter:
                    '<p>ab<img src="https://download.odoocdn.com/icons/website/static/description/icon.png">[]cd</p>',
            });
        });

        test.todo("should paste and transform an image URL in a span", async () => {
            await testEditor({
                contentBefore:
                    '<p>a<span class="a">b[x<a href="http://existing.com">546</a>x]c</span>d</p>',
                stepFunction: async (editor) => {
                    await pasteText(
                        editor,
                        "https://download.odoocdn.com/icons/website/static/description/icon.png"
                    );
                    // Ensure the powerbox is active
                    expect(editor.powerbox.isOpen).toBeTruthy();
                    // Force powerbox validation on the default first choice
                    await editor.powerbox._pickCommand();
                },
                contentAfter:
                    '<p>a<span class="a">b<img src="https://download.odoocdn.com/icons/website/static/description/icon.png">[]c</span>d</p>',
            });
        });

        test.todo("should paste and transform an image URL inside an existing link", async () => {
            await testEditor({
                contentBefore: '<p>a<a href="http://existing.com">b[qsdqsd]c</a>d</p>',
                stepFunction: async (editor) => {
                    await pasteText(
                        editor,
                        "https://download.odoocdn.com/icons/website/static/description/icon.png"
                    );
                    // Powerbox should not open
                    expect(editor.powerbox.isOpen).not.toBeTruthy();
                },
                contentAfter:
                    '<p>a<a href="http://existing.com">b<img src="https://download.odoocdn.com/icons/website/static/description/icon.png">[]c</a>d</p>',
            });
        });

        test.todo("should paste an image URL as a link in a p", async () => {
            const url = "https://download.odoocdn.com/icons/website/static/description/icon.png";
            await testEditor({
                contentBefore: "<p>ab[xxx]cd</p>",
                stepFunction: async (editor) => {
                    await pasteText(editor, url);
                    // Ensure the powerbox is active
                    expect(editor.powerbox.isOpen).toBeTruthy();
                    // Pick the second command (Paste as URL)
                    dispatch(editor.editable, "keydown", { key: "ArrowDown" });
                    dispatch(editor.editable, "keydown", { key: "Enter" });
                },
                contentAfter: `<p>ab<a href="${url}">${url}</a>[]cd</p>`,
            });
        });

        test.todo(
            "should not revert a history step when pasting an image URL as a link",
            async () => {
                const url =
                    "https://download.odoocdn.com/icons/website/static/description/icon.png";
                await testEditor({
                    contentBefore: "<p>[]</p>",
                    stepFunction: async (editor) => {
                        // paste text (to have a history step recorded)
                        await pasteText(editor, "abxxxcd");
                        // select xxx in "<p>ab[xxx]cd</p>""
                        const p = editor.editable.querySelector("p");
                        const selection = {
                            anchorNode: p.childNodes[1],
                            anchorOffset: 2,
                            focusNode: p.childNodes[1],
                            focusOffset: 5,
                        };
                        setTestSelection(selection, editor.document);
                        editor._computeHistorySelection();
                        // paste url
                        await pasteText(editor, url);
                        // Ensure the powerbox is active
                        expect(editor.powerbox.isOpen).toBeTruthy();
                        // Pick the second command (Paste as URL)
                        dispatch(editor.editable, "keydown", { key: "ArrowDown" });
                        dispatch(editor.editable, "keydown", { key: "Enter" });
                    },
                    contentAfter: `<p>ab<a href="${url}">${url}</a>[]cd</p>`,
                });
            }
        );

        test.todo("should restore selection after pasting image URL followed by UNDO", async () => {
            const url = "https://download.odoocdn.com/icons/website/static/description/icon.png";
            await testEditor({
                contentBefore: "<p>[abc]</p>",
                stepFunction: async (editor) => {
                    await pasteText(editor, url);
                    // Ensure the powerbox is active
                    expect(editor.powerbox.isOpen).toBeTruthy();
                    // Pick first command (Embed image)
                    dispatch(editor.editable, "keydown", { key: "Enter" });
                    // Undo
                    // TODO @phoenix: still need nexTick here?
                    // await nextTick();
                    editor.historyUndo();
                },
                contentAfter: "<p>[abc]</p>",
            });
            await testEditor({
                contentBefore: "<p>[abc]</p>",
                stepFunction: async (editor) => {
                    await pasteText(editor, url);
                    // Ensure the powerbox is active
                    expect(editor.powerbox.isOpen).toBeTruthy();
                    // Pick second command (Paste as URL)
                    dispatch(editor.editable, "keydown", { key: "ArrowDown" });
                    dispatch(editor.editable, "keydown", { key: "Enter" });
                    // Undo
                    editor.historyUndo();
                },
                contentAfter: "<p>[abc]</p>",
            });
        });
    });
});

describe("youtube video", () => {
    describe("range collapsed", () => {
        test.todo("should paste and transform a youtube URL in a p", async () => {
            await testEditor({
                contentBefore: "<p>ab[]cd</p>",
                stepFunction: async (editor) => {
                    await pasteText(editor, "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
                    // Ensure the powerbox is active
                    expect(editor.powerbox.isOpen).toBeTruthy();
                    // Force powerbox validation on the default first choice
                    await editor.powerbox._pickCommand();
                },
                contentAfter:
                    '<p>ab<iframe width="560" height="315" src="https://www.youtube.com/embed/dQw4w9WgXcQ" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen="1"></iframe>[]cd</p>',
            });
        });

        test.todo("should paste and transform a youtube URL in a span", async () => {
            await testEditor({
                contentBefore: '<p>a<span class="a">b[]c</span>d</p>',
                stepFunction: async (editor) => {
                    await pasteText(editor, "https://youtu.be/dQw4w9WgXcQ");
                    // Ensure the powerbox is active
                    expect(editor.powerbox.isOpen).toBeTruthy();
                    // Force powerbox validation on the default first choice
                    await editor.powerbox._pickCommand();
                },
                contentAfter:
                    '<p>a<span class="a">b<iframe width="560" height="315" src="https://www.youtube.com/embed/dQw4w9WgXcQ" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen="1"></iframe>[]c</span>d</p>',
            });
        });

        test.todo("should paste and not transform a youtube URL in a existing link", async () => {
            await testEditor({
                contentBefore: '<p>a<a href="http://existing.com">b[]c</a>d</p>',
                stepFunction: async (editor) => {
                    await pasteText(editor, "https://youtu.be/dQw4w9WgXcQ");
                    // Ensure the powerbox is not active
                    expect(editor.powerbox.isOpen).not.toBeTruthy();
                },
                contentAfter:
                    '<p>a<a href="http://existing.com">bhttps://youtu.be/dQw4w9WgXcQ[]c</a>d</p>',
            });
        });

        test.todo("should paste a youtube URL as a link in a p", async () => {
            const url = "https://youtu.be/dQw4w9WgXcQ";
            await testEditor({
                contentBefore: "<p>[]</p>",
                stepFunction: async (editor) => {
                    await pasteText(editor, url);
                    // Ensure the powerbox is active
                    expect(editor.powerbox.isOpen).toBeTruthy();
                    // Pick the second command (Paste as URL)
                    dispatch(editor.editable, "keydown", { key: "ArrowDown" });
                    dispatch(editor.editable, "keydown", { key: "Enter" });
                },
                contentAfter: `<p><a href="${url}">${url}</a>[]</p>`,
            });
        });

        test.todo(
            "should not revert a history step when pasting a youtube URL as a link",
            async () => {
                const url = "https://youtu.be/dQw4w9WgXcQ";
                await testEditor({
                    contentBefore: "<p>[]</p>",
                    stepFunction: async (editor) => {
                        // paste text to have a history step recorded
                        await pasteText(editor, "*should not disappear*");
                        await pasteText(editor, url);
                        // Ensure the powerbox is active
                        expect(editor.powerbox.isOpen).toBeTruthy();
                        // Pick the second command (Paste as URL)
                        dispatch(editor.editable, "keydown", { key: "ArrowDown" });
                        dispatch(editor.editable, "keydown", { key: "Enter" });
                    },
                    contentAfter: `<p>*should not disappear*<a href="${url}">${url}</a>[]</p>`,
                });
            }
        );
    });

    describe("range not collapsed", () => {
        test.todo("should paste and transform a youtube URL in a p", async () => {
            await testEditor({
                contentBefore: "<p>ab[xxx]cd</p>",
                stepFunction: async (editor) => {
                    await pasteText(editor, "https://youtu.be/dQw4w9WgXcQ");
                    // Ensure the powerbox is active
                    expect(editor.powerbox.isOpen).toBeTruthy();
                    // Force powerbox validation on the default first choice
                    await editor.powerbox._pickCommand();
                },
                contentAfter:
                    '<p>ab<iframe width="560" height="315" src="https://www.youtube.com/embed/dQw4w9WgXcQ" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen="1"></iframe>[]cd</p>',
            });
        });

        test.todo("should paste and transform a youtube URL in a span", async () => {
            await testEditor({
                contentBefore:
                    '<p>a<span class="a">b[x<a href="http://existing.com">546</a>x]c</span>d</p>',
                stepFunction: async (editor) => {
                    await pasteText(editor, "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
                    // Ensure the powerbox is active
                    expect(editor.powerbox.isOpen).toBeTruthy();
                    // Force powerbox validation on the default first choice
                    await editor.powerbox._pickCommand();
                },
                contentAfter:
                    '<p>a<span class="a">b<iframe width="560" height="315" src="https://www.youtube.com/embed/dQw4w9WgXcQ" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen="1"></iframe>[]c</span>d</p>',
            });
        });

        test.todo("should paste and not transform a youtube URL in a existing link", async () => {
            await testEditor({
                contentBefore: '<p>a<a href="http://existing.com">b[qsdqsd]c</a>d</p>',
                stepFunction: async (editor) => {
                    await pasteText(editor, "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
                    // Ensure the powerbox is not active
                    expect(editor.powerbox.isOpen).not.toBeTruthy();
                },
                contentAfter:
                    '<p>a<a href="http://existing.com">bhttps://www.youtube.com/watch?v=dQw4w9WgXcQ[]c</a>d</p>',
            });
        });

        test.todo("should paste a youtube URL as a link in a p", async () => {
            const url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
            await testEditor({
                contentBefore: "<p>ab[xxx]cd</p>",
                stepFunction: async (editor) => {
                    await pasteText(editor, url);
                    // Ensure the powerbox is active
                    expect(editor.powerbox.isOpen).toBeTruthy();
                    // Pick the second command (Paste as URL)
                    dispatch(editor.editable, "keydown", { key: "ArrowDown" });
                    dispatch(editor.editable, "keydown", { key: "Enter" });
                },
                contentAfter: `<p>ab<a href="${url}">${url}</a>[]cd</p>`,
            });
        });

        test.todo(
            "should not revert a history step when pasting a youtube URL as a link",
            async () => {
                const url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
                await testEditor({
                    contentBefore: "<p>[]</p>",
                    stepFunction: async (editor) => {
                        // paste text (to have a history step recorded)
                        await pasteText(editor, "abxxxcd");
                        // select xxx in "<p>ab[xxx]cd</p>"
                        const p = editor.editable.querySelector("p");
                        const selection = {
                            anchorNode: p.childNodes[1],
                            anchorOffset: 2,
                            focusNode: p.childNodes[1],
                            focusOffset: 5,
                        };
                        setTestSelection(selection, editor.document);
                        editor._computeHistorySelection();

                        // paste url
                        await pasteText(editor, url);
                        // Ensure the powerbox is active
                        expect(editor.powerbox.isOpen).toBeTruthy();
                        // Pick the second command (Paste as URL)
                        dispatch(editor.editable, "keydown", { key: "ArrowDown" });
                        dispatch(editor.editable, "keydown", { key: "Enter" });
                    },
                    contentAfter: `<p>ab<a href="${url}">${url}</a>[]cd</p>`,
                });
            }
        );

        test.todo("should restore selection after pasting video URL followed by UNDO", async () => {
            const url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
            await testEditor({
                contentBefore: "<p>[abc]</p>",
                stepFunction: async (editor) => {
                    await pasteText(editor, url);
                    // Ensure the powerbox is active
                    expect(editor.powerbox.isOpen).toBeTruthy();
                    // Pick first command (Embed video)
                    dispatch(editor.editable, "keydown", { key: "Enter" });
                    // Undo
                    editor.historyUndo();
                },
                contentAfter: "<p>[abc]</p>",
            });
            await testEditor({
                contentBefore: "<p>[abc]</p>",
                stepFunction: async (editor) => {
                    await pasteText(editor, url);
                    // Ensure the powerbox is active
                    expect(editor.powerbox.isOpen).toBeTruthy();
                    // Pick second command (Paste as URL)
                    dispatch(editor.editable, "keydown", { key: "ArrowDown" });
                    dispatch(editor.editable, "keydown", { key: "Enter" });
                    // Undo
                    editor.historyUndo();
                },
                contentAfter: "<p>[abc]</p>",
            });
        });
    });
});

describe("Odoo editor own html", () => {
    test.todo("should paste html as is", async () => {
        await testEditor({
            contentBefore: "<p>a[]b</p>",
            stepFunction: async (editor) => {
                await pasteOdooEditorHtml(editor, '<div class="custom-paste">b</div>');
            },
            contentAfter: '<p>a</p><div class="custom-paste">b</div><p>[]b</p>',
        });
    });

    test.todo("should not paste unsafe content", async () => {
        await testEditor({
            contentBefore: "<p>a[]b</p>",
            stepFunction: async (editor) => {
                await pasteOdooEditorHtml(editor, `<script>console.log('xss attack')</script>`);
            },
            contentAfter: "<p>a[]b</p>",
        });
    });
});

describe("editable in iframe", () => {
    test.todo("should paste odoo-editor html", async () => {
        // Setup
        const testContainer = document.querySelector("#editor-test-container");
        const iframe = document.createElement("iframe");

        testContainer.append(iframe);
        const iframeDocument = iframe.contentDocument;
        const editable = iframeDocument.createElement("div");
        iframeDocument.body.append(editable);
        // TODO @phoenix: need to use setupEditor.
        // const editor = new BasicEditor(editable, { document: iframeDocument });
        const editor = null;

        // Action: paste
        setSelection(editable.querySelector("p"), 0);
        const clipboardData = new DataTransfer();
        clipboardData.setData("text/odoo-editor", "<p>text<b>bold text</b>more text</p>");
        dispatch(editor.editable, "paste", { clipboardData });

        // Clean-up
        editor.clean();
        editor.destroy();
        iframe.remove();

        // Assertion
        expect(editable.innerHTML).toBe(
            "<p>text<b>bold text</b>more text<br></p>",
            "should paste content in the paragraph"
        );
    });
});

describe("Paste HTML tables", () => {
    // The tests below are very sensitive to whitespaces as they do represent actual
    // whitespace text nodes in the DOM. The tests will fail if those are removed.
    test.todo("should keep all allowed style (Excel Online)", async () => {
        await testEditor({
            contentBefore: "<p>[]</p>",
            stepFunction: async (editor) => {
                await pasteHtml(
                    editor,
                    `<div ccp_infra_version='3' ccp_infra_timestamp='1684505961078' ccp_infra_user_hash='540904553' ccp_infra_copy_id=''
    data-ccp-timestamp='1684505961078'>
    <html>

    <head>
        <meta http-equiv=Content-Type content="text/html; charset=utf-8">
        <meta name=ProgId content=Excel.Sheet>
        <meta name=Generator content="Microsoft Excel 15">
        <style>
            table {
                mso-displayed-decimal-separator: "\\,";
                mso-displayed-thousand-separator: "\\.";
            }

            tr {
                mso-height-source: auto;
            }

            col {
                mso-width-source: auto;
            }

            td {
                padding-top: 1px;
                padding-right: 1px;
                padding-left: 1px;
                mso-ignore: padding;
                color: black;
                font-size: 11.0pt;
                font-weight: 400;
                font-style: normal;
                text-decoration: none;
                font-family: Calibri, sans-serif;
                mso-font-charset: 0;
                text-align: general;
                vertical-align: bottom;
                border: none;
                white-space: nowrap;
                mso-rotate: 0;
            }

            .font12 {
                color: #495057;
                font-size: 10.0pt;
                font-weight: 400;
                font-style: italic;
                text-decoration: none;
                font-family: "Odoo Unicode Support Noto";
                mso-generic-font-family: auto;
                mso-font-charset: 0;
            }

            .font13 {
                color: #495057;
                font-size: 10.0pt;
                font-weight: 700;
                font-style: italic;
                text-decoration: none;
                font-family: "Odoo Unicode Support Noto";
                mso-generic-font-family: auto;
                mso-font-charset: 0;
            }

            .font33 {
                color: #495057;
                font-size: 10.0pt;
                font-weight: 700;
                font-style: normal;
                text-decoration: none;
                font-family: "Odoo Unicode Support Noto";
                mso-generic-font-family: auto;
                mso-font-charset: 0;
            }

            .xl87 {
                font-size: 14.0pt;
                font-family: "Roboto Mono";
                mso-generic-font-family: auto;
                mso-font-charset: 1;
                text-align: center;
            }

            .xl88 {
                color: #495057;
                font-size: 10.0pt;
                font-style: italic;
                font-family: "Odoo Unicode Support Noto";
                mso-generic-font-family: auto;
                mso-font-charset: 0;
                text-align: center;
            }

            .xl89 {
                color: #495057;
                font-size: 10.0pt;
                font-style: italic;
                font-family: Arial;
                mso-generic-font-family: auto;
                mso-font-charset: 1;
                text-align: center;
            }

            .xl90 {
                color: #495057;
                font-size: 10.0pt;
                font-weight: 700;
                font-family: "Odoo Unicode Support Noto";
                mso-generic-font-family: auto;
                mso-font-charset: 0;
                text-align: center;
            }

            .xl91 {
                color: #495057;
                font-size: 10.0pt;
                font-weight: 700;
                text-decoration: underline;
                text-underline-style: single;
                font-family: Arial;
                mso-generic-font-family: auto;
                mso-font-charset: 1;
                text-align: center;
            }

            .xl92 {
                color: red;
                font-size: 10.0pt;
                font-family: Arial;
                mso-generic-font-family: auto;
                mso-font-charset: 1;
                text-align: center;
            }

            .xl93 {
                color: red;
                font-size: 10.0pt;
                text-decoration: underline;
                text-underline-style: single;
                font-family: Arial;
                mso-generic-font-family: auto;
                mso-font-charset: 1;
                text-align: center;
            }

            .xl94 {
                color: #495057;
                font-size: 10.0pt;
                font-family: "Odoo Unicode Support Noto";
                mso-generic-font-family: auto;
                mso-font-charset: 1;
                text-align: center;
                background: yellow;
                mso-pattern: black none;
            }

            .xl95 {
                color: red;
                font-size: 10.0pt;
                font-family: Arial;
                mso-generic-font-family: auto;
                mso-font-charset: 1;
                text-align: center;
                background: yellow;
                mso-pattern: black none;
                white-space: normal;
            }
        </style>
    </head>

    <body link="#0563C1" vlink="#954F72">
        <table width=398 style='border-collapse:collapse;width:299pt'><!--StartFragment-->
            <col width=187 style='width:140pt'>
            <col width=211 style='width:158pt'>
            <tr height=20 style='height:15.0pt'>
                <td width=187 height=20 class=xl88 dir=LTR style='width:140pt;height:15.0pt'><span class=font12>Italic
                        then also </span><span class=font13>BOLD</span></td>
                <td width=211 class=xl89 dir=LTR style='width:158pt'><s>Italic strike</s></td>
            </tr>
            <tr height=20 style='height:15.0pt'>
                <td height=20 class=xl90 dir=LTR style='height:15.0pt'><span class=font33>Just bold </span><span
                        class=font12>Just Italic</span></td>
                <td class=xl91 dir=LTR>Bold underline</td>
            </tr>
            <tr height=20 style='height:15.0pt'>
                <td height=20 class=xl92 dir=LTR style='height:15.0pt'>Color text</td>
                <td class=xl93 dir=LTR><s>Color strike and underline</s></td>
            </tr>
            <tr height=20 style='height:15.0pt'>
                <td height=20 class=xl94 dir=LTR style='height:15.0pt'>Color background</td>
                <td width=211 class=xl95 dir=LTR style='width:158pt'>Color text on color background</td>
            </tr>
            <tr height=27 style='height:20.25pt'>
                <td colspan=2 width=398 height=27 class=xl87 dir=LTR style='width:299pt;height:20.25pt'>14pt MONO TEXT
                </td>
            </tr><!--EndFragment-->
        </table>
    </body>

    </html>
</div>`
                );
            },
            contentAfter: `<table class="table table-bordered">
            
            
            <tbody><tr>
                <td>Italic
                        then also BOLD</td>
                <td><s>Italic strike</s></td>
            </tr>
            <tr>
                <td>Just bold Just Italic</td>
                <td>Bold underline</td>
            </tr>
            <tr>
                <td>Color text</td>
                <td><s>Color strike and underline</s></td>
            </tr>
            <tr>
                <td>Color background</td>
                <td>Color text on color background</td>
            </tr>
            <tr>
                <td>14pt MONO TEXT
                </td>
            </tr>
        </tbody></table><p>
    

    
[]</p>`,
        });
    });

    test.todo("should keep all allowed style (Google Sheets)", async () => {
        await testEditor({
            contentBefore: "<p>[]</p>",
            stepFunction: async (editor) => {
                await pasteHtml(
                    editor,
                    `<google-sheets-html-origin>
    <style type="text/css">
        td {
            border: 1px solid #cccccc;
        }

        br {
            mso-data-placement: same-cell;
        }
    </style>
    <table xmlns="http://www.w3.org/1999/xhtml" cellspacing="0" cellpadding="0" dir="ltr" border="1"
        style="table-layout:fixed;font-size:10pt;font-family:Arial;width:0px;border-collapse:collapse;border:none">
        <colgroup>
            <col width="170" />
            <col width="187" />
        </colgroup>
        <tbody>
            <tr style="height:21px;">
                <td style="overflow:hidden;padding:2px 3px 2px 3px;vertical-align:bottom;font-family:Odoo Unicode Support Noto;font-weight:normal;font-style:italic;color:#495057;"
                    data-sheets-value="{&quot;1&quot;:2,&quot;2&quot;:&quot;Italic then also BOLD&quot;}"
                    data-sheets-textstyleruns="{&quot;1&quot;:0,&quot;2&quot;:{&quot;3&quot;:&quot;Arial&quot;}}{&quot;1&quot;:17,&quot;2&quot;:{&quot;3&quot;:&quot;Arial&quot;,&quot;5&quot;:1}}">
                    <span style="font-size:10pt;font-family:Arial;font-style:italic;color:#495057;">Italic then also
                    </span><span
                        style="font-size:10pt;font-family:Arial;font-weight:bold;font-style:italic;color:#495057;">BOLD</span>
                </td>
                <td style="overflow:hidden;padding:2px 3px 2px 3px;vertical-align:bottom;font-style:italic;text-decoration:line-through;color:#495057;"
                    data-sheets-value="{&quot;1&quot;:2,&quot;2&quot;:&quot;Italic strike&quot;}">Italic strike</td>
            </tr>
            <tr style="height:21px;">
                <td style="overflow:hidden;padding:2px 3px 2px 3px;vertical-align:bottom;font-family:Odoo Unicode Support Noto;font-weight:bold;color:#495057;"
                    data-sheets-value="{&quot;1&quot;:2,&quot;2&quot;:&quot;Just bold Just italic&quot;}"
                    data-sheets-textstyleruns="{&quot;1&quot;:0,&quot;2&quot;:{&quot;3&quot;:&quot;Arial&quot;}}{&quot;1&quot;:10,&quot;2&quot;:{&quot;3&quot;:&quot;Arial&quot;,&quot;5&quot;:0,&quot;6&quot;:1}}">
                    <span
                        style="font-size:10pt;font-family:Arial;font-weight:bold;font-style:normal;color:#495057;">Just
                        Bold </span><span style="font-size:10pt;font-family:Arial;font-style:italic;color:#495057;">Just
                        Italic</span>
                </td>
                <td style="overflow:hidden;padding:2px 3px 2px 3px;vertical-align:bottom;font-weight:bold;text-decoration:underline;color:#495057;"
                    data-sheets-value="{&quot;1&quot;:2,&quot;2&quot;:&quot;Bold underline&quot;}">Bold underline</td>
            </tr>
            <tr style="height:21px;">
                <td style="overflow:hidden;padding:2px 3px 2px 3px;vertical-align:bottom;"
                    data-sheets-value="{&quot;1&quot;:2,&quot;2&quot;:&quot;Color text&quot;}"><span style="color:#ff0000;">Color text</span></td>
                <td style="overflow:hidden;padding:2px 3px 2px 3px;vertical-align:bottom;text-decoration:underline line-through;color:#ff0000;"
                    data-sheets-value="{&quot;1&quot;:2,&quot;2&quot;:&quot;Color strike and underline&quot;}">Color
                    strike and underline</td>
            </tr>
            <tr style="height:21px;">
                <td style="overflow:hidden;padding:2px 3px 2px 3px;vertical-align:bottom;background-color:#ffff00;font-family:Odoo Unicode Support Noto;font-weight:normal;color:#495057;"
                    data-sheets-value="{&quot;1&quot;:2,&quot;2&quot;:&quot;Color background&quot;}">Color background
                </td>
                <td style="overflow:hidden;padding:2px 3px 2px 3px;vertical-align:bottom;background-color:#ffff00;color:#ff0000;"
                    data-sheets-value="{&quot;1&quot;:2,&quot;2&quot;:&quot;Color text on color background&quot;}">Color
                    text on color background</td>
            </tr>
            <tr style="height:21px;">
                <td style="overflow:hidden;padding:2px 3px 2px 3px;vertical-align:bottom;font-family:Roboto Mono;font-size:14pt;font-weight:normal;text-align:center;"
                    rowspan="1" colspan="2"
                    data-sheets-value="{&quot;1&quot;:2,&quot;2&quot;:&quot;14pt MONO TEXT&quot;}">14pt MONO TEXT</td>
            </tr>
        </tbody>
    </table>
</google-sheets-html-origin>`
                );
            },
            contentAfter: `<table class="table table-bordered">
        
            
            
        
        <tbody>
            <tr>
                <td>
                    Italic then also
                    BOLD
                </td>
                <td>Italic strike</td>
            </tr>
            <tr>
                <td>
                    Just
                        Bold Just
                        Italic
                </td>
                <td>Bold underline</td>
            </tr>
            <tr>
                <td>Color text</td>
                <td>Color
                    strike and underline</td>
            </tr>
            <tr>
                <td>Color background
                </td>
                <td>Color
                    text on color background</td>
            </tr>
            <tr>
                <td>14pt MONO TEXT</td>
            </tr>
        </tbody>
    </table><p>
[]</p>`,
        });
    });

    test.todo("should keep all allowed style (Libre Office)", async () => {
        await testEditor({
            contentBefore: "<p>[]</p>",
            stepFunction: async (editor) => {
                await pasteHtml(
                    editor,
                    `<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.0 Transitional//EN">
<html>

<head>
    <meta http-equiv="content-type" content="text/html; charset=utf-8" />
    <title></title>
    <meta name="generator" content="LibreOffice 6.4.7.2 (Linux)" />
    <style type="text/css">
        body,
        div,
        table,
        thead,
        tbody,
        tfoot,
        tr,
        th,
        td,
        p {
            font-family: "Arial";
            font-size: x-small
        }

        a.comment-indicator:hover+comment {
            background: #ffd;
            position: absolute;
            display: block;
            border: 1px solid black;
            padding: 0.5em;
        }

        a.comment-indicator {
            background: red;
            display: inline-block;
            border: 1px solid black;
            width: 0.5em;
            height: 0.5em;
        }

        comment {
            display: none;
        }
    </style>
</head>

<body>
    <table cellspacing="0" border="0">
        <colgroup width="212"></colgroup>
        <colgroup width="209"></colgroup>
        <tr>
            <td style="border-top: 1px solid #000000; border-bottom: 1px solid #000000; border-left: 1px solid #000000; border-right: 1px solid #000000"
                height="20" align="left"><i>Italic then also BOLD</i></td>
            <td style="border-top: 1px solid #000000; border-bottom: 1px solid #000000; border-left: 1px solid #000000; border-right: 1px solid #000000"
                align="left"><i><s>Italic strike</s></i></td>
        </tr>
        <tr>
            <td style="border-top: 1px solid #000000; border-bottom: 1px solid #000000; border-left: 1px solid #000000; border-right: 1px solid #000000"
                height="20" align="left"><b>Just bold Just italic</b></td>
            <td style="border-top: 1px solid #000000; border-bottom: 1px solid #000000; border-left: 1px solid #000000; border-right: 1px solid #000000"
                align="left"><b><u>Bold underline</u></b></td>
        </tr>
        <tr>
            <td style="border-top: 1px solid #000000; border-bottom: 1px solid #000000; border-left: 1px solid #000000; border-right: 1px solid #000000"
                height="20" align="left">
                <font color="#FF0000">Color text</font>
            </td>
            <td style="border-top: 1px solid #000000; border-bottom: 1px solid #000000; border-left: 1px solid #000000; border-right: 1px solid #000000"
                align="left"><u><s>
                        <font color="#FF0000">Color strike and underline</font>
                    </s></u></td>
        </tr>
        <tr>
            <td style="border-top: 1px solid #000000; border-bottom: 1px solid #000000; border-left: 1px solid #000000; border-right: 1px solid #000000"
                height="20" align="left" bgcolor="#FFFF00">Color background</td>
            <td style="border-top: 1px solid #000000; border-bottom: 1px solid #000000; border-left: 1px solid #000000; border-right: 1px solid #000000"
                align="left" bgcolor="#FFFF00">
                <font color="#FF0000">Color text on color background</font>
            </td>
        </tr>
        <tr>
            <td colspan=2 height="26" align="center" valign=middle>
                <font face="Andale Mono" size=4>14pt MONO TEXT</font>
            </td>
        </tr>
    </table>
</body>

</html>`
                );
            },
            contentAfter: `<table class="table table-bordered">
        
        
        <tbody><tr>
            <td><i>Italic then also BOLD</i></td>
            <td><i><s>Italic strike</s></i></td>
        </tr>
        <tr>
            <td><b>Just bold Just italic</b></td>
            <td><b><u>Bold underline</u></b></td>
        </tr>
        <tr>
            <td>
                Color text
            </td>
            <td><u><s>
                        Color strike and underline
                    </s></u></td>
        </tr>
        <tr>
            <td>Color background</td>
            <td>
                Color text on color background
            </td>
        </tr>
        <tr>
            <td>
                14pt MONO TEXT
            </td>
        </tr>
    </tbody></table><p>


[]</p>`,
        });
    });
});
