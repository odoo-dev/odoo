import {
    getEventCoords,
    setElementTransform,
} from "@pos_restaurant/app/services/floor_plan/utils/utils";

const MIN_GROUP_SIZE = 40;
const MOVEMENT_THRESHOLD = 5;

export function scaleElementGeometry(floorElement, anchorX, anchorY, factor) {
    const { left, top, width, height, scale, isLine, isText } = floorElement;
    if (isLine) {
        const pivotY = top + height / 2;
        return {
            left: Math.round(anchorX + (left - anchorX) * factor),
            top: Math.round(anchorY + (pivotY - anchorY) * factor - height / 2),
            width: Math.round(width * factor),
            height,
            scale,
        };
    }
    const centerX = left + width / 2;
    const centerY = top + height / 2;
    const newCenterX = anchorX + (centerX - anchorX) * factor;
    const newCenterY = anchorY + (centerY - anchorY) * factor;
    if (isText) {
        return {
            left: Math.round(newCenterX - width / 2),
            top: Math.round(newCenterY - height / 2),
            width,
            height,
            scale: Math.max(1, scale * factor),
        };
    }
    const newWidth = Math.round(width * factor);
    const newHeight = Math.round(height * factor);
    return {
        left: Math.round(newCenterX - newWidth / 2),
        top: Math.round(newCenterY - newHeight / 2),
        width: newWidth,
        height: newHeight,
        scale,
    };
}

export class GroupResizeOperation {
    constructor({ elements, selectionGroup, position, event, handles }) {
        this.items = elements;
        this.group = selectionGroup;
        this.position = position;
        this.handles = handles;

        const coords = getEventCoords(event);
        this.startClientX = coords.clientX;
        this.startClientY = coords.clientY;

        const { left, top, width, height } = selectionGroup;
        const right = left + width;
        const bottom = top + height;
        this.anchorX = position.includes("w") ? right : left;
        this.anchorY = position.includes("n") ? bottom : top;
        this.diagX = (position.includes("w") ? left : right) - this.anchorX;
        this.diagY = (position.includes("n") ? top : bottom) - this.anchorY;
        this.diagLength = Math.sqrt(this.diagX * this.diagX + this.diagY * this.diagY) || 1;
        this.minFactor = Math.min(1, MIN_GROUP_SIZE / Math.max(width, height, 1));

        this.resizeStarted = false;
        this.factor = 1;
    }

    isStarted() {
        return this.resizeStarted;
    }

    onMove(event) {
        const coords = getEventCoords(event);
        const dx = coords.clientX - this.startClientX;
        const dy = coords.clientY - this.startClientY;

        if (!this.resizeStarted) {
            if (Math.sqrt(dx * dx + dy * dy) < MOVEMENT_THRESHOLD) {
                return;
            }
            this.resizeStarted = true;
            this.handles.startAction("resize-" + this.position);
        }

        const projection = (dx * this.diagX + dy * this.diagY) / this.diagLength;
        this.factor = Math.max(this.minFactor, 1 + projection / this.diagLength);
        this.applyFactor(this.factor);
    }

    applyFactor(factor) {
        for (const { el, floorElement } of this.items) {
            const geo = scaleElementGeometry(floorElement, this.anchorX, this.anchorY, factor);
            el.style.width = `${geo.width}px`;
            el.style.height = `${geo.height}px`;
            setElementTransform(el, geo.left, geo.top, floorElement.rotation, geo.scale);
        }
        const groupGeo = scaleElementGeometry(this.group, this.anchorX, this.anchorY, factor);
        this.handles.follow(groupGeo);
    }

    stop() {
        this.handles.endAction();
        if (!this.resizeStarted) {
            return false;
        }
        return {
            updates: this.items.map(({ floorElement }) => ({
                uuid: floorElement.uuid,
                data: scaleElementGeometry(floorElement, this.anchorX, this.anchorY, this.factor),
            })),
        };
    }
}
