import { Plugin } from "@html_editor/plugin";
import { registry } from "@web/core/registry";
import { pick } from "@web/core/utils/objects";
import { removeOnImageChangeAttrs } from "@html_editor/utils/image_processing";
import {
    backgroundImageCssToParts,
    backgroundImagePartsToCss,
    getBgImageURLFromEl,
    getBgImageURLFromURL,
} from "@html_builder/utils/utils_css";
import { coreBuilderActions } from "../core_builder_action_plugin";
// import { isMobileView } from "@html_builder/builder/utils/utils";

// const connectionShapes = [
//     { shape: "web_editor/Connections/01", label: "Connections 01" },
//     { shape: "web_editor/Connections/02", label: "Connections 02" },
//     { shape: "web_editor/Connections/03", label: "Connections 03" },
//     { shape: "web_editor/Connections/04", label: "Connections 04" },
//     { shape: "web_editor/Connections/05", label: "Connections 05" },
//     { shape: "web_editor/Connections/06", label: "Connections 06" },
// ];

const replaceImage = {
    load: function () {
        return new Promise((resolve) => {
            this.dependencies.media.openMediaDialog({
                onlyImages: true,
                noDocuments: true,
                noVideos: true,
                save: (imageEl) => {
                    resolve(imageEl.getAttribute("src"));
                },
            });
        });
    },
    apply: ({ editingElement, loadResult: imageSrc }) => {
        // What was in background method of BackgroundImage option
        setBackground(editingElement, imageSrc);
        for (const attr of removeOnImageChangeAttrs) {
            delete editingElement.dataset[attr];
        }
        // TODO: handle the _onBackgroundChanged of BackgroundOptimize (previoulsy a trigger check if inherit or something)
    },
};

class BackgroundOptionPlugin extends Plugin {
    static id = "BackgroundOption";
    static dependencies = ["media"];
    resources = {
        builder_actions: this.getActions(),
    };
    getActions() {
        return {
            applyShape: {
                apply: ({ editingElement, param }) => {
                    const shapeData = this.getShapeData(editingElement);
                    const applyShapeParams = {
                        shape: param.shape,
                        colors: this.getImplicitColors(editingElement, shapeData.colors, param.url),
                        flip: [],
                        animated: param.animated,
                        shapeAnimationSpeed: shapeData.shapeAnimationSpeed,
                    };
                    this.applyShape(editingElement, () => applyShapeParams);
                },
                isApplied: ({ editingElement, param }) => {
                    const currentShapeApplied = this.getShapeData(editingElement).shape;
                    return currentShapeApplied === param.shape;
                },
            },
            replaceImage: {
                load: replaceImage.load.bind(this),
                apply: replaceImage.apply.bind(this),
            },
            toggleBgImage: {
                load: replaceImage.load.bind(this),
                apply: replaceImage.apply.bind(this),
                clean: ({ editingElement }) => {
                    editingElement.querySelector(".o_we_bg_filter")?.remove();
                    // TODO: use setWidgetValue instead of calling background directly when possible
                    replaceImage.apply.bind(this)({
                        editingElement: editingElement,
                        loadResult: "",
                    });
                },
                isApplied: ({ editingElement }) => !!editingElement.style["background-image"],
            },
            // toggleBgShape todo
            toggleBgShape: {
                apply: ({ editingElement }) => {
                    //TODO
                },
            },
            toggleShape: {
                apply: ({ editingElement }) => {
                    // // TODO: continue
                    // const previousSibling = editingElement.previousElementSibling;
                    // const possibleShapes = connectionShapes.map(
                    //     (connectionShape) => connectionShape.key
                    // );
                    // let shapeToSelect;
                    // if (previousSibling) {
                    //     const previousShape = this.getShapeData(previousSibling).shape;
                    //     shapeToSelect = possibleShapes.find(
                    //         (shape, i) => possibleShapes[i - 1] === previousShape
                    //     );
                    // }
                    // // If there is no previous sibling, if the previous sibling had the
                    // // last shape selected or if the previous shape could not be found
                    // // in the possible shapes, default to the first shape. ([0] being no
                    // // shapes selected.)
                    // if (!shapeToSelect) {
                    //     shapeToSelect = possibleShapes[1];
                    // }
                    // // Only show on mobile by default if toggled from mobile view
                    // const showOnMobile = isMobileView(editingElement);
                    // this.trigger_up("snippet_edition_request", {exec: () => {
                    //     // options for shape will only be available after _toggleShape() returned
                    //     this._requestUserValueWidgets('bg_shape_opt')[0].enable();
                    // }});
                    // this.createShapeContainer(shapeToSelect);
                    // return this.applyShape(editingElement, () => ({
                    //     shape: shapeToSelect,
                    //     colors: this._getImplicitColors(shapeToSelect),
                    //     showOnMobile,
                    // }));
                },
                clean: ({ editingElement }) => {
                    this.applyShape(editingElement, () => ({ shape: "" }));
                },
            },
            backgroundType: {
                apply: ({ editingElement }) => {
                    // TODO
                },
            },
            backgroundPositionOverlay: {
                apply: ({ editingElement }) => {
                    // TODO
                },
            },
        };
    }
    /**
     * Creates and inserts a container for the shape with the right classes.
     *
     * @param {HTMLElement} editingElement
     * @param {string} shape the shape name for which to create a container
     */
    createShapeContainer(editingElement, shape) {
        const shapeContainer = this.insertShapeContainer(
            editingElement,
            document.createElement("div")
        );
        editingElement.style.setProperty("position", "relative");
        shapeContainer.className = `o_we_shape o_${shape.replace(/\//g, "_")}`;
        return shapeContainer;
    }

    /**
     * Inserts or removes the given container at the right position in the
     * document.
     *
     * @param {HTMLElement} editingElement
     * @param {HTMLElement} [newContainer] container to insert, null to remove
     */
    insertShapeContainer(editingElement, newContainer) {
        const shapeContainerEl = editingElement.querySelector(":scope > .o_we_shape");
        if (shapeContainerEl) {
            shapeContainerEl.remove();
        }
        if (newContainer) {
            const preShapeLayerElement = this.getLastPreShapeLayerElement(editingElement);
            if (preShapeLayerElement) {
                preShapeLayerElement.insertAdjacentElement("afterend", newContainer);
            } else {
                editingElement.prepend(newContainer);
            }
        }
        return newContainer;
    }

    getLastPreShapeLayerElement(editingElement) {
        return editingElement.querySelector(":scope > .o_we_bg_filter");
    }

    /**
     * Handles everything related to saving state before preview and restoring
     * it after a preview or locking in the changes when not in preview.
     *
     * @param {HTMLElement} editingElement
     * @param {function} computeShapeData function to compute the new shape data.
     */
    applyShape(editingElement, computeShapeData) {
        const curShapeData = editingElement.dataset.oeShapeData || {};
        const newShapeData = computeShapeData();
        // TODO: check if really work as curShapeData seems to be of form {"shape": blabla}
        const { shape: curShape } = curShapeData;
        const changedShape = newShapeData.shape !== curShape;
        this.markShape(editingElement, newShapeData);
        if (changedShape) {
            // Need to rerender for correct number of colorpickers
            // TODO check how to do
            // this.rerender = true;
        }

        // Updates/removes the shape container as needed and gives it the
        // correct background shape
        const json = editingElement.dataset.oeShapeData;
        const {
            shape,
            colors,
            flip = [],
            animated = "false",
            showOnMobile,
            shapeAnimationSpeed,
        } = json ? JSON.parse(json) : {};
        let shapeContainerEl = editingElement.querySelector(":scope > .o_we_shape");
        if (!shape) {
            return this.insertShapeContainer(editingElement, null);
        }
        // When changing shape we want to reset the shape container (for transparency color)
        if (changedShape) {
            shapeContainerEl = this.createShapeContainer(editingElement, shape);
        }
        // Compat: remove old flip classes as flipping is now done inside the svg
        shapeContainerEl.classList.remove("o_we_flip_x", "o_we_flip_y");

        shapeContainerEl.classList.toggle("o_we_animated", animated === "true");
        if (colors || flip.length || parseFloat(shapeAnimationSpeed) !== 0) {
            // Custom colors/flip/speed, overwrite shape that is set by the class
            shapeContainerEl.style.setProperty(
                "background-image",
                `url("${this.getShapeSrc(editingElement)}")`
            );
            shapeContainerEl.style.backgroundPosition = "";
            if (flip.length) {
                let [xPos, yPos] = getComputedStyle(shapeContainerEl)
                    .backgroundPosition.split(" ")
                    .map((p) => parseFloat(p));
                // -X + 2*Y is a symmetry of X around Y, this is a symmetry around 50%
                xPos = flip.includes("x") ? -xPos + 100 : xPos;
                yPos = flip.includes("y") ? -yPos + 100 : yPos;
                shapeContainerEl.style.backgroundPosition = `${xPos}% ${yPos}%`;
            }
        } else {
            // Remove custom bg image and let the shape class set the bg shape
            shapeContainerEl.style.setProperty("background-image", "");
            shapeContainerEl.style.setProperty("background-position", "");
        }
        shapeContainerEl.classList.toggle("o_shape_show_mobile", !!showOnMobile);
    }
    /**
     * Overwrites shape properties with the specified data.
     *
     * @param {HTMLElement} editingElement
     * @param {Object} newData an object with the new data
     */
    markShape(editingElement, newData) {
        const defaultColors = this.getDefaultColors(editingElement);
        const shapeData = Object.assign(this.getShapeData(editingElement), newData);
        const areColorsDefault = Object.entries(shapeData.colors).every(
            ([colorName, colorValue]) =>
                defaultColors[colorName] &&
                colorValue.toLowerCase() === defaultColors[colorName].toLowerCase()
        );
        if (areColorsDefault) {
            delete shapeData.colors;
        }
        if (!shapeData.shape) {
            delete editingElement.dataset.oeShapeData;
        } else {
            editingElement.dataset.oeShapeData = JSON.stringify(shapeData);
        }
    }
    /**
     * Returns the src of the shape corresponding to the current parameters.
     *
     * @param {HTMLElement} editingElement
     */
    getShapeSrc(editingElement) {
        const { shape, colors, flip, shapeAnimationSpeed } = this.getShapeData(editingElement);
        if (!shape) {
            return "";
        }
        const searchParams = Object.entries(colors).map(([colorName, colorValue]) => {
            const encodedCol = encodeURIComponent(colorValue);
            return `${colorName}=${encodedCol}`;
        });
        if (flip.length) {
            searchParams.push(`flip=${encodeURIComponent(flip.sort().join(""))}`);
        }
        if (Number(shapeAnimationSpeed)) {
            searchParams.push(`shapeAnimationSpeed=${encodeURIComponent(shapeAnimationSpeed)}`);
        }
        return `/web_editor/shape/${encodeURIComponent(shape)}.svg?${searchParams.join("&")}`;
    }
    /**
     * Returns the implicit colors for the currently selected shape.
     *
     * The implicit colors are use upon shape selection. They are computed as:
     * - the default colors
     * - patched with each set of colors of previous siblings shape
     * - patched with the colors of the previously selected shape
     * - filtered to only keep the colors involved in the current shape
     *
     * @param {HTMLElement} editingElement
     * @param {String} shape identifier of the selected shape
     * @param {Object} previousColors colors of the shape before its replacement
     */
    getImplicitColors(editingElement, previousColors, selectedBackgroundUrl) {
        const defaultColors = this.getShapeDefaultColors(selectedBackgroundUrl);
        let colors = previousColors || {};
        let sibling = editingElement.previousElementSibling;
        while (sibling) {
            colors = Object.assign(this.getShapeData(sibling).colors || {}, colors);
            sibling = sibling.previousElementSibling;
        }
        const defaultKeys = Object.keys(defaultColors);
        colors = Object.assign(defaultColors, colors);
        return pick(colors, ...defaultKeys);
    }
    /**
     * Returns the default colors for the a shape in the selector.
     *
     * @param {String} selectedBackgroundUrl
     */
    getShapeDefaultColors(selectedBackgroundUrl) {
        const shapeSrc = selectedBackgroundUrl && getBgImageURLFromURL(selectedBackgroundUrl);
        const url = new URL(shapeSrc, window.location.origin);
        return Object.fromEntries(url.searchParams.entries());
    }
    /**
     * Returns the default colors for the currently selected shape.
     *
     * @param {HTMLElement} editingElement the element on which to read the shape
     * data.
     */
    getDefaultColors(editingElement) {
        const shapeContainer = editingElement.querySelector(":scope > .o_we_shape").cloneNode(true);
        shapeContainer.classList.add("d-none");
        // Needs to be in document for bg-image class to take effect
        editingElement.ownerDocument.body.appendChild(shapeContainer);
        shapeContainer.style.setProperty("background-image", "");
        const shapeSrc = shapeContainer && getBgImageURLFromEl(shapeContainer);
        shapeContainer.remove();
        if (!shapeSrc) {
            return {};
        }
        const url = new URL(shapeSrc, window.location.origin);
        return Object.fromEntries(url.searchParams.entries());
    }

    /**
     * Retrieves current shape data from the target's dataset.
     *
     * @param {HTMLElement} editingElement the target on which to read the shape
     * data.
     */
    getShapeData(editingElement) {
        const defaultData = {
            shape: "",
            colors: this.getDefaultColors(editingElement),
            flip: [],
            showOnMobile: false,
            shapeAnimationSpeed: "0",
        };
        const json = editingElement.dataset.oeShapeData;
        return json ? Object.assign(defaultData, JSON.parse(json.replace(/'/g, '"'))) : defaultData;
    }
}
registry.category("website-plugins").add(BackgroundOptionPlugin.id, BackgroundOptionPlugin);

function setBackground(editingElement, backgroundURL) {
    const parts = backgroundImageCssToParts(editingElement.style["background-image"]);
    if (backgroundURL) {
        parts.url = `url('${backgroundURL}')`;
        editingElement.classList.add("oe_img_bg", "o_bg_img_center");
    } else {
        delete parts.url;
        editingElement.classList.remove("oe_img_bg", "o_bg_img_center", "o_modified_image_to_save");
    }
    const combined = backgroundImagePartsToCss(parts);
    // TODO: check this comment
    // We use selectStyle so that if when a background image is removed the
    // remaining image matches the o_cc's gradient background, it can be
    // removed too.
    // -> styleAction

    coreBuilderActions.styleAction.apply({
        editingElement: editingElement,
        param: "background-image",
        value: combined,
    });
    // Check if really needed this.options.wysiwyg.odooEditor.editable.focus();
}
