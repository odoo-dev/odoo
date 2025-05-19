import { BaseOptionComponent } from "@html_builder/core/utils";
import { ImageShapeOption } from "./image_shape_option";
import { ImageFilterOption } from "./image_filter_option";
import { ImageFormatOption } from "./image_format_option";
import { ImageTransformButton } from "./image_transform_button";
import { useDomState } from "@html_builder/core/utils";

export class ImageToolOption extends BaseOptionComponent {
    static template = "html_builder.ImageToolOption";
    static components = {
        ImageShapeOption,
        ImageFilterOption,
        ImageFormatOption,
        ImageTransformButton,
    };
    static props = {};
    setup() {
        super.setup();
        this.state = useDomState((editingElement) => {
            return {isImageAnimated: editingElement.classList.contains("o_animate")};
        });
    }
}
