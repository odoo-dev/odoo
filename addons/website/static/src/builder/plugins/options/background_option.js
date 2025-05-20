import { BaseOptionComponent, useDomState } from "@html_builder/core/utils";
import { BackgroundOption } from "@website/builder/plugins/background_option/background_option";
import { ParallaxOption } from "./parallax_option";
import { useBackgroundOption } from "@website/builder/plugins/background_option/background_hook";
import {
    BOTH_BG_COLOR_IMAGE_EXCLUDE,
    BOTH_BG_COLOR_IMAGE_SELECTOR,
    ONLY_BG_IMAGE_EXLUDE,
    ONLY_BG_IMAGE_SELECTOR,
} from "@website/builder/plugins/options/utils";

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

        this.colorImageSelectors = BOTH_BG_COLOR_IMAGE_SELECTOR.split(",");
        this.onlyImageSelectors = ONLY_BG_IMAGE_SELECTOR.split(",");
        this.colorImageExcludes = BOTH_BG_COLOR_IMAGE_EXCLUDE.split(",");
        this.onlyImageExcludes = ONLY_BG_IMAGE_EXLUDE.split(",");

        this.websiteBgOptionDomState = useDomState((el) => {
            const candidate = el.querySelector(".s_parallax_bg");
            if (!candidate) {
                return { applyTo: "" };
            }
            // The following code prevents the background color option of a
            // parent from targetting a child that is supposed to have its
            // own background option.
            // TODO: maybe find a better way to achieve this?
            const hasBgImageOption = (node) =>
                (this.colorImageSelectors.some((selector) => node.matches(selector)) &&
                    !this.colorImageExcludes.some((exclude) => node.matches(exclude))) ||
                (this.onlyImageSelectors.some((selector) => node.matches(selector)) &&
                    !this.onlyImageExcludes.some((exclude) => node.matches(exclude)));
            let currentNode = candidate;
            while (currentNode && currentNode !== el) {
                if (hasBgImageOption(currentNode)) {
                    return { applyTo: "" };
                }
                currentNode = currentNode.parentElement;
            }
            return { applyTo: ".s_parallax_bg" };
        });
    }
}
