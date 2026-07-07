import { BaseOptionComponent } from "@html_builder/core/base_option_component";
import { useDomState } from "@html_builder/core/utils";
import {
    convertNumericToUnit,
    getCSSVariableValue,
    getHtmlStyle,
} from "@html_editor/utils/formatting";

export const BORDER_RADIUS_MULTIPLIERS = {
    "border-radius": 1,
    "border-radius-sm": 0.8,
    "border-radius-lg": 1.12,
};

const EPSILON = 0.01;

export class ThemeRoundnessOption extends BaseOptionComponent {
    static template = "website.ThemeRoundnessOption";
    static dependencies = ["customizeWebsite"];

    setup() {
        super.setup();
        this.state = useDomState(() => ({
            isCustomized: {
                "border-radius-sm": isBorderRadiusCustomized("border-radius-sm", this.document),
                "border-radius-lg": isBorderRadiusCustomized("border-radius-lg", this.document),
            },
        }));
    }
}

export function isBorderRadiusCustomized(variable, doc) {
    const style = getHtmlStyle(doc);
    let reference =
        parseFloat(getCSSVariableValue("border-radius", style)) *
        BORDER_RADIUS_MULTIPLIERS[variable];
    reference = toFixedPixel(reference, doc);
    const value = parseFloat(getCSSVariableValue(variable, style));
    return Math.abs(value - reference) >= EPSILON;
}

export function toFixedPixel(remValue, doc) {
    const htmlStyle = getHtmlStyle(doc);
    const pxValue = convertNumericToUnit(remValue, "rem", "px", htmlStyle);
    return convertNumericToUnit(pxValue.toFixed(1), "px", "rem", htmlStyle);
}
