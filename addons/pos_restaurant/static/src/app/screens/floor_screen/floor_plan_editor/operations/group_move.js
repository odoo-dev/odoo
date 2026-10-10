import {
    getEventCoords,
    setElementTransform,
} from "@pos_restaurant/app/services/floor_plan/utils/utils";
import { calculateBoundsFromTransform } from "@pos_restaurant/app/services/floor_plan/utils/bounds_calculator";
import {
    constrainPositionToCanvas,
    expandBoard,
    snapPosition,
} from "@pos_restaurant/app/screens/floor_screen/floor_plan_editor/operations/move";

const DRAG_THRESHOLD = 5;

export class GroupMoveOperation {
    constructor({ elements, selectionGroup, event, canvasEl, snapping, handles }) {
        this.items = elements.map(({ el, floorElement }) => ({
            el,
            floorElement,
            startLeft: floorElement.left,
            startTop: floorElement.top,
        }));
        this.group = selectionGroup;
        this.canvasEl = canvasEl;
        this.snapping = snapping;
        this.handles = handles;

        const coords = getEventCoords(event);
        this.startClientX = coords.clientX;
        this.startClientY = coords.clientY;
        this.dragStarted = false;
        this.isEnded = false;
        this.delta = { dx: 0, dy: 0 };
    }

    isStarted() {
        return this.dragStarted && !this.isEnded;
    }

    onMove(event) {
        if (this.isEnded) {
            return;
        }
        const coords = getEventCoords(event);
        const dx = coords.clientX - this.startClientX;
        const dy = coords.clientY - this.startClientY;

        if (!this.dragStarted) {
            if (Math.sqrt(dx * dx + dy * dy) < DRAG_THRESHOLD) {
                return;
            }
            this.dragStarted = true;
            this.handles.startAction("move");
        }

        this.doMove(this.group.left + dx, this.group.top + dy, event.ctrlKey || event.metaKey);
    }

    doMove(newLeft, newTop, skipSnapping = false) {
        const geo = { ...this.group.getGeometry(), left: newLeft, top: newTop };
        let bounds = calculateBoundsFromTransform(geo);
        let xGuides = [];
        let yGuides = [];

        if (!skipSnapping) {
            const snapped = snapPosition(this.snapping, this.group, geo, bounds);
            ({ left: geo.left, top: geo.top, xGuides, yGuides } = snapped);
            bounds = calculateBoundsFromTransform(geo);
        }

        const position = constrainPositionToCanvas(geo.left, geo.top, bounds, this.canvasEl);
        geo.left = Math.round(position.left);
        geo.top = Math.round(position.top);
        bounds = calculateBoundsFromTransform(geo);

        this.delta = { dx: geo.left - this.group.left, dy: geo.top - this.group.top };
        for (const item of this.items) {
            setElementTransform(
                item.el,
                item.startLeft + this.delta.dx,
                item.startTop + this.delta.dy,
                item.floorElement.rotation,
                item.floorElement.scale
            );
        }
        this.handles.follow({ left: geo.left, top: geo.top });
        this.snapping.drawGuides(xGuides, yGuides, bounds);
        expandBoard(this.canvasEl, bounds.right, bounds.bottom);
    }

    stop() {
        this.isEnded = true;
        if (!this.dragStarted) {
            return false;
        }
        this.handles.endAction();
        this.snapping.clearGuides();
        const { dx, dy } = this.delta;
        return {
            updates: this.items.map((item) => ({
                uuid: item.floorElement.uuid,
                data: { left: item.startLeft + dx, top: item.startTop + dy },
            })),
        };
    }
}
