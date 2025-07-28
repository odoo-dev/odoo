import { BaseOptionComponent } from "@html_builder/core/utils";

export class VerticalAlignmentOption extends BaseOptionComponent {
    static template = "html_builder.VerticalAlignmentOption";
    static props = {
        level: { type: Number, optional: true },
        applyTo: { type: String, optional: true },
        justify: { type: Boolean, optional: true },
    };
    static defaultProps = {
        level: 0,
        justify: true,
    };
    static selector =
        ".s_text_image, .s_image_text, .s_three_columns, .s_showcase, .s_numbers, .s_faq_collapse, .s_references, .s_accordion_image, .s_shape_image";
    static applyTo = ".row";
}
