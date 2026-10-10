import { Decor } from "./decor";
import {
    applyDefaults,
    removeNullishAndDefault,
    STATIC_IMG_BASE_URL,
} from "@pos_restaurant/app/services/floor_plan/utils/utils";
import {
    DECOR_COLORS,
    getStaticSvgUrl,
    getSvgAsset,
    getSvgImageUrl,
} from "@pos_restaurant/app/services/floor_plan/utils/decor_colors";

const defaults = {
    allowText: false,
    allowBorder: false,
    allowBackground: false,
};

export class Image extends Decor {
    constructor(data) {
        super(applyDefaults(data, defaults));
        this.allowBackground = false;
        this.allowBorder = false;
        this.allowText = false;
        this.shape = "image";
        this.colors = { ...data.colors };
        if (!this.url) {
            this.url = this.name ? STATIC_IMG_BASE_URL + "/" + this.name : "/web/image/" + this.id;
        }
    }

    get svgAsset() {
        const url = getStaticSvgUrl(this.name);
        const asset = url && url === this.url ? getSvgAsset(url) : null;
        return asset?.tokens.length ? asset : null;
    }

    get colorTokens() {
        return this.svgAsset?.tokens || [];
    }

    getColor(token) {
        return this.colors[token] || DECOR_COLORS[token];
    }

    getCssStyle() {
        let style = super.getCssStyle();
        const asset = this.svgAsset;
        if (asset) {
            const url = getSvgImageUrl(asset, (token) => this.getColor(token));
            style += `background-image: url("${url}");`;
            style += `background-size: cover;`;
            style += `background-position: center;`;
            style += `background-repeat: no-repeat;`;
        } else if (this.url) {
            style += `background-image: url('${this.url}');`;
            style += `background-size: cover;`;
            style += `background-position: center;`;
            style += `background-repeat: no-repeat;`;
        }
        return style;
    }

    isSideResizeAllowed() {
        return false;
    }
    isCornerResizeAllowed() {
        return true;
    }

    isResizeMaintainRatio() {
        return true;
    }

    get isImage() {
        return true;
    }

    get raw() {
        const data = {
            ...super.raw,
            url: this.url,
            name: this.name,
            id: this.id,
            colors: Object.keys(this.colors).length ? { ...this.colors } : null,
        };
        return removeNullishAndDefault(data, defaults);
    }
}
