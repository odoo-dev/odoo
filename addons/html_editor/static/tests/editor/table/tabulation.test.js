import { describe, test } from "@odoo/hoot";
import { press } from "@odoo/hoot-dom";
import { testEditor } from "../../test_helpers/editor";
import { unformat } from "../../test_helpers/format";

describe("move selection with tab/shift+tab", () => {
    describe("tab", () => {
        test("should move cursor to next cell and select its content", async () => {
            await testEditor({
                contentBefore: unformat(`
                    <table>
                        <tbody>
                            <tr>
                                <td>[]ab</td>
                                <td>cd</td>
                                <td>ef</td>
                            </tr>
                        </tbody>
                    </table>
                `),
                stepFunction: async () => press("Tab"),
                contentAfter: unformat(`
                    <table>
                        <tbody>
                            <tr>
                                <td>ab</td>
                                <td>[cd]</td>
                                <td>ef</td>
                            </tr>
                        </tbody>
                    </table>
                `),
            });
        });
        test.tags("iframe")(
            "should move cursor to next cell and select its content in an iframe",
            async () => {
                await testEditor({
                    inIFrame: true,
                    contentBefore: unformat(`
                    <table>
                        <tbody>
                            <tr>
                                <td>[]ab</td>
                                <td>cd</td>
                                <td>ef</td>
                            </tr>
                        </tbody>
                    </table>
                `),
                    stepFunction: async () => press("Tab"),
                    contentAfter: unformat(`
                    <table>
                        <tbody>
                            <tr>
                                <td>ab</td>
                                <td>[cd]</td>
                                <td>ef</td>
                            </tr>
                        </tbody>
                    </table>
                `),
                });
            }
        );
        test("should move cursor to next cell in the row below and select its content", async () => {
            await testEditor({
                contentBefore: unformat(`
                    <table>
                        <tbody>
                            <tr>
                                <td>ab</td>
                                <td>[cd]</td>
                            </tr>
                            <tr>
                                <td>ef</td>
                                <td>gh</td>
                            </tr>
                        </tbody>
                    </table>
                `),
                stepFunction: async () => press("Tab"),
                contentAfter: unformat(`
                    <table>
                        <tbody>
                            <tr>
                                <td>ab</td>
                                <td>cd</td>
                            </tr>
                            <tr>
                                <td>[ef]</td>
                                <td>gh</td>
                            </tr>
                        </tbody>
                    </table>
                `),
            });
        });
    });
    describe("shift+tab", () => {
        test("should move cursor to previous cell and select its content", async () => {
            await testEditor({
                contentBefore: unformat(`
                    <table>
                        <tbody>
                            <tr>
                                <td>ab</td>
                                <td>[]cd</td>
                                <td>ef</td>
                            </tr>
                        </tbody>
                    </table>
                `),
                stepFunction: async () => press(["Shift", "Tab"]),
                contentAfter: unformat(`
                    <table>
                        <tbody>
                            <tr>
                                <td>[ab]</td>
                                <td>cd</td>
                                <td>ef</td>
                            </tr>
                        </tbody>
                    </table>
                `),
            });
        });
        test("should move cursor to previous cell in the row above and select its content", async () => {
            await testEditor({
                contentBefore: unformat(`
                    <table>
                        <tbody>
                            <tr>
                                <td>ab</td>
                                <td>cd</td>
                            </tr>
                            <tr>
                                <td>[ef]</td>
                                <td>gh</td>
                            </tr>
                        </tbody>
                    </table>
                `),
                stepFunction: async () => press(["Shift", "Tab"]),
                contentAfter: unformat(`
                    <table>
                        <tbody>
                            <tr>
                                <td>ab</td>
                                <td>[cd]</td>
                            </tr>
                            <tr>
                                <td>ef</td>
                                <td>gh</td>
                            </tr>
                        </tbody>
                    </table>
                `),
            });
        });
        test("should not cursor if there is not previous cell", async () => {
            await testEditor({
                contentBefore: unformat(`
                    <table>
                        <tbody>
                            <tr>
                                <td>[ab]</td>
                                <td>cd</td>
                                <td>ef</td>
                            </tr>
                        </tbody>
                    </table>
                `),
                stepFunction: async () => press(["Shift", "Tab"]),
                contentAfter: unformat(`
                    <table>
                        <tbody>
                            <tr>
                                <td>[ab]</td>
                                <td>cd</td>
                                <td>ef</td>
                            </tr>
                        </tbody>
                    </table>
                `),
            });
        });
    });
});
