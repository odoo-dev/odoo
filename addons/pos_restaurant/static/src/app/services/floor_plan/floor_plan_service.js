import { Reactive } from "@web/core/utils/reactive";
import { uuid } from "@web/core/utils/strings";
import { History } from "./utils/history";
import { registry } from "@web/core/registry";

import {
    Floor,
    FloorTable,
    Line,
    Decor,
    Image,
    OnlyBorderDecor,
    Text,
    SHAPE_TYPES,
    DEFAULT_FLOOR_COLOR_KEY,
    DEFAULT_FLOOR_COLOR_OPACITY,
} from "./elements";
import { SIZES } from "@web/core/ui/ui_utils";
import { AlertDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { _t } from "@web/core/l10n/translation";
import { applyDefaults, convertObjectUrlToDataUrl } from "./utils/utils";
import { getElementsBounds } from "./utils/bounds_calculator";

const DEFAULT_TABLE_COLOR_KEY = "green";
const DEFAULT_SEATS_NUMBER = 2;
const ALIGN_X_MODES = ["left", "center", "right"];
const ALIGN_BOUNDS_KEY = {
    left: "left",
    center: "centerX",
    right: "right",
    top: "top",
    middle: "centerY",
    bottom: "bottom",
};
export class FloorPlanStore extends Reactive {
    constructor() {
        super();
        this.selectedFloor = null;
        this.editMode = false;
        this.storedFloorPlanStyle = localStorage.getItem("floorPlanStyle");
    }

    init(pos) {
        this.pos = pos;
        const selectedFloorUuid = this.selectedFloor?.uuid;
        const { floor_plan: plan } = this.pos.config;
        const settings = plan.settings || {};

        this.defaultTableColor = settings.defaultTableColor || DEFAULT_TABLE_COLOR_KEY;
        this.defaultFloorColor = settings.defaultFloorColor || DEFAULT_FLOOR_COLOR_KEY;
        this.defaultFloorColorOpacity =
            settings.defaultFloorColorOpacity || DEFAULT_FLOOR_COLOR_OPACITY;
        this.defaultDecorValues = new Map();
        if (settings.defaultDecorValues) {
            // defaultDecorValues in saved plan is an object not a map
            Object.entries(settings.defaultDecorValues).forEach(([key, value]) => {
                this.defaultDecorValues.set(key, value);
            });
        }
        this.floors = [];
        plan.floors?.forEach((floorData) => {
            this.restoreFloor(floorData);
        });

        const floorToSelect =
            this.floors.find((f) => f.uuid === selectedFloorUuid) || this.floors[0];
        this.selectFloorByUuid(floorToSelect);
    }

    async discardChanges() {
        if (this.editState?.refreshOnDiscard) {
            await this.refreshFloorPlan(false);
        } else {
            this.init(this.pos);
        }
        this.setEditMode(false);
    }

    async save() {
        this.ui.block();
        try {
            const { floorsData, images } = this.collectFloorData();
            for (const { floorData, image } of images) {
                const { url } = image;
                if (this.imageObjectUrls.has(url)) {
                    const objectUrl = this.imageObjectUrls.get(image.url);
                    const dataUrl = await convertObjectUrlToDataUrl(objectUrl);
                    const { id } = await this.pos.data.call(
                        "restaurant.floor",
                        "add_floor_plan_image",
                        [image.name || "", dataUrl.split(",")[1]]
                    );
                    image.id = id;
                    floorData.newImages ??= [];
                    floorData.newImages.push(id);
                    delete image.name; // the name is not needed anymore for custom image
                }
                delete image.url;
            }

            const data = {
                floors: floorsData,
                settings: {
                    defaultTableColor: this.defaultTableColor,
                    defaultFloorColor: this.defaultFloorColor,
                    defaultFloorColorOpacity: this.defaultFloorColorOpacity,
                    defaultDecorValues: Object.fromEntries(this.defaultDecorValues),
                },
            };

            const result = await this.pos.data.call(
                "pos.config",
                "save_floor_plan",
                [this.pos.config.id],
                {
                    floor_plan: data,
                    context: { device_identifier: this.pos.device.identifier },
                }
            );

            this.updateFloorPlan(result);
            this.setEditMode(false);
        } finally {
            this.ui.unblock();
        }
    }

    collectFloorData() {
        const floorsData = [];
        const images = [];

        for (const floor of this.floors) {
            const floorData = floor.raw;
            floorsData.push(floorData);

            if (floorData.bgImage) {
                images.push({ floorData, image: floorData.bgImage });
            }

            for (const decor of floorData.decorations ?? []) {
                if (decor.shape === "image") {
                    images.push({ floorData, image: decor });
                }
            }
        }

        return { floorsData, images };
    }

    updateFloorPlan({ records, config }) {
        this.pos.models.connectNewData(records);
        this.pos.config.update(config);
        this.pos.data.synchronizeServerDataInIndexedDB(records);
        this.init(this.pos);
    }

    async refreshFloorPlan(isSyncUpdate) {
        if (isSyncUpdate && this.editState) {
            //Do not refresh if in edit mode during sync update
            this.editState.refreshOnDiscard = true;
            return;
        }

        const result = await this.pos.data.call("pos.config", "get_floor_plan", [
            this.pos.config.id,
        ]);
        this.updateFloorPlan(result);
    }

    isKanban() {
        return !this.storedFloorPlanStyle
            ? !!this.ui.isSmall
            : this.storedFloorPlanStyle === "kanban";
    }

    isEmpty() {
        return this.floors.length === 0;
    }

    toggleFloorPlanStyle() {
        const isKanban = !this.isKanban();
        this.storedFloorPlanStyle = isKanban ? "kanban" : "default";
        localStorage.setItem("floorPlanStyle", this.storedFloorPlanStyle);
    }

    startEditMode() {
        this.setEditMode(true);
    }

    setEditMode(value) {
        if (this.editMode === value) {
            return;
        }
        this.editMode = value;
        if (this.editMode) {
            this.showEditToolbar = true;
            let nextTableNumber = 1;
            if (this.selectedFloor) {
                nextTableNumber = this.selectedFloor.getMaxTableNumber() + 1;
            }
            this.editState = {
                history: new History(),
                historyTransactionMap: new Map(),
                nextTableNumber,
                selectedElement: null,
                selectedElements: [],
                elementEditMode: false,
                floorEditMode: false,
                imageObjectUrls: new Map(),
            };
            if (this.floors.length === 0) {
                this.addFloor(_t("Main Floor"), false);
            }
        } else {
            this.editState?.imageObjectUrls.forEach((url) => {
                URL.revokeObjectURL(url);
            });
            //showEditToolbar will be set to false when the animation ends
            this.editState = null;
        }
    }

    isEditToolbarVisible() {
        return this.editMode || this.showEditToolbar; //Only hide toolbar when the transition ends
    }

    createFloor(data) {
        data = applyDefaults(data, {
            bgColor: this.defaultFloorColor,
            bgColorOpacity: this.defaultFloorColorOpacity,
            ...data,
        });

        if (!data.uuid) {
            data.uuid = uuid(); // For new and legacy floor without uuid
        }

        if (data.id) {
            const floorModeObj = this.pos.models["restaurant.floor"].get(data.id);
            if (floorModeObj) {
                if (data.name == null) {
                    data.name = floorModeObj.name;
                }
                data.record = floorModeObj;
            }
        }

        return new Floor(data);
    }

    createTable(data) {
        data = applyDefaults(data, {
            color: this.defaultTableColor,
            shape: SHAPE_TYPES.RECTANGLE,
            ...data,
        });

        if (!data.uuid) {
            data.uuid = uuid(); // For new and legacy tables without uuid
        }

        if (data.id) {
            const floorModeObj = this.pos.models["restaurant.table"].get(data.id);
            if (floorModeObj) {
                if (data.table_number == null) {
                    data.table_number = floorModeObj.table_number;
                }
                if (data.seats == null && floorModeObj.seats != null) {
                    data.seats = floorModeObj.seats;
                }
                data.record = floorModeObj;
            }
        }
        return new FloorTable(data);
    }

    addFloor(name, history = true) {
        const storeOldData = this.historySnapShot();
        const floor = this.createFloor({ name: name });
        this.floors.push(floor);
        this.selectFloorByUuid(floor.uuid);

        if (history) {
            this.addHistory({
                type: "add_floor",
                uuid: floor.uuid,
                new: floor.raw,
                store: {
                    old: storeOldData,
                    new: this.historySnapShot(),
                },
            });
        }

        return floor;
    }

    getDefaultValuesForGroup(groupName) {
        return this.defaultDecorValues.get(groupName) || {};
    }

    historySnapShot() {
        return {
            nextTableNumber: this.nextTableNumber,
            selectedFloorUuid: this.selectedFloor?.uuid,
            defaultTableColor: this.defaultTableColor,
            selectedElementUuid: this.selectedElement?.uuid,
            elementEditMode: this.elementEditMode,
        };
    }

    addTable(shape, shapeData = {}, positionFn = null) {
        const storeOldData = this.historySnapShot();
        const tableNumber = this.editState.nextTableNumber++;
        const data = {
            ...shapeData,
            uuid: uuid(),
            id: null,
            seats: DEFAULT_SEATS_NUMBER,
            table_number: tableNumber,
            shape: shape,
        };

        const table = this.createTable(data);
        if (positionFn) {
            const position = positionFn(table);
            table.left = position.left;
            table.top = position.top;
        }

        this.selectedFloor.addTable(table);
        this.selectElementByUuid(table.uuid);

        this.addHistory({
            type: "add_element",
            uuid: table.uuid,
            isTable: true,
            store: {
                old: storeOldData,
                new: this.historySnapShot(),
            },
            new: table.raw,
        });

        return table;
    }

    addHistory(entry) {
        if (this.batchedHistoryEntries) {
            this.batchedHistoryEntries.push(entry);
        } else {
            this.history.add(entry);
        }
    }

    batchHistory(fn) {
        if (this.batchedHistoryEntries) {
            return fn();
        }
        this.batchedHistoryEntries = [];
        let result;
        try {
            result = fn();
        } finally {
            const entries = this.batchedHistoryEntries;
            this.batchedHistoryEntries = null;
            if (entries.length === 1) {
                this.history.add(entries[0]);
            } else if (entries.length > 1) {
                this.history.add({ type: "batch", entries });
            }
        }
        return result;
    }

    addDecorGroup(parts, { left, top }) {
        const decors = this.batchHistory(() => {
            const created = parts.map((part) =>
                this.addDecor("image", { ...part, left: left + part.left, top: top + part.top })
            );
            this.groupElements(created.map((decor) => decor.uuid));
            return created;
        });
        this.selectElementsByUuid(decors.map((decor) => decor.uuid));
        return decors;
    }

    removeElements(uuids) {
        this.batchHistory(() => {
            for (const uuid of uuids) {
                this.removeElement(uuid);
            }
        });
    }

    duplicateElements(uuids) {
        const newGroupIds = new Map();
        const elements = this.batchHistory(() =>
            uuids
                .map((elementUuid) => {
                    const element = this.getElementByUuid(elementUuid);
                    const overrides = {};
                    if (element?.groupId) {
                        if (!newGroupIds.has(element.groupId)) {
                            newGroupIds.set(element.groupId, uuid());
                        }
                        overrides.groupId = newGroupIds.get(element.groupId);
                    }
                    return this.duplicateElement(elementUuid, overrides);
                })
                .filter(Boolean)
        );
        this.selectElements(elements);
        return elements;
    }

    updateElements(updates, options = {}) {
        this.batchHistory(() => {
            for (const { uuid, data } of updates) {
                this.updateElement(uuid, data, options);
            }
        });
    }

    alignElements(uuids, mode) {
        const elements = uuids
            .map((uuid) => this.selectedFloor?.getElementByUuid(uuid))
            .filter(Boolean);
        if (elements.length < 2) {
            return;
        }
        const units = [];
        const groups = new Map();
        for (const element of elements) {
            if (!element.groupId) {
                units.push([element]);
            } else if (groups.has(element.groupId)) {
                groups.get(element.groupId).push(element);
            } else {
                const unit = [element];
                groups.set(element.groupId, unit);
                units.push(unit);
            }
        }
        const key = ALIGN_BOUNDS_KEY[mode];
        const axis = ALIGN_X_MODES.includes(mode) ? "left" : "top";
        const target = getElementsBounds(elements)[key];
        const updates = [];
        for (const unit of units) {
            const delta = Math.round(target - getElementsBounds(unit)[key]);
            if (delta) {
                for (const element of unit) {
                    updates.push({ uuid: element.uuid, data: { [axis]: element[axis] + delta } });
                }
            }
        }
        this.updateElements(updates);
    }

    canUndo() {
        if (!this.editMode) {
            return false;
        }
        return this.history.canUndo();
    }

    canRedo() {
        if (!this.editMode) {
            return false;
        }
        return this.history.canRedo();
    }

    undo() {
        const data = this.history.undo();
        if (!data) {
            return;
        }
        this.applyUndo(data);
    }

    applyUndo(data) {
        switch (data.type) {
            case "batch":
                for (let i = data.entries.length - 1; i >= 0; i--) {
                    this.applyUndo(data.entries[i]);
                }
                break;
            case "add_element":
                this.selectedFloor.removeElement(data.uuid);
                break;
            case "add_floor":
                this.floors = this.floors.filter((f) => f.uuid !== data.uuid);
                break;
            case "update_element":
                this.updateElementFromHistory(data.uuid, data.old);
                break;
            case "update_floor":
                this.updateFloorFromHistory(data.uuid, data.old);
                break;
            case "move_layer": {
                const floor = this.getFloorByUuid(data.floorUuid);
                if (floor && data.old !== null) {
                    floor.setDecorPosition(data.uuid, data.old);
                }
                break;
            }
            case "remove_element":
                if (data.isTable) {
                    this.selectedFloor.addTable(this.createTable(data.old));
                } else {
                    this.selectedFloor.addDecor(this.createDecorFromData(data.old));
                }
                break;

            case "remove_floor": {
                this.restoreFloor(data.old);
                break;
            }
        }
        this.restoreHistorySnapshot(data.store?.old);
    }

    redo() {
        const data = this.history.redo();
        if (!data) {
            return;
        }
        this.applyRedo(data);
    }

    applyRedo(data) {
        this.restoreHistorySnapshot(data.store?.new);
        switch (data.type) {
            case "batch":
                for (const entry of data.entries) {
                    this.applyRedo(entry);
                }
                break;
            case "add_element":
                if (data.isTable) {
                    this.selectedFloor.addTable(this.createTable(data.new));
                } else {
                    this.selectedFloor.addDecor(this.createDecorFromData(data.new));
                }
                break;
            case "add_floor":
                this.restoreFloor(data.new);
                this.restoreHistorySnapshot(data.store?.new); //Required after for the selecting the correct floor
                break;
            case "update_element":
                this.updateElementFromHistory(data.uuid, data.new);
                break;
            case "update_floor":
                this.updateFloorFromHistory(data.uuid, data.new);
                break;
            case "move_layer": {
                const floor = this.getFloorByUuid(data.floorUuid);
                if (floor && data.new !== null) {
                    floor.setDecorPosition(data.uuid, data.new);
                }
                break;
            }
            case "remove_element":
                this.selectedFloor.removeElement(data.uuid);
                break;
            case "remove_floor":
                this.floors = this.floors.filter((f) => f.uuid !== data.uuid);
                break;
        }
    }

    updateElementFromHistory(uuid, data) {
        const element = this.selectedFloor.getElementByUuid(uuid);
        if (!element) {
            return;
        }
        const oldEditing = element.editing;
        element.onEdit(false); // Mainly for text element (to update the text content)
        Object.assign(element, data);
        if (oldEditing) {
            element.onEdit(true);
        }
    }

    updateFloorFromHistory(uuid, data) {
        const floor = this.getFloorByUuid(uuid);
        if (!floor) {
            return;
        }
        Object.assign(floor, data);
    }

    restoreHistorySnapshot(snapshot) {
        if (!snapshot) {
            return;
        }
        const { selectedElementUuid, selectedFloorUuid, ...rest } = snapshot;
        if (selectedFloorUuid) {
            this.selectFloorByUuid(selectedFloorUuid);
        }
        this.selectElementByUuid(selectedElementUuid);
        Object.assign(this, rest);
    }

    checkNewTableNumber(number) {
        if (number >= this.nextTableNumber) {
            this.nextTableNumber = number + 1;
        }
    }

    addDecor(shape, data = {}, positionFn = null) {
        const storeOldData = this.historySnapShot();
        const decorData = {
            ...data,
            uuid: uuid(),
            shape: shape || SHAPE_TYPES.RECTANGLE,
        };

        const decor = this.createDecorFromData(decorData);
        if (positionFn) {
            const position = positionFn(decor);
            decor.left = position.left;
            decor.top = position.top;
        }
        this.selectedFloor.addDecor(decor);
        this.selectElementByUuid(decor.uuid);

        this.addHistory({
            type: "add_element",
            uuid: decor.uuid,
            store: {
                old: storeOldData,
                new: this.historySnapShot(),
            },
            new: decor.raw,
        });

        return decor;
    }

    createDecorFromData(data) {
        let decor;
        const { shape } = data;
        if (shape === "line") {
            decor = new Line(data);
        } else if (shape === "image") {
            const { objectUrl, ...imgData } = data;
            if (objectUrl) {
                this.imageObjectUrls.set(imgData.url, objectUrl);
            }
            decor = new Image(imgData);
        } else if (shape === "text") {
            decor = new Text(data);
        } else if (shape === "rect" && data.onlyBorder) {
            decor = new OnlyBorderDecor(data);
        } else {
            decor = new Decor(data);
        }
        return decor;
    }

    removeElement(uuid) {
        const element = this.selectedFloor.getElementByUuid(uuid);
        if (!element) {
            return;
        }

        if (element instanceof FloorTable && element.id) {
            const hasDraftOrder = element.record.getOrders().find((o) => o.state === "draft");
            if (hasDraftOrder) {
                this.dialog.add(AlertDialog, {
                    title: _t("Warning"),
                    body: _t(
                        "You cannot delete a table with orders still in draft for this table."
                    ),
                });
                return;
            }
        }
        this.selectedFloor.removeElement(uuid);
        const storeOldData = this.historySnapShot();

        if (element instanceof FloorTable && element.tableNumber === this.nextTableNumber - 1) {
            this.nextTableNumber--;
        }

        if (this.selectedElements.includes(element)) {
            this.selectElements(this.selectedElements.filter((el) => el !== element));
        }

        if (element.editing) {
            this.elementEditMode = false;
        }

        this.historyTransactionMap.delete(uuid);
        this.addHistory({
            type: "remove_element",
            uuid: element.uuid,
            isTable: element.isTable,
            store: {
                old: storeOldData,
                new: this.historySnapShot(),
            },
            old: element.raw,
        });
    }

    async removeFloor(uuid) {
        const floorIndex = this.floors.findIndex((f) => f.uuid === uuid);

        if (floorIndex < 0) {
            return false;
        }

        if (this.floors.length === 1) {
            return;
        }

        const floor = this.floors[floorIndex];
        if (floor.id) {
            const hasDraftOrder = floor.record.table_ids.find((t) =>
                t.getOrders().find((o) => o.state === "draft")
            );
            if (hasDraftOrder) {
                this.dialog.add(AlertDialog, {
                    title: _t("Warning"),
                    body: _t(
                        "You cannot delete a floor with orders still in draft for this floor."
                    ),
                });
                return;
            }
        }

        const storeOldData = this.historySnapShot();
        this.floors.splice(floorIndex, 1);
        this.selectFloorByUuid(this.floors[0]);

        this.addHistory({
            type: "remove_floor",
            uuid: floor.uuid,

            store: {
                old: storeOldData,
                new: this.historySnapShot(),
            },
            old: floor.raw,
        });

        return true;
    }

    selectFloorByUuid(uuid) {
        this.selectedFloor = uuid instanceof Floor ? uuid : this.getFloorByUuid(uuid);
        if (this.editMode) {
            this.endEditSelectedElement();
            this.selectElementByUuid(null);
            if (this.selectedFloor) {
                this.nextTableNumber = this.selectedFloor.getMaxTableNumber() + 1;
            }
        }
    }

    selectFloorById(id) {
        const floor = this.floors.find((s) => s.id === id);
        this.selectFloorByUuid(floor?.uuid);
    }

    getSelectedFloor() {
        return this.selectedFloor;
    }

    selectElementByUuid(uuid, { toggle = false, expandGroups = true } = {}) {
        if (toggle && uuid) {
            this.toggleElementSelection(uuid, expandGroups);
            return;
        }

        const oldSelectedId = this.selectedElement?.uuid;
        if (oldSelectedId === uuid && this.selectedElements.length <= 1) {
            return;
        }

        // Remember if we were in edit mode
        const wasInEditMode = this.elementEditMode;

        const element = this.selectedFloor?.getElementByUuid(uuid);
        this.selectElements(element ? [element] : [], element, expandGroups);

        // If we were in edit mode, automatically open edit mode for the new element
        if (wasInEditMode && this.selectedElement?.isEditable()) {
            this.startEditSelectedElement();
        }
    }

    toggleElementSelection(uuid, expandGroups = true) {
        const element = this.selectedFloor?.getElementByUuid(uuid);
        if (!element) {
            return;
        }
        const members = expandGroups ? this.expandToGroups([element]) : [element];
        const selected = this.selectedElements.filter((el) => !members.includes(el));
        if (selected.length === this.selectedElements.length) {
            selected.push(...members);
        }
        this.selectElements(selected, element, false);
    }

    selectElements(elements, primary = null, expandGroups = true) {
        if (this.selectedElement) {
            this.endEditSelectedElement();
        }
        if (expandGroups) {
            elements = this.expandToGroups(elements);
        }
        if (primary && elements.includes(primary)) {
            elements = [...elements.filter((el) => el !== primary), primary];
        }
        this.selectedElements = elements;
        this.selectedElement = elements.length ? elements[elements.length - 1] : null;
    }

    selectElementsByUuid(uuids, expandGroups = true) {
        const elements = uuids
            .map((uuid) => this.selectedFloor?.getElementByUuid(uuid))
            .filter(Boolean);
        this.selectElements(elements, null, expandGroups);
    }

    expandToGroups(elements) {
        const groupIds = new Set(elements.map((el) => el.groupId).filter(Boolean));
        if (!groupIds.size) {
            return elements;
        }
        const result = [...elements];
        const uuids = new Set(elements.map((el) => el.uuid));
        for (const element of this.getAllFloorElements()) {
            if (groupIds.has(element.groupId) && !uuids.has(element.uuid)) {
                result.push(element);
            }
        }
        return result;
    }

    getGroupElements(groupId) {
        return groupId ? this.getAllFloorElements().filter((el) => el.groupId === groupId) : [];
    }

    isElementSelected(element) {
        return this.editState?.selectedElements.includes(element) || false;
    }

    get hasMultiSelection() {
        return (this.editState?.selectedElements.length || 0) > 1;
    }

    get selectedElementUuids() {
        return this.editState?.selectedElements.map((el) => el.uuid) || [];
    }

    get isSelectionGrouped() {
        const elements = this.selectedElements;
        const groupId = elements[0]?.groupId;
        return (
            !!groupId &&
            elements.length > 1 &&
            elements.every((el) => el.groupId === groupId) &&
            this.getGroupElements(groupId).length === elements.length
        );
    }

    get canGroupSelection() {
        return this.hasMultiSelection && !this.isSelectionGrouped;
    }

    groupElements(uuids) {
        if (uuids.length < 2) {
            return null;
        }
        const groupId = uuid();
        this.updateElements(uuids.map((elementUuid) => ({ uuid: elementUuid, data: { groupId } })));
        return groupId;
    }

    ungroupElements(uuids) {
        this.updateElements(
            uuids.map((elementUuid) => ({ uuid: elementUuid, data: { groupId: null } }))
        );
    }

    toggleEditSelectedElement() {
        if (this.elementEditMode) {
            this.endEditSelectedElement();
            return;
        }
        this.startEditSelectedElement();
    }

    startEditSelectedElement() {
        this.floorEditMode = false;
        if (this.selectedElement && !this.hasMultiSelection) {
            this.selectedElement.onEdit(true);
        }
        this.elementEditMode = true;
    }

    endEditSelectedElement() {
        this.floorEditMode = false;
        if (this.selectedElement) {
            this.selectedElement.onEdit(false);
        }
        this.elementEditMode = false;
    }

    startEditFloor() {
        this.elementEditMode = false;
        this.floorEditMode = !this.floorEditMode;
    }

    endEditFloor() {
        this.floorEditMode = false;
    }

    getSelectedElement() {
        return this.selectedElement;
    }

    get selectedElementUuid() {
        return this.selectedElement?.uuid;
    }

    getFloorByUuid(uuid) {
        return this.floors.find((s) => s.uuid === uuid);
    }

    getFloorTables() {
        return this.selectedFloor?.getTables() || [];
    }

    getFloorDecorElements() {
        return this.selectedFloor?.getDecorElements() || [];
    }

    getElementByUuid(uuid) {
        let element = this.selectedFloor?.getElementByUuid(uuid);
        if (!element) {
            for (const floor of this.floors) {
                element = floor.getElementByUuid(uuid);
                if (element) {
                    break;
                }
            }
        }
        return element;
    }

    duplicateElement(uuid, overrides = {}) {
        let result;
        const element = this.getElementByUuid(uuid);
        if (element) {
            const duplicatedData = {
                ...element.raw,
                left: element.left + 20,
                top: element.top + 20,
                uuid: null,
                ...overrides,
            };

            if (element.isTable) {
                duplicatedData.id = null;
                result = this.addTable(element.shape, duplicatedData);
            } else {
                // keep the id for image decor element duplication
                result = this.addDecor(element.shape, duplicatedData);
            }
        }
        return result;
    }

    getAllFloorElements() {
        return this.selectedFloor?.getAllElements() || [];
    }

    moveLayer(uuid, direction) {
        if (!this.selectedFloor) {
            return false;
        }
        const element = this.selectedFloor.getElementByUuid(uuid);
        if (!element) {
            return false;
        }

        const oldPosition = this.selectedFloor.getDecorPosition(uuid);
        const moved = this.selectedFloor.moveDecor(uuid, direction);
        if (!moved) {
            return false;
        }

        const newPosition = this.selectedFloor.getDecorPosition(uuid);
        this.addHistory({
            type: "move_layer",
            floorUuid: this.selectedFloor.uuid,
            uuid: uuid,
            old: oldPosition,
            new: newPosition,
        });

        return true;
    }

    getChangedProperties(target, newData) {
        let changed = null;
        for (const key in newData) {
            if (target[key] !== newData[key]) {
                if (!changed) {
                    changed = {};
                }
                changed[key] = newData[key];
            }
        }
        return changed;
    }

    getOldValues(target, changedKeys) {
        return changedKeys.reduce((obj, key) => {
            obj[key] = target[key];
            return obj;
        }, {});
    }

    updateFloor(uuid, data, options = {}) {
        const { batched = false } = options;
        const floor = this.getFloorByUuid(uuid);
        if (!floor) {
            return;
        }
        const transactionId = "floor-" + uuid;
        if (batched) {
            this.startHistoryTransaction(transactionId, floor, data);
            return;
        }

        data = this.commitHistoryTransaction(transactionId, floor, data);

        const changedData = this.getChangedProperties(floor, data);

        if (!changedData) {
            return; // No changes
        }

        const oldValues = this.getOldValues(floor, Object.keys(changedData));

        if ("bgColor" in changedData) {
            this.defaultFloorColor = changedData.bgColor;
        }
        if ("bgColorOpacity" in changedData) {
            this.defaultFloorColorOpacity = changedData.bgColorOpacity;
        }
        if ("bgImage" in changedData) {
            const newBgImage = changedData.bgImage;
            //Do not revoke old url as it can be restored from history
            if (newBgImage?.objectUrl) {
                const { objectUrl, ...bgImgData } = newBgImage;
                this.imageObjectUrls.set(newBgImage.url, objectUrl);
                changedData.bgImage = bgImgData;
            }
        }

        Object.assign(floor, changedData);
        this.addHistory({
            type: "update_floor",
            uuid: uuid,
            old: oldValues,
            new: changedData,
        });
    }

    startHistoryTransaction(uuid, el, data) {
        // Accumulate changes in a transaction map to be applied later as a single history entry.
        let historyTransaction = this.historyTransactionMap.get(uuid);
        if (!historyTransaction) {
            historyTransaction = {
                oldValues: {},
                newValues: {},
            };
            this.historyTransactionMap.set(uuid, historyTransaction);
        }
        for (const key in data) {
            if (!(key in historyTransaction.oldValues)) {
                historyTransaction.oldValues[key] = el[key];
            }
        }
        Object.assign(historyTransaction.newValues, data);
        Object.assign(el, data);
    }

    commitHistoryTransaction(uuid, el, data) {
        const transactionElement = this.historyTransactionMap.get(uuid);
        if (transactionElement) {
            const oldValues = transactionElement.oldValues;
            const newValues = transactionElement.newValues;
            this.historyTransactionMap.delete(uuid);

            for (const key in newValues) {
                el[key] = oldValues[key]; // revert to old value before applying the final update
            }
            data = { ...newValues, ...data };
        }
        return data;
    }

    updateElement(uuid, data, options = {}) {
        const { batched = false, setDefaultValueForGroup = false } = options;

        const el = this.selectedFloor.getElementByUuid(uuid);
        if (!el) {
            return;
        }

        if (batched) {
            this.startHistoryTransaction(uuid, el, data);
            return;
        }

        data = this.commitHistoryTransaction(uuid, el, data);
        const changedData = this.getChangedProperties(el, data);

        if (!changedData) {
            return; // No changes
        }

        const oldSnapShot = this.historySnapShot();
        const oldValues = this.getOldValues(el, Object.keys(changedData));

        Object.assign(el, changedData);

        let storeUpdate = false;
        if (el.isTable) {
            if ("table_number" in changedData) {
                this.checkNewTableNumber(changedData.tableNumber);
                storeUpdate = true;
            }
            if ("color" in changedData) {
                this.defaultTableColor = changedData.color;
                storeUpdate = true;
            }
        } else if (setDefaultValueForGroup && el.group) {
            //Save default value for grouped element (wall, ...)
            const groupName = el.group;
            let values = this.defaultDecorValues.get(groupName);
            if (!values) {
                values = {};
                this.defaultDecorValues.set(groupName, values);
            }
            Object.assign(values, changedData);
        }

        let storeData = null;
        if (storeUpdate) {
            storeData = {
                old: oldSnapShot,
                new: this.historySnapShot(),
            };
        }

        this.addHistory({
            type: "update_element",
            uuid: uuid,
            old: oldValues,
            new: changedData,
            store: storeData,
        });
    }

    isContentEditableTextEnabled() {
        return this.ui.size > SIZES.XS;
    }

    restoreFloor(data) {
        const floor = this.createFloor(data);
        data.tables?.forEach((tableData) => {
            const table = this.createTable(tableData);
            floor.addTable(table);
        });
        data.decorations?.forEach((decorData) => {
            const decor = this.createDecorFromData(decorData);
            floor.addDecor(decor);
        });
        this.floors.push(floor);
    }

    storeFloorScrollPosition(floorId, position) {
        if (!floorId) {
            return;
        }
        this.floorScrollPositions = this.floorScrollPositions || {};
        this.floorScrollPositions[floorId] = position;
    }

    getFloorScrollPositions(floorId) {
        if (!floorId || !this.floorScrollPositions) {
            return;
        }
        return this.floorScrollPositions[floorId];
    }

    get history() {
        return this.editState.history;
    }

    get historyTransactionMap() {
        return this.editState.historyTransactionMap;
    }

    get nextTableNumber() {
        return this.editState.nextTableNumber;
    }

    set nextTableNumber(num) {
        this.editState.nextTableNumber = num;
    }

    get imageObjectUrls() {
        return this.editState.imageObjectUrls;
    }

    get selectedElement() {
        return this.editState.selectedElement;
    }

    set selectedElement(el) {
        this.editState.selectedElement = el;
    }

    get selectedElements() {
        return this.editState?.selectedElements || [];
    }

    set selectedElements(elements) {
        this.editState.selectedElements = elements;
    }

    get elementEditMode() {
        return this.editState.elementEditMode;
    }

    set elementEditMode(editMode) {
        this.editState.elementEditMode = editMode;
    }

    get floorEditMode() {
        return this.editState.floorEditMode;
    }

    set floorEditMode(editMode) {
        this.editState.floorEditMode = editMode;
    }
}

export const floorPlanStoreService = {
    dependencies: ["ui", "dialog"],
    async start(env, { ui, dialog }) {
        const store = new FloorPlanStore();
        store.ui = ui;
        store.dialog = dialog;
        return store;
    },
};

registry.category("services").add("pos_floor_plan", floorPlanStoreService);
