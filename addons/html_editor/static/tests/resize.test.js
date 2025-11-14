import { describe, expect, manuallyDispatchProgrammaticEvent, test } from "@odoo/hoot";
import { unformat } from "./_helpers/format";
import { getContent } from "./_helpers/selection";
import { animationFrame } from "@odoo/hoot-mock";
import { setupEditor } from "./_helpers/editor";

describe("table resize", () => {
    describe("row", () => {
        test.tags("desktop");
        test("expand first row by dragging its bottom edge downward", async () => {
            const { el } = await setupEditor(
                unformat(`
                    <table class="table table-bordered o_table">
                        <tbody>
                            <tr><td><p><br></p></td></tr>
                            <tr><td><p><br></p></td></tr>
                            <tr><td><p><br></p></td></tr>
                        </tbody>
                    </table>
                `)
            );

            const targetRow = el.querySelector("table tbody tr");
            const targetRect = targetRow.getBoundingClientRect();

            const startX = targetRect.left + targetRect.width / 2;
            const startY = targetRect.bottom;

            const heightBefore = targetRect.height;
            const dragDelta = heightBefore / 2;

            // Hover bottom edge
            manuallyDispatchProgrammaticEvent(targetRow, "mousemove", {
                clientX: startX,
                clientY: startY,
            });
            await animationFrame();

            // Start resize
            manuallyDispatchProgrammaticEvent(targetRow, "mousedown", {
                clientX: startX,
                clientY: startY,
            });
            await animationFrame();

            // Drag downward
            manuallyDispatchProgrammaticEvent(targetRow, "mousemove", {
                clientX: startX,
                clientY: startY + dragDelta,
            });
            await animationFrame();

            // End resize
            manuallyDispatchProgrammaticEvent(targetRow, "mouseup", {
                clientX: startX,
                clientY: startY + dragDelta,
            });
            await animationFrame();

            // Height should be updated inline after resize.
            expect(targetRow.style.height).toBe(`${Math.round(heightBefore + dragDelta)}px`);
        });

        test.tags("desktop");
        test("shrink first row by dragging its top edge downward", async () => {
            const { el } = await setupEditor(
                unformat(`
                    <table class="table table-bordered o_table">
                        <tbody>
                            <tr style="height: 100px">
                                <td><p><br></p></td>
                            </tr>
                            <tr style="height: 100px">
                                <td><p><br></p></td>
                            </tr>
                            <tr style="height: 100px">
                                <td><p><br></p></td>
                            </tr>
                        </tbody>
                    </table>
                `)
            );

            const targetRow = el.querySelectorAll("table tbody tr")[0];
            const targetRect = targetRow.getBoundingClientRect();

            const startX = targetRect.left + targetRect.width / 2;
            const startY = targetRect.top;

            const heightBefore = targetRect.height;
            const dragDelta = heightBefore / 2;

            // Hover top edge
            manuallyDispatchProgrammaticEvent(targetRow, "mousemove", {
                clientX: startX,
                clientY: startY,
            });
            await animationFrame();

            // Start resize
            manuallyDispatchProgrammaticEvent(targetRow, "mousedown", {
                clientX: startX,
                clientY: startY,
            });
            await animationFrame();

            // Drag downward (shrinking from top edge)
            manuallyDispatchProgrammaticEvent(targetRow, "mousemove", {
                clientX: startX,
                clientY: startY + dragDelta,
            });
            await animationFrame();

            // End resize
            manuallyDispatchProgrammaticEvent(targetRow, "mouseup", {
                clientX: startX,
                clientY: startY + dragDelta,
            });
            await animationFrame();

            // Validate final DOM state (margin shift + height change).
            expect(getContent(el)).toBe(
                unformat(`
                    <p data-selection-placeholder="" style="margin: 25px 0px -26px;"><br></p>
                    <table class="table table-bordered o_table" style="margin-top: 50px !important;">
                        <tbody>
                            <tr style="height: 50px;">
                                <td><p><br></p></td>
                            </tr>
                            <tr style="height: 100px">
                                <td><p><br></p></td>
                            </tr>
                            <tr style="height: 100px">
                                <td><p><br></p></td>
                            </tr>
                        </tbody>
                    </table>
                    <p data-selection-placeholder="" style="margin: -9px 0px 8px;"><br></p>
                `)
            );
        });

        test.tags("desktop");
        test("shrink last row by dragging bottom edge upward", async () => {
            const { el } = await setupEditor(
                unformat(`
                    <table class="table table-bordered o_table">
                        <tbody>
                            <tr style="height: 100px">
                                <td><p><br></p></td>
                            </tr>
                            <tr style="height: 100px">
                                <td><p><br></p></td>
                            </tr>
                            <tr style="height: 100px">
                                <td><p><br></p></td>
                            </tr>
                        </tbody>
                    </table>
                `)
            );

            const tbody = el.querySelector("table tbody");
            const targetRow = tbody.lastChild;

            const targetRect = targetRow.getBoundingClientRect();
            const startX = targetRect.left + targetRect.width / 2;
            const startY = targetRect.bottom;

            const heightBefore = targetRect.height;
            const dragDelta = heightBefore / 2;

            // Hover bottom edge
            manuallyDispatchProgrammaticEvent(targetRow, "mousemove", {
                clientX: startX,
                clientY: startY,
            });
            await animationFrame();

            // Start resize
            manuallyDispatchProgrammaticEvent(targetRow, "mousedown", {
                clientX: startX,
                clientY: startY,
            });
            await animationFrame();

            // Drag upward
            manuallyDispatchProgrammaticEvent(targetRow, "mousemove", {
                clientX: startX,
                clientY: startY - dragDelta,
            });
            await animationFrame();

            // End resize
            manuallyDispatchProgrammaticEvent(targetRow, "mouseup", {
                clientX: startX,
                clientY: startY - dragDelta,
            });
            await animationFrame();

            const heightAfter = targetRow.getBoundingClientRect().height;

            // Last row must shrink.
            expect(heightAfter).toBeLessThan(heightBefore);

            expect(getContent(el)).toBe(
                unformat(`
                    <p data-selection-placeholder=""><br></p>
                    <table class="table table-bordered o_table">
                        <tbody>
                            <tr style="height: 100px">
                                <td><p><br></p></td>
                            </tr>
                            <tr style="height: 100px">
                                <td><p><br></p></td>
                            </tr>
                            <tr style="height: 50px;">
                                <td><p><br></p></td>
                            </tr>
                        </tbody>
                    </table>
                    <p data-selection-placeholder="" style="margin: -9px 0px 8px;"><br></p>
                `)
            );
        });
    });

    describe("column", () => {
        test.tags("desktop");
        test("expand table first column by dragging right edge outward & table width remains unchanged", async () => {
            const { el } = await setupEditor(
                unformat(`
                    <table class="table table-bordered o_table" style="width: 1200px;">
                        <tbody>
                            <tr>
                                <td style="width: 600px;"><p><br></p></td>
                                <td style="width: 600px;"><p><br></p></td>
                            </tr>
                            <tr>
                                <td style="width: 600px;"><p><br></p></td>
                                <td style="width: 600px;"><p><br></p></td>
                            </tr>
                        </tbody>
                    </table>
                `)
            );

            const table = el.querySelector("table");
            const targetCell = table.querySelectorAll("tr")[1].firstChild;

            const targetRect = targetCell.getBoundingClientRect();
            const startX = targetRect.right;
            const startY = targetRect.top + targetRect.height / 2;

            const cellWidthBefore = targetRect.width;
            const tableWidthBefore = table.offsetWidth;
            const dragDelta = cellWidthBefore / 2;

            // Hover right edge
            manuallyDispatchProgrammaticEvent(targetCell, "mousemove", {
                clientX: startX,
                clientY: startY,
            });
            await animationFrame();

            // Start resize
            manuallyDispatchProgrammaticEvent(targetCell, "mousedown", {
                clientX: startX,
                clientY: startY,
            });
            await animationFrame();

            // Drag outward
            manuallyDispatchProgrammaticEvent(targetCell, "mousemove", {
                clientX: startX + dragDelta,
                clientY: startY,
            });
            await animationFrame();

            // End resize
            manuallyDispatchProgrammaticEvent(targetCell, "mouseup", {
                clientX: startX + dragDelta,
                clientY: startY,
            });
            await animationFrame();

            const cellWidthAfter = targetCell.getBoundingClientRect().width;
            const tableWidthAfter = table.offsetWidth;

            expect(cellWidthAfter).toBeGreaterThan(cellWidthBefore);
            expect(tableWidthAfter).toEqual(tableWidthBefore);

            expect(getContent(el)).toBe(
                unformat(`
                    <p data-selection-placeholder=""><br></p>
                    <table class="table table-bordered o_table" style="width: 1200px;">
                        <tbody>
                            <tr>
                                <td style="width: 900px;"><p><br></p></td>
                                <td style="width: 300px;"><p><br></p></td>
                            </tr>
                            <tr>
                                <td style="width: 600px;"><p><br></p></td>
                                <td style="width: 600px;"><p><br></p></td>
                            </tr>
                        </tbody>
                    </table>
                    <p data-selection-placeholder="" style="margin: -9px 0px 8px;"><br></p>
                `)
            );
        });

        test.tags("desktop");
        test("shrink table first column by dragging left edge inward & table width decreases", async () => {
            const { el } = await setupEditor(
                unformat(`
                    <table class="table table-bordered o_table" style="width: 1200px;">
                        <tbody>
                            <tr>
                                <td style="width: 600px;"><p><br></p></td>
                                <td style="width: 600px;"><p><br></p></td>
                            </tr>
                            <tr>
                                <td style="width: 600px;"><p><br></p></td>
                                <td style="width: 600px;"><p><br></p></td>
                            </tr>
                        </tbody>
                    </table>
                `)
            );

            const table = el.querySelector("table");
            const targetCell = table.querySelectorAll("tr")[1].firstChild;

            const targetRect = targetCell.getBoundingClientRect();
            const startX = targetRect.left - 1;
            const startY = targetRect.top + targetRect.height / 2;

            const cellWidthBefore = targetRect.width;
            const tableWidthBefore = table.offsetWidth;
            const dragDelta = cellWidthBefore / 2;

            // Hover left edge
            manuallyDispatchProgrammaticEvent(targetCell, "mousemove", {
                clientX: startX,
                clientY: startY,
            });
            await animationFrame();

            // Start resize
            manuallyDispatchProgrammaticEvent(targetCell, "mousedown", {
                clientX: startX,
                clientY: startY,
            });
            await animationFrame();

            // Drag inward
            manuallyDispatchProgrammaticEvent(targetCell, "mousemove", {
                clientX: startX + dragDelta,
                clientY: startY,
            });
            await animationFrame();

            // End resize
            manuallyDispatchProgrammaticEvent(targetCell, "mouseup", {
                clientX: startX + dragDelta,
                clientY: startY,
            });
            await animationFrame();

            const cellWidthAfter = targetCell.getBoundingClientRect().width;
            const tableWidthAfter = table.offsetWidth;

            expect(cellWidthAfter).toBeLessThan(cellWidthBefore);
            expect(tableWidthAfter).toBeLessThan(tableWidthBefore);

            expect(getContent(el)).toBe(
                unformat(`
                    <p data-selection-placeholder=""><br></p>
                    <table class="table table-bordered o_table" style="width: 900px; margin-left: 300px !important;">
                        <tbody>
                            <tr>
                                <td style="width: 300px;"><p><br></p></td>
                                <td style="width: 600px;"><p><br></p></td>
                            </tr>
                            <tr>
                                <td style="width: 600px;"><p><br></p></td>
                                <td style="width: 600px;"><p><br></p></td>
                            </tr>
                        </tbody>
                    </table>
                    <p data-selection-placeholder="" style="margin: -9px 0px 8px;"><br></p>
                `)
            );
        });

        test.tags("desktop");
        test("expand table last column by dragging right edge outward & table width increases", async () => {
            const { el } = await setupEditor(
                unformat(`
                    <table class="table table-bordered o_table" style="width: 1200px;">
                        <tbody>
                            <tr>
                                <td style="width: 600px;"><p><br></p></td>
                                <td style="width: 600px;"><p><br></p></td>
                            </tr>
                            <tr>
                                <td style="width: 600px;"><p><br></p></td>
                                <td style="width: 600px;"><p><br></p></td>
                            </tr>
                        </tbody>
                    </table>
                `)
            );

            const table = el.querySelector("table");
            const targetCell = table.querySelectorAll("tr")[1].lastChild;

            const targetRect = targetCell.getBoundingClientRect();
            const startX = targetRect.right + 1; // Avoid border/subpixel ambiguity on the resize edge.
            const startY = targetRect.top + targetRect.height / 2;

            const cellWidthBefore = targetRect.width;
            const tableWidthBefore = table.offsetWidth;
            const dragDelta = cellWidthBefore / 2;

            // Hover right edge
            manuallyDispatchProgrammaticEvent(targetCell, "mousemove", {
                clientX: startX,
                clientY: startY,
            });
            await animationFrame();

            // Start resize
            manuallyDispatchProgrammaticEvent(targetCell, "mousedown", {
                clientX: startX,
                clientY: startY,
            });
            await animationFrame();

            // Drag outward
            manuallyDispatchProgrammaticEvent(targetCell, "mousemove", {
                clientX: startX + dragDelta,
                clientY: startY,
            });
            await animationFrame();

            // End resize
            manuallyDispatchProgrammaticEvent(targetCell, "mouseup", {
                clientX: startX + dragDelta,
                clientY: startY,
            });
            await animationFrame();

            const cellWidthAfter = targetCell.getBoundingClientRect().width;
            const tableWidthAfter = table.offsetWidth;

            expect(cellWidthAfter).toBeGreaterThan(cellWidthBefore);
            expect(tableWidthAfter).toBeGreaterThan(tableWidthBefore);

            expect(getContent(el)).toBe(
                unformat(`
                    <p data-selection-placeholder=""><br></p>
                    <table class="table table-bordered o_table" style="width: 1500px;">
                        <tbody>
                            <tr>
                                <td style="width: 600px;"><p><br></p></td>
                                <td style="width: 900px;"><p><br></p></td>
                            </tr>
                            <tr>
                                <td style="width: 600px;"><p><br></p></td>
                                <td style="width: 600px;"><p><br></p></td>
                            </tr>
                        </tbody>
                    </table>
                    <p data-selection-placeholder="" style="margin: -9px 0px 8px;"><br></p>
                `)
            );
        });

        test.tags("desktop");
        test("shrink table last column by dragging right edge inward & table width decreases", async () => {
            const { el } = await setupEditor(
                unformat(`
                    <table class="table table-bordered o_table">
                        <tbody>
                            <tr>
                                <td><p><br></p></td>
                                <td><p><br></p></td>
                            </tr>
                            <tr>
                                <td><p><br></p></td>
                                <td><p><br></p></td>
                            </tr>
                        </tbody>
                    </table>
                `)
            );

            const table = el.querySelector("table");
            const targetRow = table.querySelectorAll("tr")[0];
            const targetCell = targetRow.lastChild;

            const targetRect = targetCell.getBoundingClientRect();
            const startX = targetRect.right + 1; // Avoid border/subpixel ambiguity.
            const startY = targetRect.top + targetRect.height / 2;

            const cellWidthBefore = targetRect.width;
            const tableWidthBefore = table.offsetWidth;
            const dragDelta = cellWidthBefore / 2;

            // Hover right edge
            manuallyDispatchProgrammaticEvent(targetCell, "mousemove", {
                clientX: startX,
                clientY: startY,
            });
            await animationFrame();

            // Start resize
            manuallyDispatchProgrammaticEvent(targetCell, "mousedown", {
                clientX: startX,
                clientY: startY,
            });
            await animationFrame();

            // Drag inward
            manuallyDispatchProgrammaticEvent(targetCell, "mousemove", {
                clientX: startX - dragDelta,
                clientY: startY,
            });
            await animationFrame();

            // End resize
            manuallyDispatchProgrammaticEvent(targetCell, "mouseup", {
                clientX: startX - dragDelta,
                clientY: startY,
            });
            await animationFrame();

            expect(targetCell.style.width).toBe(`${Math.round(cellWidthBefore - dragDelta)}px`);
            expect(table.style.width).toBe(`${Math.round(tableWidthBefore - dragDelta)}px`);
        });
    });
});

describe("column resize", () => {
    test.tags("desktop");
    test("expand first column by dragging its right edge outward & row width remains unchanged", async () => {
        const { el } = await setupEditor(
            unformat(`
                <div class="container o_text_columns o-contenteditable-false" contenteditable="false">
                    <div class="row" style="width: 1600px;">
                        <div class="col-4 o-contenteditable-true" contenteditable="true" style="width: 400px;">
                            <p o-we-hint-text="Empty column" class="o-we-hint">[]</p>
                        </div>
                        <div class="col-4 o-contenteditable-true" contenteditable="true" style="width: 400px;">
                            <p o-we-hint-text="Empty column" class="o-we-hint"><br></p>
                        </div>
                        <div class="col-4 o-contenteditable-true" contenteditable="true" style="width: 400px;">
                            <p o-we-hint-text="Empty column" class="o-we-hint"><br></p>
                        </div>
                        <div class="col-4 o-contenteditable-true" contenteditable="true" style="width: 400px;">
                            <p o-we-hint-text="Empty column" class="o-we-hint"><br></p>
                        </div>
                    </div>
                </div>
            `)
        );

        const row = el.querySelector(".o_text_columns .row");
        const targetColumn = row.firstChild;

        const targetRect = targetColumn.getBoundingClientRect();
        const startX = targetRect.right; // Right edge of the first column
        const startY = targetRect.top + targetRect.height / 2;

        const columnWidthBefore = targetRect.width;
        const rowWidthBefore = row.offsetWidth;
        const dragDelta = columnWidthBefore / 4;

        // Hover right edge
        manuallyDispatchProgrammaticEvent(targetColumn, "mousemove", {
            clientX: startX,
            clientY: startY,
        });
        await animationFrame();

        expect(targetColumn).toHaveClass("o_resize_handle");

        // Start resize
        manuallyDispatchProgrammaticEvent(targetColumn, "mousedown", {
            clientX: startX,
            clientY: startY,
        });
        await animationFrame();

        // Drag outward
        manuallyDispatchProgrammaticEvent(targetColumn, "mousemove", {
            clientX: startX + dragDelta,
            clientY: startY,
        });
        await animationFrame();

        // End resize
        manuallyDispatchProgrammaticEvent(targetColumn, "mouseup", {
            clientX: startX + dragDelta,
            clientY: startY,
        });
        await animationFrame();

        const columnWidthAfter = targetColumn.getBoundingClientRect().width;
        const rowWidthAfter = row.offsetWidth;

        expect(columnWidthAfter).toBeGreaterThan(columnWidthBefore);
        expect(rowWidthAfter).toEqual(rowWidthBefore);

        expect(getContent(el)).toBe(
            unformat(`
                <p data-selection-placeholder=""><br></p>
                <div class="container o_text_columns o-contenteditable-false" contenteditable="false">
                    <div class="row" style="width: 1600px;">
                        <div class="col-4 o-contenteditable-true o_resize_handle" contenteditable="true" style="width: 500px;">
                            <p o-we-hint-text="Empty column" class="o-we-hint">[]</p>
                        </div>
                        <div class="col-4 o-contenteditable-true" contenteditable="true" style="width: 300px;">
                            <p o-we-hint-text="Empty column" class="o-we-hint"><br></p>
                        </div>
                        <div class="col-4 o-contenteditable-true" contenteditable="true" style="width: 400px;">
                            <p o-we-hint-text="Empty column" class="o-we-hint"><br></p>
                        </div>
                        <div class="col-4 o-contenteditable-true" contenteditable="true" style="width: 400px;">
                            <p o-we-hint-text="Empty column" class="o-we-hint"><br></p>
                        </div>
                    </div>
                </div>
                <p data-selection-placeholder=""><br></p>
            `)
        );
    });

    test.tags("desktop");
    test("shrink first column by dragging its left edge inward & row width decreases", async () => {
        const { el } = await setupEditor(
            unformat(`
                <div class="container o_text_columns o-contenteditable-false" contenteditable="false">
                    <div class="row" style="width: 1600px;">
                        <div class="col-4 o-contenteditable-true" contenteditable="true" style="width: 400px;">
                            <p o-we-hint-text="Empty column" class="o-we-hint">[]</p>
                        </div>
                        <div class="col-4 o-contenteditable-true" contenteditable="true" style="width: 400px;">
                            <p o-we-hint-text="Empty column" class="o-we-hint"><br></p>
                        </div>
                        <div class="col-4 o-contenteditable-true" contenteditable="true" style="width: 400px;">
                            <p o-we-hint-text="Empty column" class="o-we-hint"><br></p>
                        </div>
                        <div class="col-4 o-contenteditable-true" contenteditable="true" style="width: 400px;">
                            <p o-we-hint-text="Empty column" class="o-we-hint"><br></p>
                        </div>
                    </div>
                </div>
            `)
        );

        const row = el.querySelector(".o_text_columns .row");
        const targetColumn = row.firstChild;

        const targetRect = targetColumn.getBoundingClientRect();
        const startX = targetRect.left; // Left edge of the first column
        const startY = targetRect.top + targetRect.height / 2;

        const columnWidthBefore = targetRect.width;
        const rowWidthBefore = row.offsetWidth;
        const dragDelta = columnWidthBefore / 4;

        // Hover left edge
        manuallyDispatchProgrammaticEvent(targetColumn, "mousemove", {
            clientX: startX,
            clientY: startY,
        });
        await animationFrame();

        expect(targetColumn).toHaveClass("o_resize_handle");

        // Start resize
        manuallyDispatchProgrammaticEvent(targetColumn, "mousedown", {
            clientX: startX,
            clientY: startY,
        });
        await animationFrame();

        // Drag inward
        manuallyDispatchProgrammaticEvent(targetColumn, "mousemove", {
            clientX: startX + dragDelta,
            clientY: startY,
        });
        await animationFrame();

        // End resize
        manuallyDispatchProgrammaticEvent(targetColumn, "mouseup", {
            clientX: startX + dragDelta,
            clientY: startY,
        });
        await animationFrame();

        const columnWidthAfter = targetColumn.getBoundingClientRect().width;
        const rowWidthAfter = row.offsetWidth;

        expect(columnWidthAfter).toBeLessThan(columnWidthBefore);
        expect(rowWidthAfter).toBeLessThan(rowWidthBefore);

        expect(getContent(el)).toBe(
            unformat(`
                <p data-selection-placeholder=""><br></p>
                <div class="container o_text_columns o-contenteditable-false" contenteditable="false">
                    <div class="row" style="width: 1500px; margin-left: 100px !important;">
                        <div class="col-4 o-contenteditable-true o_resize_handle" contenteditable="true" style="width: 300px;">
                            <p o-we-hint-text="Empty column" class="o-we-hint">[]</p>
                        </div>
                        <div class="col-4 o-contenteditable-true" contenteditable="true" style="width: 400px;">
                            <p o-we-hint-text="Empty column" class="o-we-hint"><br></p>
                        </div>
                        <div class="col-4 o-contenteditable-true" contenteditable="true" style="width: 400px;">
                            <p o-we-hint-text="Empty column" class="o-we-hint"><br></p>
                        </div>
                        <div class="col-4 o-contenteditable-true" contenteditable="true" style="width: 400px;">
                            <p o-we-hint-text="Empty column" class="o-we-hint"><br></p>
                        </div>
                    </div>
                </div>
                <p data-selection-placeholder=""><br></p>
            `)
        );
    });

    test.tags("desktop");
    test("expand last column by dragging its right edge outward & row width increases", async () => {
        const { el } = await setupEditor(
            unformat(`
                <div class="container o_text_columns o-contenteditable-false" contenteditable="false">
                    <div class="row" style="width: 1600px;">
                        <div class="col-4 o-contenteditable-true" contenteditable="true" style="width: 400px;">
                            <p o-we-hint-text="Empty column" class="o-we-hint">[]</p>
                        </div>
                        <div class="col-4 o-contenteditable-true" contenteditable="true" style="width: 400px;">
                            <p o-we-hint-text="Empty column" class="o-we-hint"><br></p>
                        </div>
                        <div class="col-4 o-contenteditable-true" contenteditable="true" style="width: 400px;">
                            <p o-we-hint-text="Empty column" class="o-we-hint"><br></p>
                        </div>
                        <div class="col-4 o-contenteditable-true" contenteditable="true" style="width: 400px;">
                            <p o-we-hint-text="Empty column" class="o-we-hint"><br></p>
                        </div>
                    </div>
                </div>
            `)
        );

        const row = el.querySelector(".o_text_columns .row");
        const targetColumn = row.lastChild;

        const targetRect = targetColumn.getBoundingClientRect();
        const startX = targetRect.right; // Right edge of the last column
        const startY = targetRect.top + targetRect.height / 2;

        const columnWidthBefore = targetRect.width;
        const rowWidthBefore = row.offsetWidth;
        const dragDelta = columnWidthBefore / 4;

        // Hover right edge
        manuallyDispatchProgrammaticEvent(targetColumn, "mousemove", {
            clientX: startX,
            clientY: startY,
        });
        await animationFrame();

        expect(targetColumn).toHaveClass("o_resize_handle");

        // Start resize
        manuallyDispatchProgrammaticEvent(targetColumn, "mousedown", {
            clientX: startX,
            clientY: startY,
        });
        await animationFrame();

        // Drag outward
        manuallyDispatchProgrammaticEvent(targetColumn, "mousemove", {
            clientX: startX + dragDelta,
            clientY: startY,
        });
        await animationFrame();

        // End resize
        manuallyDispatchProgrammaticEvent(targetColumn, "mouseup", {
            clientX: startX + dragDelta,
            clientY: startY,
        });
        await animationFrame();

        const columnWidthAfter = targetColumn.getBoundingClientRect().width;
        const rowWidthAfter = row.offsetWidth;

        expect(columnWidthAfter).toBeGreaterThan(columnWidthBefore);
        expect(rowWidthAfter).toBeGreaterThan(rowWidthBefore);

        expect(getContent(el)).toBe(
            unformat(`
                <p data-selection-placeholder=""><br></p>
                <div class="container o_text_columns o-contenteditable-false" contenteditable="false">
                    <div class="row" style="width: 1700px;">
                        <div class="col-4 o-contenteditable-true" contenteditable="true" style="width: 400px;">
                            <p o-we-hint-text="Empty column" class="o-we-hint">[]</p>
                        </div>
                        <div class="col-4 o-contenteditable-true" contenteditable="true" style="width: 400px;">
                            <p o-we-hint-text="Empty column" class="o-we-hint"><br></p>
                        </div>
                        <div class="col-4 o-contenteditable-true" contenteditable="true" style="width: 400px;">
                            <p o-we-hint-text="Empty column" class="o-we-hint"><br></p>
                        </div>
                        <div class="col-4 o-contenteditable-true o_resize_handle" contenteditable="true" style="width: 500px;">
                            <p o-we-hint-text="Empty column" class="o-we-hint"><br></p>
                        </div>
                    </div>
                </div>
                <p data-selection-placeholder=""><br></p>
            `)
        );
    });

    test.tags("desktop");
    test("sets widths when shrinking last column by dragging its right edge inward (no initial widths)", async () => {
        const { el } = await setupEditor(
            unformat(`
                <div class="container o_text_columns o-contenteditable-false" contenteditable="false">
                    <div class="row">
                        <div class="col-4 o-contenteditable-true" contenteditable="true">
                            <p o-we-hint-text="Empty column" class="o-we-hint">[]</p>
                        </div>
                        <div class="col-4 o-contenteditable-true" contenteditable="true">
                            <p o-we-hint-text="Empty column" class="o-we-hint"><br></p>
                        </div>
                        <div class="col-4 o-contenteditable-true" contenteditable="true">
                            <p o-we-hint-text="Empty column" class="o-we-hint"><br></p>
                        </div>
                        <div class="col-4 o-contenteditable-true" contenteditable="true">
                            <p o-we-hint-text="Empty column" class="o-we-hint"><br></p>
                        </div>
                    </div>
                </div>
            `)
        );

        const row = el.querySelector(".o_text_columns .row");
        const targetColumn = row.lastChild;

        const targetRect = targetColumn.getBoundingClientRect();
        const startX = targetRect.right + 1; // Avoid border/subpixel ambiguity on the resize edge.
        const startY = targetRect.top + targetRect.height / 2;

        const columnWidthBefore = targetRect.width;
        const rowWidthBefore = row.offsetWidth;
        const dragDelta = columnWidthBefore / 4;

        // Hover right edge
        manuallyDispatchProgrammaticEvent(targetColumn, "mousemove", {
            clientX: startX,
            clientY: startY,
        });
        await animationFrame();

        expect(targetColumn).toHaveClass("o_resize_handle");

        // Start resize
        manuallyDispatchProgrammaticEvent(targetColumn, "mousedown", {
            clientX: startX,
            clientY: startY,
        });
        await animationFrame();

        // Drag inward
        manuallyDispatchProgrammaticEvent(targetColumn, "mousemove", {
            clientX: startX - dragDelta,
            clientY: startY,
        });
        await animationFrame();

        // End resize
        manuallyDispatchProgrammaticEvent(targetColumn, "mouseup", {
            clientX: startX - dragDelta,
            clientY: startY,
        });
        await animationFrame();

        // Ensure inline widths are set after resize.
        expect(targetColumn.style.width).not.toBe("");
        expect(row.style.width).not.toBe("");

        // The last column shrinks and the row width decreases (last-resize case).
        expect(targetColumn.style.width).toBe(`${Math.round(columnWidthBefore - dragDelta)}px`);
        expect(row.style.width).toBe(`${Math.round(rowWidthBefore - dragDelta)}px`);
    });
});
