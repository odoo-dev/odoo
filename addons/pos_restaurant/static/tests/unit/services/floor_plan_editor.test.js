import { describe, expect, getFixture, test } from "@odoo/hoot";
import { click, keyDown, keyUp, press, queryAll, waitFor } from "@odoo/hoot-dom";
import { advanceTime, animationFrame, mockFetch } from "@odoo/hoot-mock";
import { definePosModels } from "@point_of_sale/../tests/unit/data/generate_model_definitions";
import { setupPosEnv } from "@point_of_sale/../tests/unit/utils";
import { getService, mountWithCleanup, onRpc } from "@web/../tests/web_test_helpers";
import { FloorScreen } from "@pos_restaurant/app/screens/floor_screen/floor_screen";
import {
    MoveOperation,
    ResizeOperation,
    RotationOperation,
    GroupMoveOperation,
    GroupResizeOperation,
    MarqueeOperation,
} from "@pos_restaurant/app/screens/floor_screen/floor_plan_editor/operations";
import { scaleElementGeometry } from "@pos_restaurant/app/screens/floor_screen/floor_plan_editor/operations/group_resize";
import { SelectionGroup } from "@pos_restaurant/app/screens/floor_screen/floor_plan_editor/utils/selection_group";
import { Snapping } from "@pos_restaurant/app/screens/floor_screen/floor_plan_editor/utils/snapping";
import { DECOR_LIBRARY } from "@pos_restaurant/app/services/floor_plan/utils/decor_library";
import {
    getStaticSvgUrl,
    getSvgImageUrl,
    loadSvgAsset,
} from "@pos_restaurant/app/services/floor_plan/utils/decor_colors";
import { DecorColors } from "@pos_restaurant/app/screens/floor_screen/floor_plan_editor/edit_decor/decor_colors";
import { EditDecorProperties } from "@pos_restaurant/app/screens/floor_screen/floor_plan_editor/edit_decor/edit_decor";
import { CustomColorPicker } from "@pos_restaurant/app/screens/floor_screen/floor_plan_editor/edit_decor/custom_color_picker";
import { EditSelectionProperties } from "@pos_restaurant/app/screens/floor_screen/floor_plan_editor/edit_selection/edit_selection";

definePosModels();

function makeHandles() {
    return {
        actions: [],
        startAction(action) {
            this.actions.push(action);
        },
        follow() {},
        endAction() {
            this.actions.push("end");
        },
    };
}

const noSnapping = {
    findAllSnaps: () => ({ xSnaps: [], ySnaps: [] }),
    drawGuides() {},
    clearGuides() {},
};

function makeCanvas(width = 1000, height = 800) {
    const container = document.createElement("div");
    container.style.cssText = `position:relative;width:${width}px;height:${height}px;overflow:auto;`;
    const canvas = document.createElement("div");
    canvas.style.cssText = `position:relative;width:${width}px;height:${height}px;`;
    const guides = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    canvas.appendChild(guides);
    container.appendChild(canvas);
    getFixture().appendChild(container);
    return { container, canvas, guides };
}

function makeDomElement(canvas, element) {
    const el = document.createElement("div");
    el.id = `fpe-${element.uuid}`;
    el.style.cssText = `position:absolute;width:${element.width}px;height:${element.height}px;transform:translate(${element.left}px,${element.top}px);`;
    canvas.appendChild(el);
    return el;
}

async function setupEditor() {
    await setupPosEnv();
    const store = getService("pos_floor_plan");
    store.startEditMode();
    const { container, canvas, guides } = makeCanvas();
    const snapping = new Snapping(guides, store, container);
    return { store, container, canvas, snapping };
}

function getTables(store) {
    return [...store.getFloorTables()].sort((a, b) => a.left - b.left);
}

describe("floor plan editor operations", () => {
    test("move operation translates the element", async () => {
        const { store, container, canvas } = await setupEditor();
        const [table] = getTables(store);
        const el = makeDomElement(canvas, table);
        const handles = makeHandles();
        const operation = new MoveOperation({
            el,
            floorElement: table,
            event: { clientX: 150, clientY: 200 },
            canvasEl: canvas,
            scrollContainerEl: container,
            snapping: noSnapping,
            handles,
        });
        operation.onMove({ clientX: 180, clientY: 225 });
        await animationFrame();
        const result = operation.stop();
        expect(result).toEqual({ left: table.left + 30, top: table.top + 25 });
        expect(handles.actions).toEqual(["move", "end"]);
        expect(el.style.transform).toBe(
            `translate(${table.left + 30}px, ${table.top + 25}px) rotate(0deg)`
        );
    });

    test("move operation below the drag threshold is a click", async () => {
        const { store, container, canvas } = await setupEditor();
        const [table] = getTables(store);
        const el = makeDomElement(canvas, table);
        const operation = new MoveOperation({
            el,
            floorElement: table,
            event: { clientX: 150, clientY: 200 },
            canvasEl: canvas,
            scrollContainerEl: container,
            snapping: noSnapping,
            handles: makeHandles(),
        });
        operation.onMove({ clientX: 152, clientY: 201 });
        await animationFrame();
        expect(operation.stop()).toBe(false);
    });

    test("move operation keeps the element inside the canvas", async () => {
        const { store, container, canvas } = await setupEditor();
        const [table] = getTables(store);
        const el = makeDomElement(canvas, table);
        const operation = new MoveOperation({
            el,
            floorElement: table,
            event: { clientX: 150, clientY: 200 },
            canvasEl: canvas,
            scrollContainerEl: container,
            snapping: noSnapping,
            handles: makeHandles(),
        });
        operation.onMove({ clientX: -2000, clientY: -2000 });
        await animationFrame();
        const result = operation.stop();
        expect(result.left).toBe(-(table.width - 50));
        expect(result.top).toBe(-(table.height - 50));
    });

    test("move operation snaps to a neighbour edge", async () => {
        const { store, container, canvas, snapping } = await setupEditor();
        const [table, neighbour] = getTables(store);
        const el = makeDomElement(canvas, table);
        const operation = new MoveOperation({
            el,
            floorElement: table,
            event: { clientX: 0, clientY: 0 },
            canvasEl: canvas,
            scrollContainerEl: container,
            snapping,
            handles: makeHandles(),
        });
        const target = neighbour.height - 3;
        for (let y = 10; y <= target; y = Math.min(y + 10, target)) {
            operation.onMove({ clientX: 0, clientY: y });
            await animationFrame();
            if (y === target) {
                break;
            }
        }
        const result = operation.stop();
        expect(result.top).toBe(neighbour.top + neighbour.height);
    });

    test("resize operation from the bottom right corner", async () => {
        const { store, canvas } = await setupEditor();
        const decor = store.addDecor("rect", { left: 100, top: 100, width: 200, height: 100 });
        const el = makeDomElement(canvas, decor);
        const handles = makeHandles();
        const operation = new ResizeOperation({
            el,
            position: "se",
            event: { clientX: 300, clientY: 200 },
            handles,
            floorElement: decor,
        });
        operation.onMove({ clientX: 350, clientY: 230 });
        expect(operation.stop()).toEqual({ left: 100, top: 100, width: 250, height: 130 });
        expect(handles.actions).toEqual(["resize-se", "end"]);
    });

    test("resize operation from the top left corner keeps the opposite corner fixed", async () => {
        const { store, canvas } = await setupEditor();
        const decor = store.addDecor("rect", { left: 100, top: 100, width: 200, height: 100 });
        const el = makeDomElement(canvas, decor);
        const operation = new ResizeOperation({
            el,
            position: "nw",
            event: { clientX: 100, clientY: 100 },
            handles: makeHandles(),
            floorElement: decor,
        });
        operation.onMove({ clientX: 50, clientY: 70 });
        expect(operation.stop()).toEqual({ left: 50, top: 70, width: 250, height: 130 });
    });

    test("resize operation respects the minimum size", async () => {
        const { store, canvas } = await setupEditor();
        const decor = store.addDecor("rect", { left: 100, top: 100, width: 200, height: 100 });
        const el = makeDomElement(canvas, decor);
        const operation = new ResizeOperation({
            el,
            position: "e",
            event: { clientX: 300, clientY: 150 },
            handles: makeHandles(),
            floorElement: decor,
        });
        operation.onMove({ clientX: 0, clientY: 150 });
        const result = operation.stop();
        expect(result.width).toBe(40);
        expect(result.height).toBe(100);
    });

    test("resize operation keeps the aspect ratio of images", async () => {
        const { store, canvas } = await setupEditor();
        const decor = store.addDecor("image", {
            name: "chair.svg",
            left: 100,
            top: 100,
            width: 100,
            height: 50,
        });
        const el = makeDomElement(canvas, decor);
        const operation = new ResizeOperation({
            el,
            position: "se",
            event: { clientX: 200, clientY: 150 },
            handles: makeHandles(),
            floorElement: decor,
        });
        operation.onMove({ clientX: 250, clientY: 150 });
        const result = operation.stop();
        expect(result.width).toBe(140);
        expect(result.height).toBe(70);
        expect(result.left).toBe(100);
        expect(result.top).toBe(100);
    });

    test("resize operation on a rotated element", async () => {
        const { store, canvas } = await setupEditor();
        const decor = store.addDecor("rect", {
            left: 100,
            top: 100,
            width: 200,
            height: 100,
            rotation: 90,
        });
        const el = makeDomElement(canvas, decor);
        const operation = new ResizeOperation({
            el,
            position: "e",
            event: { clientX: 200, clientY: 250 },
            handles: makeHandles(),
            floorElement: decor,
        });
        operation.onMove({ clientX: 200, clientY: 290 });
        const result = operation.stop();
        expect(result.width).toBe(240);
        expect(result.height).toBe(100);
        expect(result.left).toBe(80);
        expect(result.top).toBe(120);
    });

    test("rotation operation snaps to 45 degrees", async () => {
        const { store, canvas } = await setupEditor();
        const decor = store.addDecor("rect", { left: 100, top: 100, width: 200, height: 100 });
        const el = makeDomElement(canvas, decor);
        const rect = el.getBoundingClientRect();
        const pivotX = rect.left + rect.width / 2;
        const pivotY = rect.top + rect.height / 2;
        const handles = makeHandles();
        const operation = new RotationOperation({
            el,
            event: { clientX: pivotX + 100, clientY: pivotY },
            handles,
            floorElement: decor,
        });
        const angle = (43 * Math.PI) / 180;
        operation.onMove({
            clientX: pivotX + 100 * Math.cos(angle),
            clientY: pivotY + 100 * Math.sin(angle),
        });
        expect(operation.stop()).toEqual({ rotation: 45 });
        expect(handles.actions).toEqual(["rotate", "end"]);
    });

    test("rotation operation keeps the center of a line", async () => {
        const { store, canvas } = await setupEditor();
        const line = store.addDecor("line", { left: 100, top: 100, width: 200, height: 6 });
        const el = makeDomElement(canvas, line);
        const rect = el.getBoundingClientRect();
        const pivotX = rect.left + rect.width / 2;
        const pivotY = rect.top + rect.height / 2;
        const operation = new RotationOperation({
            el,
            event: { clientX: pivotX + 100, clientY: pivotY },
            handles: makeHandles(),
            floorElement: line,
        });
        operation.onMove({ clientX: pivotX, clientY: pivotY + 100 });
        const result = operation.stop();
        expect(result.rotation).toBe(90);
        expect(Math.round(result.left)).toBe(200);
        expect(Math.round(result.top)).toBe(0);
    });
});

describe("floor plan editor multi selection", () => {
    test("toggle selection and selection group bounds", async () => {
        const { store } = await setupEditor();
        const [t1, t2, t3] = getTables(store);
        store.selectElementByUuid(t1.uuid);
        store.selectElementByUuid(t2.uuid, { toggle: true });
        expect(store.hasMultiSelection).toBe(true);
        expect(store.selectedElementUuids).toEqual([t1.uuid, t2.uuid]);
        expect(store.selectedElement).toBe(t2);
        store.selectElementByUuid(t1.uuid, { toggle: true });
        expect(store.hasMultiSelection).toBe(false);
        expect(store.selectedElement).toBe(t2);
        store.selectElementsByUuid([t1.uuid, t3.uuid]);
        const group = new SelectionGroup(store.selectedElements);
        expect(group.left).toBe(t1.left);
        expect(group.top).toBe(t1.top);
        expect(group.width).toBe(t3.left + t3.width - t1.left);
        expect(group.height).toBe(t1.height);
        expect(group.isRotationAllowed()).toBe(false);
        store.selectElementByUuid(t2.uuid);
        expect(store.selectedElementUuids).toEqual([t2.uuid]);
        store.selectElementByUuid(null);
        expect(store.selectedElements).toEqual([]);
    });

    test("group move translates every selected element", async () => {
        const { store, canvas } = await setupEditor();
        const [t1, t2] = getTables(store);
        const elements = [t1, t2].map((floorElement) => ({
            el: makeDomElement(canvas, floorElement),
            floorElement,
        }));
        const handles = makeHandles();
        const operation = new GroupMoveOperation({
            elements,
            selectionGroup: new SelectionGroup([t1, t2]),
            event: { clientX: 0, clientY: 0 },
            canvasEl: canvas,
            snapping: noSnapping,
            handles,
        });
        operation.onMove({ clientX: 40, clientY: 20 });
        const result = operation.stop();
        expect(result.updates).toEqual([
            { uuid: t1.uuid, data: { left: t1.left + 40, top: t1.top + 20 } },
            { uuid: t2.uuid, data: { left: t2.left + 40, top: t2.top + 20 } },
        ]);
        expect(handles.actions).toEqual(["move", "end"]);

        const before = [t1.left, t2.left];
        store.updateElements(result.updates);
        expect([t1.left, t2.left]).toEqual([before[0] + 40, before[1] + 40]);
        store.undo();
        expect([t1.left, t2.left]).toEqual(before);
        store.redo();
        expect([t1.left, t2.left]).toEqual([before[0] + 40, before[1] + 40]);
    });

    test("group move snaps the group box, not the selected elements", async () => {
        const { store, canvas, snapping } = await setupEditor();
        const [t1, t2, t3] = getTables(store);
        const elements = [t1, t2].map((floorElement) => ({
            el: makeDomElement(canvas, floorElement),
            floorElement,
        }));
        const operation = new GroupMoveOperation({
            elements,
            selectionGroup: new SelectionGroup([t1, t2]),
            event: { clientX: 0, clientY: 0 },
            canvasEl: canvas,
            snapping,
            handles: makeHandles(),
        });
        operation.onMove({ clientX: 0, clientY: t3.height + 3 });
        const result = operation.stop();
        expect(result.updates[0].data.top).toBe(t3.top + t3.height);
    });

    test("group resize scales the elements around the anchor corner", async () => {
        const { store, canvas } = await setupEditor();
        const [t1, t2] = getTables(store);
        const elements = [t1, t2].map((floorElement) => ({
            el: makeDomElement(canvas, floorElement),
            floorElement,
        }));
        const group = new SelectionGroup([t1, t2]);
        const operation = new GroupResizeOperation({
            elements,
            selectionGroup: group,
            position: "se",
            event: { clientX: 0, clientY: 0 },
            handles: makeHandles(),
        });
        operation.onMove({ clientX: group.width / 2, clientY: group.height / 2 });
        const result = operation.stop();
        expect(Math.round(operation.factor * 1000)).toBe(1500);
        expect(result.updates[0].data).toEqual({
            left: t1.left,
            top: t1.top,
            width: 150,
            height: 150,
            scale: 1,
        });
        expect(result.updates[1].data).toEqual({
            left: Math.round(group.left + (t2.left - group.left) * 1.5),
            top: t2.top,
            width: 150,
            height: 150,
            scale: 1,
        });
    });

    test("scaleElementGeometry handles lines and text", async () => {
        const line = { left: 100, top: 100, width: 200, height: 6, scale: 1, isLine: true };
        expect(scaleElementGeometry(line, 0, 0, 2)).toEqual({
            left: 200,
            top: 203,
            width: 400,
            height: 6,
            scale: 1,
        });
        const text = { left: 100, top: 100, width: 80, height: 20, scale: 1, isText: true };
        expect(scaleElementGeometry(text, 0, 0, 2)).toEqual({
            left: 240,
            top: 210,
            width: 80,
            height: 20,
            scale: 2,
        });
    });

    test("group move does not start below the drag threshold", async () => {
        const { store, canvas } = await setupEditor();
        const [t1, t2] = getTables(store);
        const handles = makeHandles();
        const operation = new GroupMoveOperation({
            elements: [t1, t2].map((floorElement) => ({
                el: makeDomElement(canvas, floorElement),
                floorElement,
            })),
            selectionGroup: new SelectionGroup([t1, t2]),
            event: { clientX: 0, clientY: 0 },
            canvasEl: canvas,
            snapping: noSnapping,
            handles,
        });
        operation.onMove({ clientX: 3, clientY: 2 });
        expect(operation.isStarted()).toBe(false);
        expect(operation.stop()).toBe(false);
        expect(handles.actions).toEqual([]);
    });

    test("group move keeps a part of the group inside the canvas", async () => {
        const { store, canvas } = await setupEditor();
        const [t1, t2] = getTables(store);
        const group = new SelectionGroup([t1, t2]);
        const operation = new GroupMoveOperation({
            elements: [t1, t2].map((floorElement) => ({
                el: makeDomElement(canvas, floorElement),
                floorElement,
            })),
            selectionGroup: group,
            event: { clientX: 0, clientY: 0 },
            canvasEl: canvas,
            snapping: noSnapping,
            handles: makeHandles(),
        });
        operation.onMove({ clientX: -100000, clientY: -100000 });
        const [first, second] = operation.stop().updates;
        const dx = first.data.left - t1.left;
        const dy = first.data.top - t1.top;
        expect(group.left + dx + group.width).toBeGreaterThan(0);
        expect(group.top + dy + group.height).toBeGreaterThan(0);
        expect(second.data).toEqual({ left: t2.left + dx, top: t2.top + dy });
    });

    test("group move skips snapping while ctrl is pressed", async () => {
        const { store, canvas, snapping } = await setupEditor();
        const [t1, t2, t3] = getTables(store);
        const operation = new GroupMoveOperation({
            elements: [t1, t2].map((floorElement) => ({
                el: makeDomElement(canvas, floorElement),
                floorElement,
            })),
            selectionGroup: new SelectionGroup([t1, t2]),
            event: { clientX: 0, clientY: 0 },
            canvasEl: canvas,
            snapping,
            handles: makeHandles(),
        });
        operation.onMove({ clientX: 0, clientY: t3.height + 3, ctrlKey: true });
        expect(operation.stop().updates[0].data.top).toBe(t1.top + t3.height + 3);
    });

    test("group resize from the top left corner keeps the bottom right corner", async () => {
        const { store, canvas } = await setupEditor();
        const [t1, t2] = getTables(store);
        const group = new SelectionGroup([t1, t2]);
        const operation = new GroupResizeOperation({
            elements: [t1, t2].map((floorElement) => ({
                el: makeDomElement(canvas, floorElement),
                floorElement,
            })),
            selectionGroup: group,
            position: "nw",
            event: { clientX: 0, clientY: 0 },
            handles: makeHandles(),
        });
        operation.onMove({ clientX: -group.width / 2, clientY: -group.height / 2 });
        const [first, second] = operation.stop().updates;
        expect(Math.round(operation.factor * 1000)).toBe(1500);
        expect(second.data.left + second.data.width).toBe(group.left + group.width);
        expect(first.data.top + first.data.height).toBe(group.top + group.height);
        expect(first.data.width).toBe(Math.round(t1.width * 1.5));
    });

    test("group resize does not shrink the group below its minimum size", async () => {
        const { store, canvas } = await setupEditor();
        const [t1, t2] = getTables(store);
        const group = new SelectionGroup([t1, t2]);
        const operation = new GroupResizeOperation({
            elements: [t1, t2].map((floorElement) => ({
                el: makeDomElement(canvas, floorElement),
                floorElement,
            })),
            selectionGroup: group,
            position: "se",
            event: { clientX: 0, clientY: 0 },
            handles: makeHandles(),
        });
        operation.onMove({ clientX: -100000, clientY: -100000 });
        const { updates } = operation.stop();
        expect(operation.factor).toBe(40 / Math.max(group.width, group.height));
        expect(updates[0].data.left).toBe(t1.left);
        expect(updates.every(({ data }) => data.width > 0 && data.height > 0)).toBe(true);
    });

    test("group resize does not start below the movement threshold", async () => {
        const { store, canvas } = await setupEditor();
        const [t1, t2] = getTables(store);
        const handles = makeHandles();
        const operation = new GroupResizeOperation({
            elements: [t1, t2].map((floorElement) => ({
                el: makeDomElement(canvas, floorElement),
                floorElement,
            })),
            selectionGroup: new SelectionGroup([t1, t2]),
            position: "se",
            event: { clientX: 0, clientY: 0 },
            handles,
        });
        operation.onMove({ clientX: 2, clientY: 2 });
        expect(operation.isStarted()).toBe(false);
        expect(operation.stop()).toBe(false);
        expect(handles.actions).toEqual(["end"]);
    });

    test("marquee selects the intersecting elements", async () => {
        const { store, canvas } = await setupEditor();
        const [t1, t2, t3] = getTables(store);
        const rect = canvas.getBoundingClientRect();
        const operation = new MarqueeOperation({
            event: { clientX: rect.left + t1.left - 20, clientY: rect.top + t1.top - 20 },
            canvasEl: canvas,
            marqueeEl: null,
            floorPlanStore: store,
        });
        operation.onMove({
            clientX: rect.left + t2.left + 10,
            clientY: rect.top + t2.top + 10,
        });
        const result = operation.stop();
        expect(result.uuids).toEqual([t1.uuid, t2.uuid]);
        expect(result.uuids).not.toInclude(t3.uuid);
    });

    test("marquee without movement is not started", async () => {
        const { store, canvas } = await setupEditor();
        const rect = canvas.getBoundingClientRect();
        const operation = new MarqueeOperation({
            event: { clientX: rect.left + 10, clientY: rect.top + 10 },
            canvasEl: canvas,
            marqueeEl: null,
            floorPlanStore: store,
        });
        operation.onMove({ clientX: rect.left + 12, clientY: rect.top + 11 });
        expect(operation.stop()).toBe(false);
    });

    test("delete and duplicate a multi selection are single history steps", async () => {
        const { store } = await setupEditor();
        const [t1, t2] = getTables(store);
        const count = store.getFloorTables().length;
        store.selectElementsByUuid([t1.uuid, t2.uuid]);
        store.removeElements(store.selectedElementUuids);
        expect(store.getFloorTables().length).toBe(count - 2);
        expect(store.selectedElements).toEqual([]);
        store.undo();
        expect(store.getFloorTables().length).toBe(count);
        store.redo();
        expect(store.getFloorTables().length).toBe(count - 2);
        store.undo();

        const [d1, d2] = store.duplicateElements([t1.uuid, t2.uuid]);
        expect(store.getFloorTables().length).toBe(count + 2);
        expect(d1.left).toBe(t1.left + 20);
        expect(d2.left).toBe(t2.left + 20);
        expect(store.selectedElementUuids).toEqual([d1.uuid, d2.uuid]);
        store.undo();
        expect(store.getFloorTables().length).toBe(count);
    });

    test("align elements", async () => {
        const { store } = await setupEditor();
        const [t1, t2, t3] = getTables(store);
        store.updateElement(t2.uuid, { top: t1.top + 40, height: 60 });
        const uuids = [t1.uuid, t2.uuid, t3.uuid];

        store.alignElements(uuids, "top");
        expect(t2.top).toBe(t1.top);
        store.alignElements(uuids, "bottom");
        expect(t2.top).toBe(t1.top + t1.height - 60);
        store.alignElements(uuids, "middle");
        expect(t2.top).toBe(t1.top + (t1.height - 60) / 2);

        const left = t1.left;
        store.alignElements(uuids, "left");
        expect([t1.left, t2.left, t3.left]).toEqual([left, left, left]);
        store.undo();
        expect(t1.left).toBe(left);
        expect(t3.left).not.toBe(left);
        store.alignElements(uuids, "right");
        const right = t3.left + t3.width;
        expect(t1.left + t1.width).toBe(right);
        expect(t2.left + t2.width).toBe(right);
        store.undo();
        store.alignElements(uuids, "center");
        const center = (t1.left + t3.left + t3.width) / 2;
        expect(t2.left + t2.width / 2).toBe(center);
    });

    test("align moves each group as one block", async () => {
        const { store } = await setupEditor();
        const [t1, t2, t3, t4] = [
            [100, 100],
            [180, 130],
            [400, 250],
            [480, 310],
        ].map(([left, top]) => store.addDecor("rect", { left, top, width: 50, height: 50 }));
        store.groupElements([t1.uuid, t2.uuid]);
        store.groupElements([t3.uuid, t4.uuid]);
        const offsets = [t2.top - t1.top, t4.top - t3.top];
        store.alignElements([t1.uuid, t2.uuid, t3.uuid, t4.uuid], "top");
        expect(Math.min(t1.top, t2.top)).toBe(Math.min(t3.top, t4.top));
        expect([t2.top - t1.top, t4.top - t3.top]).toEqual(offsets);
    });
});

describe("floor plan editor groups", () => {
    test("group and ungroup elements", async () => {
        const { store } = await setupEditor();
        const [t1, t2, t3] = getTables(store);
        store.selectElementsByUuid([t1.uuid, t2.uuid]);
        expect(store.canGroupSelection).toBe(true);
        expect(store.isSelectionGrouped).toBe(false);
        const groupId = store.groupElements(store.selectedElementUuids);
        expect(t1.groupId).toBe(groupId);
        expect(t2.groupId).toBe(groupId);
        expect(t1.raw.groupId).toBe(groupId);
        expect(store.isSelectionGrouped).toBe(true);
        expect(store.canGroupSelection).toBe(false);

        store.selectElementByUuid(null);
        store.selectElementByUuid(t1.uuid);
        expect(store.selectedElementUuids).toEqual([t2.uuid, t1.uuid]);
        expect(store.selectedElement).toBe(t1);

        store.selectElementByUuid(t3.uuid);
        store.selectElementByUuid(t2.uuid, { toggle: true });
        expect(store.selectedElementUuids).toEqual([t3.uuid, t1.uuid, t2.uuid]);
        expect(store.isSelectionGrouped).toBe(false);
        store.selectElementByUuid(t1.uuid, { toggle: true });
        expect(store.selectedElementUuids).toEqual([t3.uuid]);

        store.selectElementsByUuid([t2.uuid]);
        expect(store.selectedElementUuids).toEqual([t2.uuid, t1.uuid]);
        store.selectElementByUuid(t2.uuid, { expandGroups: false });
        expect(store.selectedElementUuids).toEqual([t2.uuid]);
        store.selectElementByUuid(t1.uuid, { toggle: true, expandGroups: false });
        expect(store.selectedElementUuids).toEqual([t2.uuid, t1.uuid]);

        store.undo();
        expect(t1.groupId).toBe(undefined);
        expect(t2.groupId).toBe(undefined);
        store.redo();
        expect(t1.groupId).toBe(groupId);

        store.ungroupElements([t1.uuid, t2.uuid]);
        expect(t1.groupId).toBe(null);
        expect(t1.raw.groupId).toBe(undefined);
        store.selectElementByUuid(t1.uuid);
        expect(store.selectedElementUuids).toEqual([t1.uuid]);
    });

    test("a counter preset is added as one group", async () => {
        const { store } = await setupEditor();
        const counter = DECOR_LIBRARY.flatMap((group) => group.items).find(
            (item) => item.name === "counter"
        );
        const decors = store.addDecorGroup(counter.parts, { left: 100, top: 50 });
        expect(decors.map((decor) => decor.name)).toEqual([
            "bar-corner-left.svg",
            "bar.svg",
            "bar-corner.svg",
        ]);
        expect(decors.map((decor) => decor.left)).toEqual([100, 179, 578]);
        expect(new Set(decors.map((decor) => decor.groupId)).size).toBe(1);
        expect(decors[0].groupId).not.toBe(undefined);
        expect([...store.selectedElementUuids].sort()).toEqual(
            decors.map((decor) => decor.uuid).sort()
        );
        store.undo();
        expect(decors.every((decor) => !store.getElementByUuid(decor.uuid))).toBe(true);
    });

    test("duplicating a group creates a new group", async () => {
        const { store } = await setupEditor();
        const [t1, t2] = getTables(store);
        const groupId = store.groupElements([t1.uuid, t2.uuid]);
        const [d1, d2] = store.duplicateElements([t1.uuid, t2.uuid]);
        expect(d1.groupId).toBe(d2.groupId);
        expect(d1.groupId).not.toBe(groupId);
        expect(store.getGroupElements(groupId)).toEqual([t1, t2]);
    });

    test("update the colors of several identical decors at once", async () => {
        const { store } = await setupEditor();
        const chairs = [0, 1].map((i) =>
            store.addDecor("image", {
                name: "chair.svg",
                left: 100 + i * 100,
                top: 400,
                width: 50,
                height: 50,
            })
        );
        store.updateElements(
            chairs.map((chair) => ({
                uuid: chair.uuid,
                data: { colors: { fabric: "#ff0000" } },
            }))
        );
        for (const chair of chairs) {
            expect(chair.getColor("fabric")).toBe("#ff0000");
            expect(chair.getColor("fabric2")).toBe("#a88f72");
            expect(chair.raw.colors).toEqual({ fabric: "#ff0000" });
        }
        store.undo();
        for (const chair of chairs) {
            expect(chair.raw.colors).toBe(undefined);
        }
    });
});

describe("floor plan editor decor colors", () => {
    test("undo a batched color change restores the default colors", async () => {
        const { store } = await setupEditor();
        const chair = store.addDecor("image", { name: "chair.svg", width: 50, height: 50 });
        store.updateElement(chair.uuid, { colors: { fabric: "#ff0000" } }, { batched: true });
        store.updateElement(chair.uuid, { colors: { fabric: "#00ff00" } });
        expect(chair.getColor("fabric")).toBe("#00ff00");
        store.undo();
        expect(chair.colors).toEqual({});
        expect(chair.getColor("fabric")).toBe("#cdb79b");
        expect(chair.raw.colors).toBe(undefined);
    });

    test("editing a color of several decors keeps their other custom colors", async () => {
        const { store } = await setupEditor();
        const [chair, otherChair] = [0, 1].map((i) =>
            store.addDecor("image", {
                name: "chair.svg",
                left: 100 + i * 100,
                top: 400,
                width: 50,
                height: 50,
            })
        );
        store.updateElement(otherChair.uuid, { colors: { fabric2: "#0000ff" } });
        const planter = store.addDecor("image", { name: "planter-1.svg", width: 80, height: 60 });
        const updateElements = (updates, options) => store.updateElements(updates, options);

        const colors = await mountWithCleanup(DecorColors, {
            props: { elements: [chair, otherChair], updateElements },
        });
        colors.setTokenColor("fabric", "#ff0000");
        expect(chair.colors).toEqual({ fabric: "#ff0000" });
        expect(otherChair.colors).toEqual({ fabric: "#ff0000", fabric2: "#0000ff" });

        const mixed = await mountWithCleanup(DecorColors, {
            props: { elements: [chair, planter], updateElements },
        });
        expect(mixed.colorTokens).toEqual([]);
        colors.resetColors();
        expect([chair.colors, otherChair.colors]).toEqual([{}, {}]);
    });

    test("svg decors without color tokens keep the background rendering", async () => {
        const { store } = await setupEditor();
        mockFetch((input) =>
            String(input).endsWith("/plant.svg")
                ? new Response(
                      '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><path d="M0 0h9v9z"/></svg>'
                  )
                : new Response(
                      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 50"><path style="fill:var(--fp-picto,#000)" d="M0 0h9v9z"/></svg>'
                  )
        );
        const plant = store.addDecor("image", { name: "plant.svg", width: 50, height: 50 });
        const toilet = store.addDecor("image", { name: "toilet.svg", width: 60, height: 60 });
        await loadSvgAsset(plant.url);
        await loadSvgAsset(toilet.url);
        expect(plant.svgAsset).toBe(null);
        expect(plant.getCssStyle()).toInclude("background-image");
        expect(toilet.colorTokens).toEqual(["picto"]);
        expect(toilet.getCssStyle()).toInclude('background-image: url("data:image/svg+xml,');
        expect(toilet.getCssStyle()).toInclude(encodeURIComponent("fill:#000000"));
    });

    test("decors accept a custom color", async () => {
        const { store } = await setupEditor();
        const zone = store.addDecor("rect", {
            left: 10,
            top: 10,
            width: 100,
            height: 60,
            color: "orange",
        });
        const panel = await mountWithCleanup(EditDecorProperties, {
            props: {
                element: zone,
                updateElement: (uuid, values, options) =>
                    store.updateElement(uuid, values, options),
                moveLayer: () => {},
            },
        });
        panel.setCustomColor("color", "#5c5c5c");
        expect(zone.color).toBe("#5c5c5c");
        expect(zone.raw.color).toBe("#5c5c5c");
        store.updateElement(zone.uuid, { borderWidth: 0 });
        expect(panel.hasBorder).toBe(false);
        panel.selectBorderColor("blue");
        expect([zone.borderColor, zone.borderWidth]).toEqual(["blue", 2]);
        expect(panel.hasBorder).toBe(true);

        const named = await mountWithCleanup(CustomColorPicker, {
            props: { value: "black", onPick: () => {} },
        });
        expect(named.isCustom).toBe(false);
        expect(named.hexValue).toBe("#141414");
        const custom = await mountWithCleanup(CustomColorPicker, {
            props: { value: "#5c5c5c", onPick: () => {} },
        });
        expect(custom.isCustom).toBe(true);
        expect(custom.hexValue).toBe("#5c5c5c");
    });

    test("decors can be made transparent", async () => {
        const { store } = await setupEditor();
        const [plant, tree] = ["plant-small.svg", "tree.svg"].map((name, i) =>
            store.addDecor("image", { name, left: 10 + i * 100, top: 10, width: 60, height: 60 })
        );
        expect(plant.raw.opacity).toBe(undefined);
        expect(plant.getCssStyle()).not.toInclude("opacity");
        const panel = await mountWithCleanup(EditSelectionProperties, {
            props: {
                elements: [plant, tree],
                align: () => {},
                updateElements: (updates, options) => store.updateElements(updates, options),
            },
        });
        panel.setTransparency({ target: { value: 40 } });
        expect([plant.opacity, tree.opacity]).toEqual([0.6, 0.6]);
        expect(plant.raw.opacity).toBe(0.6);
        expect(plant.getCssStyle()).toInclude("opacity:0.6");
        store.undo();
        expect([plant.raw.opacity, tree.raw.opacity]).toEqual([undefined, undefined]);

        const wall = store.addDecor("line", {
            left: 10,
            top: 200,
            width: 200,
            height: 2,
            group: "lw",
        });
        expect(wall.raw.opacity).toBe(undefined);
        store.updateElement(wall.uuid, { opacity: 0.5 });
        expect(wall.raw.opacity).toBe(0.5);
        expect(wall.getCssStyle()).toInclude("opacity:0.5");
        const reloaded = store.createDecorFromData({ ...wall.raw });
        expect(reloaded.opacity).toBe(0.5);
    });

    test("corner rounding applies to shapes without border", async () => {
        const { store } = await setupEditor();
        const zone = store.addDecor("rect", {
            left: 10,
            top: 10,
            width: 120,
            height: 100,
            color: "orange",
            borderWidth: 0,
            roundedCorner: 12,
        });
        expect(zone.getCssStyle()).toInclude("border-radius: 12px");
        expect(zone.getCssStyle()).not.toInclude("border:");
    });

    test("a dashed coloured line keeps its style and color when reloaded", async () => {
        const { store } = await setupEditor();
        const line = store.addDecor("line", {
            left: 10,
            top: 10,
            width: 150,
            height: 5,
            borderStyle: "dashed",
            color: "red",
        });
        expect([line.style, line.color]).toEqual(["dashed", "red"]);
        const reloaded = store.createDecorFromData({ ...line.raw });
        expect([reloaded.style, reloaded.color]).toEqual(["dashed", "red"]);
        const fromBorderColor = store.createDecorFromData({
            shape: "line",
            width: 100,
            height: 5,
            borderColor: "blue",
        });
        expect(fromBorderColor.color).toBe("blue");
    });

    test("only library file names are recolored", async () => {
        expect(getStaticSvgUrl("chair.svg")).toBe("/pos_restaurant/static/floor_plan/chair.svg");
        expect(getStaticSvgUrl("../../../web/content/1/x.svg")).toBe(null);
        expect(getStaticSvgUrl("photo.png")).toBe(null);
        expect(getStaticSvgUrl(undefined)).toBe(null);
    });

    test("svg colors are written into an image url", async () => {
        const asset = {
            text: '<svg xmlns="http://www.w3.org/2000/svg"><path style="fill:var(--fp-wood,#c9b08f);stroke:var(--fp-line)"/></svg>',
            tokens: ["wood", "line"],
        };
        const colors = { wood: "#ff0000" };
        const url = getSvgImageUrl(asset, (token) => colors[token]);
        expect(url).toBe(
            "data:image/svg+xml," +
                encodeURIComponent(
                    '<svg xmlns="http://www.w3.org/2000/svg"><path style="fill:#ff0000;stroke:currentColor"/></svg>'
                )
        );
        expect(getSvgImageUrl(asset, (token) => colors[token])).toBe(url);
        colors.wood = undefined;
        expect(decodeURIComponent(getSvgImageUrl(asset, (token) => colors[token]))).toInclude(
            "fill:#c9b08f"
        );
    });
});

describe("floor plan editor component", () => {
    test.tags("desktop");
    test("ctrl-click selects several elements, align and delete them", async () => {
        await setupPosEnv();
        const store = getService("pos_floor_plan");
        store.startEditMode();
        const [t1, t2] = getTables(store);
        store.updateElement(t2.uuid, { top: t1.top + 40 });
        await mountWithCleanup(FloorScreen);
        await waitFor(`.o_fp_canvas_inner #fpe-${t1.uuid}`);

        await click(`#fpe-${t1.uuid}`);
        await animationFrame();
        expect(store.selectedElementUuids).toEqual([t1.uuid]);
        expect(".o_fp_action_menu .o_align_top").toHaveCount(0);

        await keyDown("Control");
        await click(`#fpe-${t2.uuid}`);
        await keyUp("Control");
        await animationFrame();
        expect(store.selectedElementUuids).toEqual([t1.uuid, t2.uuid]);
        expect(".o_fp_shape.o_fp_multi_selected").toHaveCount(2);
        expect(".o_fp_handles .o_fp_rotation_handle").toHaveCount(0);
        expect(".o_fp_action_menu .o_align_top").toHaveCount(0);

        await click(".o_fp_action_menu .o_edit");
        await animationFrame();
        await click(".o_fp_edit_menu .o_align_top");
        await animationFrame();
        expect(t2.top).toBe(t1.top);

        const count = store.getFloorTables().length;
        await press("Delete");
        await animationFrame();
        expect(store.getFloorTables().length).toBe(count - 2);
        expect(queryAll(".o_fp_shape.o_fp_multi_selected")).toHaveLength(0);
        store.undo();
        await animationFrame();
        expect(store.getFloorTables().length).toBe(count);
    });

    test.tags("desktop");
    test("arrow keys move a multi selection in a single history step", async () => {
        await setupPosEnv();
        const store = getService("pos_floor_plan");
        store.startEditMode();
        const [t1, t2] = getTables(store);
        await mountWithCleanup(FloorScreen);
        await waitFor(`.o_fp_canvas_inner #fpe-${t1.uuid}`);
        const start = [t1.left, t2.left];

        store.selectElementsByUuid([t1.uuid, t2.uuid]);
        await animationFrame();
        await press("ArrowRight");
        await press("ArrowRight");
        await press("ArrowRight");
        expect([t1.left, t2.left]).toEqual([start[0] + 3, start[1] + 3]);
        await advanceTime(300);

        store.undo();
        expect([t1.left, t2.left]).toEqual(start);
    });

    test("library decors are drawn with their colors in the editor", async () => {
        onRpc(
            "/pos_restaurant/static/floor_plan/armchair.svg",
            () =>
                new Response(
                    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 110 90"><rect width="96" height="77" style="fill:var(--fp-fabric,#cdb79b)"/></svg>'
                )
        );
        await setupPosEnv();
        const store = getService("pos_floor_plan");
        store.startEditMode();
        const armchair = store.addDecor("image", { name: "armchair.svg", width: 110, height: 90 });
        await loadSvgAsset(armchair.url);
        await mountWithCleanup(FloorScreen);
        await waitFor(`#fpe-${armchair.uuid}`);
        const image = queryAll(`#fpe-${armchair.uuid}`)[0].style.backgroundImage;
        expect(image).toInclude("data:image/svg+xml,");
        expect(decodeURIComponent(image)).toInclude("fill:#cdb79b");
        store.updateElement(armchair.uuid, { colors: { fabric: "#123456" } });
        await animationFrame();
        expect(
            decodeURIComponent(queryAll(`#fpe-${armchair.uuid}`)[0].style.backgroundImage)
        ).toInclude("fill:#123456");
    });
});
