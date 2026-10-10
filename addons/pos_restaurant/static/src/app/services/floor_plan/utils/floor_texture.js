import { STATIC_IMG_BASE_URL } from "./utils";

export const FLOOR_TEXTURE = [];
export const FLOOR_TEXTURE_PREFIX = "texture-";
const URL = STATIC_IMG_BASE_URL;

FLOOR_TEXTURE.push({
    id: FLOOR_TEXTURE_PREFIX + "wood-h",
    css: "background-image:url('" + URL + "/wood-h.jpg');",
    previewCss: "background-image:url('" + URL + "/wood-hp.png');",
});

FLOOR_TEXTURE.push({
    id: FLOOR_TEXTURE_PREFIX + "wood-v",
    css: "background-image:url('" + URL + "/wood-v.jpg')",
    previewCss: "background-image:url('" + URL + "/wood-vp.png')",
});

FLOOR_TEXTURE.push({
    id: FLOOR_TEXTURE_PREFIX + "tile-2",
    css: "background-image:url('" + URL + "/tile-2.jpg')",
    previewCss: "background-image:url('" + URL + "/tile-2p.jpg')",
});

FLOOR_TEXTURE.push({
    id: FLOOR_TEXTURE_PREFIX + "tile-3",
    css: "background-image:url('" + URL + "/tile-3.jpg')",
    previewCss: "background-image:url('" + URL + "/tile-3p.jpg')",
});

FLOOR_TEXTURE.push({
    id: FLOOR_TEXTURE_PREFIX + "tile-1",
    css: "background-image:url('" + URL + "/tile-1.jpg')",
    previewCss: "background-image:url('" + URL + "/tile-1p.png')",
});

FLOOR_TEXTURE.push({
    id: FLOOR_TEXTURE_PREFIX + "grey-oak",
    css: "background-image:url('" + URL + "/texture-grey-oak.svg')",
    previewCss: "background-image:url('" + URL + "/texture-grey-oak.svg');background-size:48px",
});

FLOOR_TEXTURE.push({
    id: FLOOR_TEXTURE_PREFIX + "whitewashed-oak",
    css: "background-image:url('" + URL + "/texture-whitewashed-oak.svg')",
    previewCss:
        "background-image:url('" + URL + "/texture-whitewashed-oak.svg');background-size:48px",
});

FLOOR_TEXTURE.push({
    id: FLOOR_TEXTURE_PREFIX + "whitewashed-oak-night",
    css: "background-image:url('" + URL + "/texture-whitewashed-oak-night.svg')",
    previewCss:
        "background-image:url('" +
        URL +
        "/texture-whitewashed-oak-night.svg');background-size:48px",
});

FLOOR_TEXTURE.push({
    id: FLOOR_TEXTURE_PREFIX + "travertine",
    css: "background-image:url('" + URL + "/texture-travertine.svg')",
    previewCss: "background-image:url('" + URL + "/texture-travertine.svg');background-size:48px",
});

export function isFloorTextureId(id) {
    return id?.startsWith(FLOOR_TEXTURE_PREFIX);
}

export function getFloorTextureCss(id) {
    return FLOOR_TEXTURE.find((c) => c.id === id)?.css;
}
