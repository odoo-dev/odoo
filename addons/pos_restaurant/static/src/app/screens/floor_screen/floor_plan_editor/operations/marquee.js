import { getEventCoords } from "@pos_restaurant/app/services/floor_plan/utils/utils";

const DRAG_THRESHOLD = 5;

export class MarqueeOperation {
    constructor({ event, canvasEl, marqueeEl, floorPlanStore }) {
        this.canvasEl = canvasEl;
        this.marqueeEl = marqueeEl;
        this.floorPlanStore = floorPlanStore;

        const coords = getEventCoords(event);
        const canvasRect = canvasEl.getBoundingClientRect();
        this.startX = coords.clientX - canvasRect.left;
        this.startY = coords.clientY - canvasRect.top;
        this.rect = { left: this.startX, top: this.startY, width: 0, height: 0 };
        this.started = false;
    }

    isStarted() {
        return this.started;
    }

    onMove(event) {
        const coords = getEventCoords(event);
        const canvasRect = this.canvasEl.getBoundingClientRect();
        const x = coords.clientX - canvasRect.left;
        const y = coords.clientY - canvasRect.top;

        if (!this.started) {
            const dx = x - this.startX;
            const dy = y - this.startY;
            if (Math.sqrt(dx * dx + dy * dy) < DRAG_THRESHOLD) {
                return;
            }
            this.started = true;
            if (this.marqueeEl) {
                this.marqueeEl.style.display = "block";
            }
        }

        this.rect = {
            left: Math.min(this.startX, x),
            top: Math.min(this.startY, y),
            width: Math.abs(x - this.startX),
            height: Math.abs(y - this.startY),
        };

        if (this.marqueeEl) {
            const style = this.marqueeEl.style;
            style.left = `${this.rect.left}px`;
            style.top = `${this.rect.top}px`;
            style.width = `${this.rect.width}px`;
            style.height = `${this.rect.height}px`;
        }
    }

    getSelectedUuids() {
        const { left, top, width, height } = this.rect;
        const right = left + width;
        const bottom = top + height;
        return this.floorPlanStore
            .getAllFloorElements()
            .filter((element) => {
                const bounds = element.getBounds();
                return (
                    bounds.left < right &&
                    bounds.right > left &&
                    bounds.top < bottom &&
                    bounds.bottom > top
                );
            })
            .map((element) => element.uuid);
    }

    stop() {
        if (this.marqueeEl) {
            this.marqueeEl.style.display = "none";
        }
        if (!this.started) {
            return false;
        }
        return { uuids: this.getSelectedUuids() };
    }
}
