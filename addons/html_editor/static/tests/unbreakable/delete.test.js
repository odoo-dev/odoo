import { describe, test } from "@odoo/hoot";
import { testEditor } from "../_helpers/editor";
import { deleteBackward, deleteForward } from "../_helpers/user_actions";
import { unformat } from "../_helpers/format";

describe("backward", () => {
    describe("selection collapsed", () => {
        describe("start empty", () => {
            test("should delete empty p after an unbreakable (backward)", async () => {
                await testEditor({
                    contentBefore: `<div>a</div><p>[]<br></p>`,
                    stepFunction: deleteBackward,
                    contentAfter: `<div>a[]</div>`,
                });
            });
            test("should delete empty p/br after an unbreakable (backward)", async () => {
                await testEditor({
                    contentBefore: `<div>a</div><p>[]<br></p>`,
                    stepFunction: deleteBackward,
                    contentAfter: `<div>a[]</div>`,
                });
            });
            test("should delete empty unbreakable (backward)", async () => {
                await testEditor({
                    contentBefore: unformat(`
                    <div>
                        <div><p>a</p></div>
                        <div>[]</div>
                    </div>`),
                    stepFunction: deleteBackward,
                    contentAfter: unformat(`
                    <div>
                        <div>
                            <p>a[]</p>
                        </div>
                    </div>`),
                });
            });
            test("should not delete an empty unbreakable when there is no elements to delete before (backward)", async () => {
                await testEditor({
                    contentBefore: unformat(`
                        <div>
                            <div>[]<br></div>
                            <div>a</div>
                        </div>`),
                    stepFunction: deleteBackward,
                    contentAfter: unformat(`
                        <div>
                            <div>[]<br></div>
                            <div>a</div>
                        </div>`),
                });
            });
        });

        describe("start text", () => {
            test("should not merge p with an unbreakable (backward)", async () => {
                await testEditor({
                    contentBefore: `<div>b</div><p>[]a</p>`,
                    stepFunction: deleteBackward,
                    contentAfter: `<div>b</div><p>[]a</p>`,
                });
            });
            test("should not merge unbreakable before an unbreakable (backward)", async () => {
                await testEditor({
                    contentBefore: unformat(`
                        <div>
                            <div>a</div>
                            <div>[]b</div>
                        </div>`),
                    stepFunction: deleteBackward,
                    contentAfter: unformat(`
                        <div>
                            <div>a</div>
                            <div>[]b</div>
                        </div>`),
                });
            });
            test("should not merge unbreakable before a p (backward)", async () => {
                await testEditor({
                    contentBefore: unformat(`
                        <div>
                            <p>a</p>
                            <div>[]b</div>
                        </div>`),
                    stepFunction: deleteBackward,
                    contentAfter: unformat(`
                        <div>
                            <p>a</p>
                            <div>[]b</div>
                        </div>`),
                });
            });
            test("should not merge unbreakable before an empty unbreakable (backward)", async () => {
                await testEditor({
                    contentBefore: unformat(`
                        <div>
                            <div><br></div>
                            <div>[]b</div>
                        </div>`),
                    stepFunction: deleteBackward,
                    contentAfter: unformat(`
                        <div>
                            <div><br></div>
                            <div>[]b</div>
                        </div>`),
                });
            });
            test("should not merge unbreakable before an empty p (backward)", async () => {
                await testEditor({
                    contentBefore: unformat(`
                        <div>
                            <p><br></p>
                            <div>[]b</div>
                        </div>`),
                    stepFunction: deleteBackward,
                    contentAfter: unformat(`
                        <div>
                            <p><br></p>
                            <div>[]b</div>
                        </div>`),
                });
            });
        });
    });
    describe("selection not collapsed", () => {
        describe("monolevel", () => {
            describe("anchor start", () => {
                test("should remove sandwitched unbreakable (anchor start, focus start) (backward)", async () => {
                    await testEditor({
                        contentBefore: unformat(`
                            <div>
                                <div>[ab</div>
                                <div>cd</div>
                                <div>ef]</div>
                            </div>`),
                        stepFunction: deleteBackward,
                        contentAfter: unformat(`
                            <div>
                                <div>[]<br></div>
                            </div>`),
                    });
                });
                test("should remove sandwitched unbreakable (anchor start, focus between) (backward)", async () => {
                    await testEditor({
                        contentBefore: unformat(`
                            <div>
                                <div>[ab</div>
                                <div>cd</div>
                                <div>e]f</div>
                            </div>`),
                        stepFunction: deleteBackward,
                        contentAfter: unformat(`
                            <div>
                                <div>[]f</div>
                            </div>`),
                    });
                });
            });

            describe("anchor between", () => {
                test("should remove sandwitched unbreakable (anchor between, focus between) (backward)", async () => {
                    await testEditor({
                        contentBefore: unformat(`
                            <div>
                                <div>a[b</div>
                                <div>cd</div>
                                <div>e]f</div>
                            </div>`),
                        stepFunction: deleteBackward,
                        contentAfter: unformat(`
                            <div>
                                <div>a[]</div>
                                <div>f</div>
                            </div>`),
                    });
                });
                test("should remove sandwitched unbreakable (anchor between, focus end) (backward)", async () => {
                    await testEditor({
                        contentBefore: unformat(`
                            <div>
                                <div>a[b</div>
                                <div>cd</div>
                                <div>ef]</div>
                            </div>`),
                        stepFunction: deleteBackward,
                        contentAfter: unformat(`
                            <div>
                                <div>a[]</div>
                            </div>`),
                    });
                });
            });
        });

        describe("multilevel", () => {
            describe("anchor start", () => {
                test("should remove sandwitched unbreakable (multilevel, anchor start, focus between) (backward)", async () => {
                    await testEditor({
                        contentBefore: unformat(`
                            <div>
                                <div>[ab</div>
                                <div>cd</div>
                                <div>ef</div>
                            </div>
                            <div>
                                <div>gh</div>
                                <div>ij</div>
                                <div>k]l</div>
                            </div>`),
                        stepFunction: deleteBackward,
                        contentAfter: unformat(`
                            <div>
                                <div>[]l</div>
                            </div>`),
                    });
                });
            });
            describe("anchor between", () => {
                test("should remove sandwitched unbreakable (multilevel, anchor between, focus between) (backward)", async () => {
                    await testEditor({
                        contentBefore: unformat(`
                            <div>
                                <div>a[b</div>
                                <div>cd</div>
                                <div>ef</div>
                            </div>
                            <div>
                                <div>gh</div>
                                <div>ij</div>
                                <div>k]l</div>
                            </div>`),
                        stepFunction: deleteBackward,
                        contentAfter: unformat(`
                            <div>
                                <div>a[]</div>
                            </div>
                            <div>
                                <div>l</div>
                            </div>`),
                    });
                });
                test("should remove sandwitched unbreakable (multilevel, anchor between, focus end) (backward)", async () => {
                    await testEditor({
                        contentBefore: unformat(`
                            <div>
                                <div>a[b</div>
                                <div>cd</div>
                                <div>ef</div>
                            </div>
                            <div>
                                <div>gh</div>
                                <div>ij</div>
                                <div>kl]</div>
                            </div>`),
                        stepFunction: (editor) => deleteBackward(editor),
                        contentAfter: unformat(`
                            <div>
                                <div>a[]</div>
                            </div>`),
                    });
                });
            });
        });

        describe("triple click", () => {
            test("should delete last character of paragraph, ignoring the selected paragraph break leading to an unbreakable (1)", async () => {
                await testEditor({
                    contentBefore: `<p>ab[c</p><p class="oe_unbreakable">]def</p>`,
                    // This type of selection (typically done with a triple
                    // click) is "corrected" before remove so triple clicking
                    // doesn't remove a paragraph break.
                    stepFunction: deleteBackward,
                    contentAfter: `<p>ab[]</p><p class="oe_unbreakable">def</p>`,
                });
            });

            test("should delete last character of paragraph, ignoring the selected paragraph break leading to an unbreakable (2)", async () => {
                await testEditor({
                    contentBefore: `<p>ab[c</p><p class="oe_unbreakable">]<br></p><p>def</p>`,
                    // This type of selection (typically done with a triple
                    // click) is "corrected" before remove so triple clicking
                    // doesn't remove a paragraph break.
                    stepFunction: deleteBackward,
                    contentAfter: `<p>ab[]</p><p class="oe_unbreakable"><br></p><p>def</p>`,
                });
            });
        });
        test("should delete first character of unbreakable, ignoring selected paragraph break (backward)", async () => {
            await testEditor({
                contentBefore: `<p>abc[</p><p class="oe_unbreakable">d]ef</p>`,
                stepFunction: deleteBackward,
                contentAfter: `<p>abc[]</p><p class="oe_unbreakable">ef</p>`,
            });
        });
    });
});
describe("forward", () => {
    describe("selection collapsed", () => {
        describe("start empty", () => {
            test("should delete empty p just before an unbreakable (forward)", async () => {
                await testEditor({
                    contentBefore: `<p>[]</p><div>a</div>`,
                    stepFunction: deleteForward,
                    contentAfter: `<div>[]a</div>`,
                });
            });
            test("should delete empty p/br just before an unbreakable (forward)", async () => {
                await testEditor({
                    contentBefore: `<p><br>[]</p><div>a</div>`,
                    stepFunction: deleteForward,
                    contentAfter: `<div>[]a</div>`,
                });
            });
            test("should delete empty unbreakables (forward)", async () => {
                await testEditor({
                    contentBefore: unformat(`
                    <div>
                        <div>[]</div>
                        <div><p>a</p></div>
                    </div>`),
                    stepFunction: deleteForward,
                    contentAfter: unformat(`
                    <div>
                        <div><p>[]a</p></div>
                    </div>`),
                });
            });
            test("should not delete an empty unbreakable when there is no elements to delete after (forward)", async () => {
                await testEditor({
                    contentBefore: unformat(`
                        <div>
                            <div>a</div>
                            <div>[]<br></div>
                        </div>`),
                    stepFunction: deleteForward,
                    contentAfter: unformat(`
                        <div>
                            <div>a</div>
                            <div>[]<br></div>
                        </div>`),
                });
            });
        });

        describe("start text", () => {
            test("should not merge p with an unbreakable (forward)", async () => {
                await testEditor({
                    contentBefore: `<p>a[]</p><div>b</div>`,
                    stepFunction: deleteForward,
                    contentAfter: `<p>a[]</p><div>b</div>`,
                });
            });
            test("should not remove unbreakable after an unbreakable (forward)", async () => {
                await testEditor({
                    contentBefore: unformat(`
                        <div>
                            <div>b[]</div>
                            <div>a</div>
                        </div>`),
                    stepFunction: deleteForward,
                    contentAfter: unformat(`
                        <div>
                            <div>b[]</div>
                            <div>a</div>
                        </div>`),
                });
            });
            test("should not merge unbreakable after a p (forward)", async () => {
                await testEditor({
                    contentBefore: unformat(`
                        <div>
                            <div>b[]</div>
                            <p>a</p>
                        </div>`),
                    stepFunction: deleteForward,
                    contentAfter: unformat(`
                        <div>
                            <div>b[]</div>
                            <p>a</p>
                        </div>`),
                });
            });
            test("should not merge unbreakable after an empty unbreakable (forward)", async () => {
                await testEditor({
                    contentBefore: unformat(`
                        <div>
                            <div>b[]</div>
                            <div><br></div>
                        </div>`),
                    stepFunction: deleteForward,
                    contentAfter: unformat(`
                        <div>
                            <div>b[]</div>
                            <div><br></div>
                        </div>`),
                });
            });
            test("should not merge unbreakable after an empty p (forward)", async () => {
                await testEditor({
                    contentBefore: unformat(`
                        <div>
                            <div>b[]</div>
                            <p><br></p>
                        </div>`),
                    stepFunction: deleteForward,
                    contentAfter: unformat(`
                        <div>
                            <div>b[]</div>
                            <p><br></p>
                        </div>`),
                });
            });
        });
    });
    // Only few tests are made with the selection not collapsed it should use the
    // same logic as for the backward (deleteRange).
    describe("selection not collapsed", () => {
        test("should not break unbreakables (delete forward) (1)", async () => {
            await testEditor({
                contentBefore: unformat(`
                        <div>
                            <div>a[bc</div>
                            <div>de]f</div>
                        </div>`),
                stepFunction: deleteForward,
                contentAfter: unformat(`
                        <div>
                            <div>a[]</div>
                            <div>f</div>
                        </div>`),
            });
        });

        test("should not break unbreakables (delete forward) (2)", async () => {
            await testEditor({
                contentBefore: unformat(`
                        <p class="oe_unbreakable">a[b</p>
                        <p class="oe_unbreakable">c]d</p>`),
                stepFunction: deleteForward,
                contentAfter: unformat(`
                        <p class="oe_unbreakable">a[]</p>
                        <p class="oe_unbreakable">d</p>`), // JW without oe_breakable classes of course
            });
        });

        describe("triple click", () => {
            test("should delete last character of paragraph, ignoring the selected paragraph break leading to an unbreakable", async () => {
                await testEditor({
                    contentBefore: "<p>ab[c</p><p>]def</p>",
                    // This type of selection (typically done with a triple
                    // click) is "corrected" before remove so triple clicking
                    // doesn't remove a paragraph break.
                    stepFunction: deleteForward,
                    contentAfter: "<p>ab[]</p><p>def</p>",
                });
            });
        });

        test("should delete first character of unbreakable, ignoring selected paragraph break (forward)", async () => {
            await testEditor({
                contentBefore: '<p>abc[</p><p class="oe_unbreakable">d]ef</p>',
                stepFunction: deleteForward,
                contentAfter: '<p>abc[]</p><p class="oe_unbreakable">ef</p>',
            });
        });
    });
});

describe("list", () => {
    describe("selection collapsed", () => {
        test("should not outdent while nested within a list item if the list is unbreakable", async () => {
            // Only one LI.
            await testEditor({
                contentBefore: '<p>abc</p><ol t="1"><li>[]def</li></ol>',
                stepFunction: deleteBackward,
                contentAfter: '<p>abc</p><ol t="1"><li>[]def</li></ol>',
            });
            // First LI.
            // await testEditor({
            //     contentBefore:
            //         '<ol><li><div><div>[]abc</div></div></li><li>def</li></ol>',
            //     stepFunction: deleteBackward,
            //     contentAfter:
            //         '<ol><li><div><div>[]abc</div></div></li><li>def</li></ol>',
            // });
            // // In the middle.
            // await testEditor({
            //     contentBefore:
            //         '<ol><li><div>abc</div></li><li><div><div>[]def</div></div></li><li>ghi</li></ol>',
            //     stepFunction: deleteBackward,
            //     contentAfter:
            //         '<ol><li><div>abc</div></li><li><div><div>[]def</div></div></li><li>ghi</li></ol>',
            // });
            // // Last LI.
            // await testEditor({
            //     contentBefore:
            //         '<ol><li>abc</li><li><div><div>[]def</div></div></li></ol>',
            //     stepFunction: deleteBackward,
            //     contentAfter:
            //         '<ol><li>abc</li><li><div><div>[]def</div></div></li></ol>',
            // });
            // // With a div before the list:
            // await testEditor({
            //     contentBefore:
            //         '<div>abc</div><ol><li>def</li><li><div><div>[]ghi</div></div></li><li>jkl</li></ol>',
            //     stepFunction: deleteBackward,
            //     contentAfter:
            //         '<div>abc</div><ol><li>def</li><li><div><div>[]ghi</div></div></li><li>jkl</li></ol>',
            // });
        });
    });
    describe("selection not collapsed", () => {
        test("shoud not merge list item in the previous unbreakable sibling (1)", async () => {
            await testEditor({
                contentBefore: unformat(`
                        <p class="oe_unbreakable">a[bc</p>
                        <ol>
                            <li>d]ef</li>
                            <li>ghi</li>
                        </ol>`),
                stepFunction: deleteBackward,
                contentAfter: unformat(`
                        <p class="oe_unbreakable">a[]</p>
                        <ol>
                            <li>ef</li>
                            <li>ghi</li>
                        </ol>`),
            });
        });

        test("shoud not merge list item in the previous unbreakable sibling (2)", async () => {
            await testEditor({
                contentBefore: unformat(`
                        <div>
                            <p>a[bc</p>
                        </div>
                        <ol>
                            <li>d]ef</li>
                            <li>ghi</li>
                        </ol>`),
                stepFunction: deleteBackward,
                contentAfter: unformat(`
                        <div>
                            <p>a[]</p>
                        </div>
                        <ol>
                            <li>ef</li>
                            <li>ghi</li>
                        </ol>`),
            });
        });

        describe("empty list items, starting and ending with links", () => {
            // Since we introduce \ufeff characters in and around links, we
            // can enter situations where the links aren't technically fully
            // selected but should be treated as if they were. These tests
            // are there to ensure that is the case. They represent four
            // variations of the same situation, and have the same expected
            // result.
            const tests = [
                // (1) <a>[...</a>...<a>...]</a>
                '<ul><li>ab</li><li><a href="#">[cd</a></li><li>ef</li><li><a href="#a">gh]</a></li><li>ij</li></ul>',
                '<ul><li>ab</li><li><a href="#">[\ufeffcd</a></li><li>ef</li><li><a href="#a">gh\ufeff]</a></li><li>ij</li></ul>',
                '<ul><li>ab</li><li><a href="#">\ufeff[cd</a></li><li>ef</li><li><a href="#a">gh\ufeff]</a></li><li>ij</li></ul>',
                '<ul><li>ab</li><li><a href="#">[\ufeffcd</a></li><li>ef</li><li><a href="#a">gh]\ufeff</a></li><li>ij</li></ul>',
                '<ul><li>ab</li><li><a href="#">\ufeff[cd</a></li><li>ef</li><li><a href="#a">gh]\ufeff</a></li><li>ij</li></ul>',
                // (2) [<a>...</a>...<a>...]</a>
                '<ul><li>ab</li><li>[<a href="#">cd</a></li><li>ef</li><li><a href="#a">gh]</a></li><li>ij</li></ul>',
                '<ul><li>ab</li><li>[\ufeff<a href="#">cd</a></li><li>ef</li><li><a href="#a">gh\ufeff]</a></li><li>ij</li></ul>',
                '<ul><li>ab</li><li>\ufeff[<a href="#">cd</a></li><li>ef</li><li><a href="#a">gh\ufeff]</a></li><li>ij</li></ul>',
                '<ul><li>ab</li><li>[\ufeff<a href="#">cd</a></li><li>ef</li><li><a href="#a">gh]\ufeff</a></li><li>ij</li></ul>',
                '<ul><li>ab</li><li>\ufeff[<a href="#">cd</a></li><li>ef</li><li><a href="#a">gh]\ufeff</a></li><li>ij</li></ul>',
                // (3) <a>[...</a>...<a>...</a>]
                '<ul><li>ab</li><li><a href="#">[cd</a></li><li>ef</li><li><a href="#a">gh</a>]</li><li>ij</li></ul>',
                '<ul><li>ab</li><li><a href="#">[\ufeffcd</a></li><li>ef</li><li><a href="#a">gh</a>\ufeff]</li><li>ij</li></ul>',
                '<ul><li>ab</li><li><a href="#">\ufeff[cd</a></li><li>ef</li><li><a href="#a">gh</a>\ufeff]</li><li>ij</li></ul>',
                '<ul><li>ab</li><li><a href="#">[\ufeffcd</a></li><li>ef</li><li><a href="#a">gh</a>]\ufeff</li><li>ij</li></ul>',
                '<ul><li>ab</li><li><a href="#">\ufeff[cd</a></li><li>ef</li><li><a href="#a">gh</a>]\ufeff</li><li>ij</li></ul>',
                // (4) [<a>...</a>...<a>...</a>]
                '<ul><li>ab</li><li>[<a href="#">cd</a></li><li>ef</li><li><a href="#a">gh</a>]</li><li>ij</li></ul>',
                '<ul><li>ab</li><li>[\ufeff<a href="#">cd</a></li><li>ef</li><li><a href="#a">gh</a>\ufeff]</li><li>ij</li></ul>',
                '<ul><li>ab</li><li>\ufeff[<a href="#">cd</a></li><li>ef</li><li><a href="#a">gh</a>\ufeff]</li><li>ij</li></ul>',
                '<ul><li>ab</li><li>[\ufeff<a href="#">cd</a></li><li>ef</li><li><a href="#a">gh</a>]\ufeff</li><li>ij</li></ul>',
                '<ul><li>ab</li><li>\ufeff[<a href="#">cd</a></li><li>ef</li><li><a href="#a">gh</a>]\ufeff</li><li>ij</li></ul>',
            ];
            let testIndex = 1;
            for (const contentBefore of tests) {
                test.todo(
                    `should empty list items, starting and ending with links (${testIndex})`,
                    async () => {
                        await testEditor({
                            contentBefore,
                            stepFunction: deleteBackward,
                            contentAfterEdit:
                                '<ul><li>ab</li><li placeholder="List" class="oe-hint">[]<br></li><li>ij</li></ul>',
                            contentAfter: "<ul><li>ab</li><li>[]<br></li><li>ij</li></ul>",
                        });
                    }
                );
                testIndex += 1;
            }
        });
    });
});
