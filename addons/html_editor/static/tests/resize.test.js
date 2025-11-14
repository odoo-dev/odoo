import { describe, expect, manuallyDispatchProgrammaticEvent, test } from "@odoo/hoot";
import { unformat } from "./_helpers/format";
import { getContent } from "./_helpers/selection";
import { animationFrame } from "@odoo/hoot-mock";
import { setupEditor } from "./_helpers/editor";

/**
 * We set `top: 0` and `left: 0` on tables and column containers in the
 * test HTML so their position starts at a clean, stable origin. Without
 * this, the browser may return tiny negative or fractional values
 * (e.g., top: -0.08px), which can lead to small variations in resize
 * calculations during tests.
 */

describe("table resize", () => {
    describe("row", () => {
        test.tags("desktop");
        test("expand first row by dragging its bottom edge downward", async () => {
            const { el } = await setupEditor(
                unformat(`
                    <table style="position: absolute; top: 0px; left: 0px; width: 600px">
                        <tbody>
                            <tr style="height: 100px">
                                <td style="width: 200px"><p><br></p></td>
                            </tr>
                            <tr style="height: 100px">
                                <td style="width: 200px"><p><br></p></td>
                            </tr>
                            <tr style="height: 100px">
                                <td style="width: 200px"><p><br></p></td>
                            </tr>
                        </tbody>
                    </table>
                `)
            );
            const row = el.querySelector("table tbody tr");

            const rowRect = row.getBoundingClientRect();
            const rowHeightBeforeResizing = rowRect.height;

            // Hover on the bottom edge of the first row.
            manuallyDispatchProgrammaticEvent(row, "mousemove", {
                clientX: rowRect.width / 2,
                clientY: rowRect.bottom,
            });
            await animationFrame();

            // Start resizing from the bottom edge of the row.
            manuallyDispatchProgrammaticEvent(row, "mousedown", {
                clientX: rowRect.width / 2,
                clientY: rowRect.bottom,
            });
            await animationFrame();

            // Drag downward: first row height increases.
            manuallyDispatchProgrammaticEvent(row, "mousemove", {
                clientX: rowRect.width / 2,
                clientY: rowRect.bottom + rowHeightBeforeResizing / 2,
            });
            await animationFrame();

            // End resizing gesture.
            manuallyDispatchProgrammaticEvent(row, "mouseup", {
                clientX: rowRect.width / 2,
                clientY: rowRect.bottom + rowHeightBeforeResizing / 2,
            });
            await animationFrame();

            const rowHeightAfterResizing = row.getBoundingClientRect().height;
            // Row height should be larger now.
            expect(rowHeightAfterResizing).toBeGreaterThan(rowHeightBeforeResizing);
            expect(getContent(el)).toBe(
                unformat(`
                    <p data-selection-placeholder=""><br></p>
                    <table style="position: absolute; top: 0px; left: 0px; width: 600px">
                        <tbody>
                            <tr style="height: 150px;">
                                <td style="width: 200px"><p><br></p></td>
                            </tr>
                            <tr style="height: 100px">
                                <td style="width: 200px"><p><br></p></td>
                            </tr>
                            <tr style="height: 100px">
                                <td style="width: 200px"><p><br></p></td>
                            </tr>
                        </tbody>
                    </table>
                    <p data-selection-placeholder=""><br></p>
                `)
            );
        });

        test.tags("desktop");
        test("shrink last row by dragging bottom edge upward", async () => {
            const { el } = await setupEditor(
                unformat(`
                    <table style="position: absolute; top: 0px; left: 0px; width: 600px">
                        <tbody>
                            <tr style="height: 100px">
                                <td style="width: 200px"><p><br></p></td>
                            </tr>
                            <tr style="height: 100px">
                                <td style="width: 200px"><p><br></p></td>
                            </tr>
                            <tr style="height: 100px">
                                <td style="width: 200px"><p><br></p></td>
                            </tr>
                        </tbody>
                    </table>
                `)
            );

            const tbody = el.querySelector("table tbody");
            const row = tbody.lastChild;

            const rowRect = row.getBoundingClientRect();
            const rowHeightBefore = rowRect.height;

            // Hover on the bottom edge of the last row.
            manuallyDispatchProgrammaticEvent(row, "mousemove", {
                clientX: rowRect.width / 2,
                clientY: rowRect.bottom,
            });
            await animationFrame();
            // Begin resizing on the bottom edge.
            manuallyDispatchProgrammaticEvent(row, "mousedown", {
                clientX: rowRect.width / 2,
                clientY: rowRect.bottom,
            });
            await animationFrame();
            // Drag upward → row height decreases.
            manuallyDispatchProgrammaticEvent(row, "mousemove", {
                clientX: rowRect.width / 2,
                clientY: rowRect.bottom - rowHeightBefore / 2,
            });
            await animationFrame();
            // Finish resizing.
            manuallyDispatchProgrammaticEvent(row, "mouseup", {
                clientX: rowRect.width / 2,
                clientY: rowRect.bottom - rowHeightBefore / 2,
            });
            await animationFrame();

            const rowHeightAfter = row.getBoundingClientRect().height;

            // Last row must shrink.
            expect(rowHeightAfter).toBeLessThan(rowHeightBefore);

            expect(getContent(el)).toBe(
                unformat(`
                    <p data-selection-placeholder=""><br></p>
                    <table style="position: absolute; top: 0px; left: 0px; width: 600px">
                        <tbody>
                            <tr style="height: 100px">
                                <td style="width: 200px"><p><br></p></td>
                            </tr>
                            <tr style="height: 100px">
                                <td style="width: 200px"><p><br></p></td>
                            </tr>
                            <tr style="height: 50px;">
                                <td style="width: 200px"><p><br></p></td>
                            </tr>
                        </tbody>
                    </table>
                    <p data-selection-placeholder=""><br></p>
                `)
            );
        });
    });

    describe("column", () => {
        test.tags("desktop");
        test("expand table first column by dragging right edge outward & table width remains unchanged", async () => {
            const { el } = await setupEditor(
                unformat(`
                    <table style="position: absolute; top: 0px; left: 0px; width: 1200px;">
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
            const cell = table.querySelectorAll("table tr")[1].firstChild;

            const cellRect = cell.getBoundingClientRect();
            const cellWidthBeforeResizing = cellRect.width;
            const tableWidthBeforeResizing = table.offsetWidth;

            // Hover on the right edge of the first table column.
            manuallyDispatchProgrammaticEvent(cell, "mousemove", {
                target: cell,
                clientX: cellRect.right,
            });
            await animationFrame();
            // Start resizing from the right edge.
            manuallyDispatchProgrammaticEvent(cell, "mousedown", {
                clientX: cellRect.right,
            });
            await animationFrame();
            // Drag outward: first column expands, second shrinks.
            manuallyDispatchProgrammaticEvent(cell, "mousemove", {
                target: cell,
                clientX: cellRect.right + cellWidthBeforeResizing / 2,
            });
            await animationFrame();
            // End resizing.
            manuallyDispatchProgrammaticEvent(cell, "mouseup", {
                clientX: cellRect.right + cellWidthBeforeResizing / 2,
            });
            await animationFrame();

            const cellWidthAfterResizing = cell.getBoundingClientRect().width;
            const tableWidthAfterResizing = table.offsetWidth;

            // First column should be wider.
            expect(cellWidthAfterResizing).toBeGreaterThan(cellWidthBeforeResizing);
            // Table width should remain unchanged.
            expect(tableWidthAfterResizing).toEqual(tableWidthBeforeResizing);
            expect(getContent(el)).toBe(
                unformat(`
                    <p data-selection-placeholder=""><br></p>
                    <table style="position: absolute; top: 0px; left: 0px; width: 1200px;">
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
                    <p data-selection-placeholder=""><br></p>
                `)
            );
        });

        test.tags("desktop");
        test("shrink table first column by dragging left edge inward & table width decreases", async () => {
            const { el } = await setupEditor(
                unformat(`
                    <table style="position: absolute; top: 0px; left: 0px; width: 1200px;">
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
            const cell = table.querySelectorAll("table tr")[1].firstChild;

            const cellRect = cell.getBoundingClientRect();
            const cellWidthBeforeResizing = cellRect.width;
            const tableWidthBeforeResizing = table.offsetWidth;

            // Hover on the left edge of the first table column.
            manuallyDispatchProgrammaticEvent(cell, "mousemove", {
                target: cell,
                clientX: cellRect.left,
            });
            await animationFrame();
            // Start resizing from the left edge.
            manuallyDispatchProgrammaticEvent(cell, "mousedown", {
                clientX: cellRect.left,
            });
            await animationFrame();
            // Drag inward: first column shrinks and table width reduces.
            manuallyDispatchProgrammaticEvent(cell, "mousemove", {
                target: cell,
                clientX: cellRect.left + cellWidthBeforeResizing / 2,
            });
            await animationFrame();
            // End resizing.
            manuallyDispatchProgrammaticEvent(cell, "mouseup", {
                clientX: cellRect.left + cellWidthBeforeResizing / 2,
            });
            await animationFrame();

            const cellWidthAfterResizing = cell.getBoundingClientRect().width;
            const tableWidthAfterResizing = table.offsetWidth;

            // First column should now be smaller.
            expect(cellWidthAfterResizing).toBeLessThan(cellWidthBeforeResizing);
            // Table width should decrease due to left-edge shrink.
            expect(tableWidthAfterResizing).toBeLessThan(tableWidthBeforeResizing);
            expect(getContent(el)).toBe(
                unformat(`
                    <p data-selection-placeholder=""><br></p>
                    <table style="position: absolute; top: 0px; left: 0px; width: 900px; margin-left: 300px !important;">
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
                    <p data-selection-placeholder=""><br></p>
                `)
            );
        });

        test.tags("desktop");
        test("shrink table last column by dragging right edge inward & table width decreases", async () => {
            const { el } = await setupEditor(
                unformat(`
                    <table style="position: absolute; top: 0px; left: 0px; width: 1200px;">
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
            const row = table.querySelectorAll("tr")[1];
            const cell = row.lastChild;

            const cellRect = cell.getBoundingClientRect();
            const cellWidthBeforeResizing = cellRect.width;
            const tableWidthBeforeResizing = table.offsetWidth;

            // Hover on the right edge of the last column.
            manuallyDispatchProgrammaticEvent(cell, "mousemove", {
                clientX: cellRect.right,
            });
            await animationFrame();
            // Start resizing from the right edge.
            manuallyDispatchProgrammaticEvent(cell, "mousedown", {
                clientX: cellRect.right,
            });
            await animationFrame();
            // Drag inward (to the left): last column shrinks, table width decreases.
            manuallyDispatchProgrammaticEvent(cell, "mousemove", {
                clientX: cellRect.right - cellWidthBeforeResizing / 2,
            });
            await animationFrame();
            // End resizing.
            manuallyDispatchProgrammaticEvent(cell, "mouseup", {
                clientX: cellRect.right - cellWidthBeforeResizing / 2,
            });
            await animationFrame();

            const cellWidthAfterResizing = cell.getBoundingClientRect().width;
            const tableWidthAfterResizing = table.offsetWidth;

            // Last column must shrink.
            expect(cellWidthAfterResizing).toBeLessThan(cellWidthBeforeResizing);

            // Table width must shrink as well.
            expect(tableWidthAfterResizing).toBeLessThan(tableWidthBeforeResizing);
            expect(getContent(el)).toBe(
                unformat(`
                    <p data-selection-placeholder=""><br></p>
                    <table style="position: absolute; top: 0px; left: 0px; width: 900px;">
                        <tbody>
                            <tr>
                                <td style="width: 600px;"><p><br></p></td>
                                <td style="width: 300px;"><p><br></p></td>
                            </tr>
                            <tr>
                                <td style="width: 600px;"><p><br></p></td>
                                <td style="width: 600px;"><p><br></p></td>
                            </tr>
                        </tbody>
                    </table>
                    <p data-selection-placeholder=""><br></p>
                `)
            );
        });
    });
});

describe("column resize", () => {
    test.tags("desktop");
    test("expand first column by dragging right edge outward & row width remains unchanged", async () => {
        const { el } = await setupEditor(
            unformat(`
                <div style="position: absolute; top: 0px; left: 0px;" class="container o_text_columns o-contenteditable-false" contenteditable="false">
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
        const column = row.firstChild;
        const columnRect = column.getBoundingClientRect();

        const columnWidthBeforeResizing = columnRect.width;
        const rowWidthBeforeResizing = row.offsetWidth;

        // Hover on the right edge of the first column.
        manuallyDispatchProgrammaticEvent(column, "mousemove", {
            clientX: columnRect.right,
        });
        await animationFrame();
        // The column should now show the highlight border.
        expect(column).toHaveClass("o_resize_handle");
        // Start resizing from the right edge of the first column.
        manuallyDispatchProgrammaticEvent(column, "mousedown", {
            clientX: columnRect.right,
        });
        await animationFrame();
        // Drag outward: first column should grow and second shrinks.
        manuallyDispatchProgrammaticEvent(column, "mousemove", {
            clientX: columnRect.right + columnWidthBeforeResizing / 4,
        });
        await animationFrame();
        // End resize operation.
        manuallyDispatchProgrammaticEvent(column, "mouseup", {
            clientX: columnRect.right + columnWidthBeforeResizing / 4,
        });
        await animationFrame();

        const columnWidthAfterResizing = column.getBoundingClientRect().width;
        const rowWidthAfterResizing = row.offsetWidth;

        // First column should now be wider.
        expect(columnWidthAfterResizing).toBeGreaterThan(columnWidthBeforeResizing);

        // Row width must stay the same when resizing from the inside edge.
        expect(rowWidthAfterResizing).toEqual(rowWidthBeforeResizing);
        expect(getContent(el)).toBe(
            unformat(`
                <p data-selection-placeholder=""><br></p>
                <div style="position: absolute; top: 0px; left: 0px;" class="container o_text_columns o-contenteditable-false" contenteditable="false">
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
    test("shrink first column by dragging left edge inward & row width decreases", async () => {
        const { el } = await setupEditor(
            unformat(`
                <div style="position: absolute; top: 0px; left: 0px;" class="container o_text_columns o-contenteditable-false" contenteditable="false">
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
        const column = row.firstChild;
        const columnRect = column.getBoundingClientRect();

        const columnWidthBeforeResizing = columnRect.width;
        const rowWidthBeforeResizing = row.offsetWidth;

        // Hover on the left edge of the first column.
        manuallyDispatchProgrammaticEvent(column, "mousemove", {
            clientX: columnRect.left,
        });
        await animationFrame();
        // The column should now show the highlight border.
        expect(column).toHaveClass("o_resize_handle");
        // Start resizing from the left edge of the first column.
        manuallyDispatchProgrammaticEvent(column, "mousedown", {
            clientX: columnRect.left,
        });
        await animationFrame();
        // Drag inward: first column shrinks and row shifts via margin-left.
        manuallyDispatchProgrammaticEvent(column, "mousemove", {
            clientX: columnRect.left + columnWidthBeforeResizing / 4,
        });
        await animationFrame();
        // End resize operation.
        manuallyDispatchProgrammaticEvent(column, "mouseup", {
            clientX: columnRect.left + columnWidthBeforeResizing / 4,
        });
        await animationFrame();

        const columnWidthAfterResizing = column.getBoundingClientRect().width;
        const rowWidthAfterResizing = row.offsetWidth;

        // First column should now be smaller.
        expect(columnWidthAfterResizing).toBeLessThan(columnWidthBeforeResizing);

        // Row width decreases because shrinking from
        // the left reduces total width.
        expect(rowWidthAfterResizing).toBeLessThan(rowWidthBeforeResizing);
        expect(getContent(el)).toBe(
            unformat(`
                <p data-selection-placeholder=""><br></p>
                <div style="position: absolute; top: 0px; left: 0px;" class="container o_text_columns o-contenteditable-false" contenteditable="false">
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
    test("expand last column by dragging right edge outward & row width increases", async () => {
        const { el } = await setupEditor(
            unformat(`
                <div style="position: absolute; top: 0px; left: 0px;" class="container o_text_columns o-contenteditable-false" contenteditable="false">
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
        const column = row.lastChild;
        const columnRect = column.getBoundingClientRect();

        const columnWidthBeforeResizing = columnRect.width;
        const rowWidthBeforeResizing = row.offsetWidth;

        // Hover on the right edge of the last column.
        manuallyDispatchProgrammaticEvent(column, "mousemove", {
            clientX: columnRect.right,
        });
        await animationFrame();
        // Border highlight should now appear.
        expect(column).toHaveClass("o_resize_handle");
        // Start resizing from the right edge of the last column.
        manuallyDispatchProgrammaticEvent(column, "mousedown", {
            clientX: columnRect.right,
        });
        await animationFrame();
        // Drag outward: last column should grow and row width expands.
        manuallyDispatchProgrammaticEvent(column, "mousemove", {
            clientX: columnRect.right + columnWidthBeforeResizing / 4,
        });
        await animationFrame();
        // End resize operation.
        manuallyDispatchProgrammaticEvent(column, "mouseup", {
            clientX: columnRect.right + columnWidthBeforeResizing / 4,
        });
        await animationFrame();

        const columnWidthAfterResizing = column.getBoundingClientRect().width;
        const rowWidthAfterResizing = row.offsetWidth;

        // Last column should now be wider.
        expect(columnWidthAfterResizing).toBeGreaterThan(columnWidthBeforeResizing);

        // Row width should expand because resizing
        // the last column pushes out the layout.
        expect(rowWidthAfterResizing).toBeGreaterThan(rowWidthBeforeResizing);

        expect(getContent(el)).toBe(
            unformat(`
                <p data-selection-placeholder=""><br></p>
                <div style="position: absolute; top: 0px; left: 0px;" class="container o_text_columns o-contenteditable-false" contenteditable="false">
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
});
