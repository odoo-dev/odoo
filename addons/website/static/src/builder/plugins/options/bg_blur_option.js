import { BaseOptionComponent } from "@html_builder/core/base_option_component";
import { useDomState } from "@html_builder/core/utils";

export class BgBlurOption extends BaseOptionComponent {
    static template = "website.BgBlurOption";
    static props = {
        applyTo: { type: String, optional: true },
        level: { type: Number, optional: true },
    };
    static defaultProps = {
        applyTo: "",
        level: 2,
    };

    setup() {
        super.setup();
        const domState = useDomState((el) => {
            const target = this.props.applyTo ? el.querySelector(this.props.applyTo) : el;
            return {
                show:
                    target?.style.backgroundColor.startsWith("rgba") ||
                    target?.style.backgroundImage.includes("rgba") ||
                    false,
                hasBlur: target?.style.getPropertyValue("--o-bg-blur") > 0,
            };
        });
        this.blurState = domState;
    }
}
