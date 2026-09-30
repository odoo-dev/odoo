import { _t } from "@web/core/l10n/translation";
import { ColorList } from "@web/core/colorlist/colorlist";
import { registry } from "@web/core/registry";
import { standardFieldProps } from "../standard_field_props";

import { Component, useEffect, useRef } from "@odoo/owl";

class KanbanColorPickerField extends Component {
    static template = "web.KanbanColorPickerField";
    static props = standardFieldProps;

    setup() {
        this.colorListRef = useRef("colorList");
        useEffect(
            (colorList) => {
                const settings = colorList?.closest(".o_kanban_card_manage_settings");
                settings?.classList.add("o_kanban_card_manage_settings_colorlist");
                return () => settings?.classList.remove("o_kanban_card_manage_settings_colorlist");
            },
            () => [this.colorListRef.el]
        );
    }

    get colors() {
        return ColorList.COLORS;
    }

    selectColor(colorIndex) {
        return this.props.record.update({ [this.props.name]: colorIndex }, { save: true });
    }
}

export const kanbanColorPickerField = {
    component: KanbanColorPickerField,
    displayName: _t("Color Picker"),
    extractProps(fieldInfo, dynamicInfo) {
        return {
            readonly: dynamicInfo.readonly,
        };
    },
};

registry.category("fields").add("kanban_color_picker", kanbanColorPickerField);
