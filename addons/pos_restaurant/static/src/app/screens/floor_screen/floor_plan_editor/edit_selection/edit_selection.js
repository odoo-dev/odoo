import { Component, useProps, t } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { DecorColors } from "@pos_restaurant/app/screens/floor_screen/floor_plan_editor/edit_decor/decor_colors";
import { FloorElement } from "@pos_restaurant/app/services/floor_plan/elements";
import {
    opacityToTransparency,
    transparencyToOpacity,
} from "@pos_restaurant/app/services/floor_plan/utils/utils";

const ALIGN_ACTIONS = [
    { mode: "left", title: _t("Align left"), icon: "vertical_align_top", rotated: true },
    { mode: "center", title: _t("Align center"), icon: "vertical_align_center", rotated: true },
    { mode: "right", title: _t("Align right"), icon: "vertical_align_bottom", rotated: true },
    { mode: "top", title: _t("Align top"), icon: "vertical_align_top" },
    { mode: "middle", title: _t("Align middle"), icon: "vertical_align_center" },
    { mode: "bottom", title: _t("Align bottom"), icon: "vertical_align_bottom" },
];

export class EditSelectionProperties extends Component {
    static template = "pos_restaurant.floor_editor.edit_selection_properties";
    static components = { DecorColors };
    props = useProps({
        elements: t.array(t.instanceOf(FloorElement)),
        align: t.function(),
        updateElements: t.function(),
    });

    get alignActions() {
        return ALIGN_ACTIONS;
    }

    get decors() {
        return this.props.elements.filter((element) => !element.isTable);
    }

    get transparency() {
        return opacityToTransparency(this.decors[0].opacity);
    }

    setTransparency(event, batched = false) {
        const opacity = transparencyToOpacity(event.target.value);
        this.props.updateElements(
            this.decors.map((decor) => ({ uuid: decor.uuid, data: { opacity } })),
            { batched }
        );
    }

    get colorElements() {
        const furniture = this.props.elements.filter(
            (element) => element.isImage && element.colorTokens.length
        );
        const tokens = furniture[0]?.colorTokens.join(",");
        return furniture.every((element) => element.colorTokens.join(",") === tokens)
            ? furniture
            : [];
    }
}
