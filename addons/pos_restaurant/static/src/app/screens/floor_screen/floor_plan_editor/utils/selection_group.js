import { FloorElement } from "@pos_restaurant/app/services/floor_plan/elements";
import { getElementsBounds } from "@pos_restaurant/app/services/floor_plan/utils/bounds_calculator";

export const SELECTION_GROUP_UUID = "selection";

export class SelectionGroup extends FloorElement {
    constructor(elements) {
        const { left, top, width, height } = getElementsBounds(elements);
        super({ uuid: SELECTION_GROUP_UUID, shape: "group", left, top, width, height });
        this.elements = elements;
        this.excludeUuids = new Set(elements.map((element) => element.uuid));
    }

    get isGroup() {
        return true;
    }

    isEditable() {
        return false;
    }

    isSideResizeAllowed() {
        return false;
    }

    isVerticalResizeAllowed() {
        return false;
    }

    isRotationAllowed() {
        return false;
    }
}
