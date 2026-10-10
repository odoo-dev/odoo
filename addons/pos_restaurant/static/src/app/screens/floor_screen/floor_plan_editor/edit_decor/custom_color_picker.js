import { Component, useProps, t } from "@odoo/owl";
import { getColorInfo, getColors } from "@pos_restaurant/app/services/floor_plan/utils/colors";

export class CustomColorPicker extends Component {
    static template = "pos_restaurant.floor_editor.custom_color_picker";
    props = useProps({
        value: t.or([t.string(), t.literal(null)]).optional(),
        onPick: t.function(),
    });

    get isCustom() {
        const value = this.props.value;
        return Boolean(value) && !getColors().some((color) => color.key === value);
    }

    get hexValue() {
        const [r, g, b] = getColorInfo(this.props.value || "black")
            .rgb.match(/\d+/g)
            .map(Number);
        return "#" + [r, g, b].map((channel) => channel.toString(16).padStart(2, "0")).join("");
    }
}
