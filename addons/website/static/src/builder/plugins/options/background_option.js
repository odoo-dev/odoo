import { BaseOptionComponent, useDomState } from "@html_builder/core/utils";
import { BackgroundOption } from "@website/builder/plugins/background_option/background_option";
import { ParallaxOption } from "./parallax_option";
import { useBackgroundOption } from "@website/builder/plugins/background_option/background_hook";

export class WebsiteBackgroundOption extends BaseOptionComponent {
    static template = "website.WebsiteBackgroundOption";
    static components = {
        ...BackgroundOption.components,
        ParallaxOption,
    };
    static props = {
        ...BackgroundOption.props,
        withVideos: { type: Boolean, optional: true },
    };
    static defaultProps = {
        ...BackgroundOption.defaultProps,
        withVideos: false,
    };
    setup() {
        super.setup();
        const { showColorFilter } = useBackgroundOption(this.isActiveItem);
        this.showColorFilter = () => showColorFilter() || this.isActiveItem("toggle_bg_video_id");
        this.websiteBgOptionDomState = useDomState((el) => {
            // The following code prevents the "Floating Cards" background color
            // option from targetting individual cards of the snippet, which
            // are supposed to have their own background option.
            // TODO: maybe find a better way to achieve this. The same problem
            // could happen with other snippets.
            const candidate = el.querySelector(".s_parallax_bg");
            if (
                !candidate ||
                (!!candidate.closest(".s_floating_blocks_block") &&
                    el.classList.contains("s_floating_blocks"))
            ) {
                return { applyTo: "" };
            }
            return { applyTo: ".s_parallax_bg" };
        });
    }
}
