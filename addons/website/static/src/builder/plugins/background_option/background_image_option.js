import { BaseOptionComponent } from "@html_builder/core/utils";
import { getBgImageURLFromEl, normalizeColor } from "@html_builder/utils/utils_css";

export class BackgroundImageOption extends BaseOptionComponent {
    static template = "html_builder.BackgroundImageOption";
    static props = {};
    setup(){
        this.addBgImageClasses();
        super.setup();
    }
    addBgImageClasses(){
        const editingEl = this.env.getEditingElement();
        const backgroundURL = getBgImageURLFromEl(editingEl);
        if (backgroundURL) {
            editingEl.classList.add("oe_img_bg", "o_bg_img_center");
        } else {
            editingEl.classList.remove("oe_img_bg", "o_bg_img_center", "o_modified_image_to_save");
        }
    }
    showMainColorPicker() {
        const editingEl = this.env.getEditingElement();
        const src = new URL(getBgImageURLFromEl(editingEl), window.location.origin);
        return (
            src.origin === window.location.origin &&
            (src.pathname.startsWith("/html_editor/shape/") ||
                src.pathname.startsWith("/web_editor/shape/"))
        );
    }
    getColorPickerColorNames() {
        const colorNames = [];
        const editingEl = this.env.getEditingElement();
        for (let nbr = 1; nbr <= 5; nbr++) {
            const colorName = `c${nbr}`;
            if (getBackgroundImageColor(editingEl, colorName)) {
                colorNames.push(colorName);
            }
        }
        return colorNames;
    }
}

export function getBackgroundImageColor(editingEl, colorName) {
    const backgroundImageColor = new URL(
        getBgImageURLFromEl(editingEl),
        window.location.origin
    ).searchParams.get(colorName);
    if (backgroundImageColor) {
        return normalizeColor(backgroundImageColor);
    }
}
