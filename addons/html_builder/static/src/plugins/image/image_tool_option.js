import { BaseOptionComponent } from "@html_builder/core/utils";
import { ImageShapeOption } from "./image_shape_option";
import { clamp } from "@web/core/utils/numbers";
import { KeepLast } from "@web/core/utils/concurrency";
import { getMimetype } from "@html_editor/utils/image";
import { ImageTransformButton } from "./image_transform_button";

export class ImageToolOption extends BaseOptionComponent {
    static template = "html_builder.ImageToolOption";
    static components = {
        ImageShapeOption,
        ImageFilterOption,
        ImageFormatOption,
        ImageTransformButton,
    };
    static props = {};
}
