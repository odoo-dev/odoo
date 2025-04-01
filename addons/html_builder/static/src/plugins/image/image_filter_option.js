import { BaseOptionComponent, useDomState } from "@html_builder/core/utils";
import { getImageSrc } from "@html_editor/utils/image";

export class ImageFilterOption extends BaseOptionComponent {
    static template = "html_builder.ImageFilterOption";
    static props = {
        level: { type: Number, optional: true },
    };
    static defaultProps = {
        level: 0,
    };
    setup() {
        super.setup();
        this.state = useDomState((editingElement) => ({
            isCustomFilter: editingElement.dataset.glFilter === "custom",
            // When a div does not have a background-image, it does not have "src" .
            showFilter: !!getImageSrc(editingElement),
        }));
    }
}
