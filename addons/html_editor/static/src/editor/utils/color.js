/**
 * Takes a color (rgb, rgba or hex) and returns its hex representation. If the
 * color is given in rgba, the background color of the node whose color we're
 * converting is used in conjunction with the alpha to compute the resulting
 * color (using the formula: `alpha*color + (1 - alpha)*background` for each
 * channel).
 *
 * @param {string} rgb
 * @param {HTMLElement} [node]
 * @returns {string} hexadecimal color (#RRGGBB)
 */
export function rgbToHex(rgb = "", node = null) {
    if (rgb.startsWith("#")) {
        return rgb;
    } else if (rgb.startsWith("rgba")) {
        const values = rgb.match(/[\d.]{1,5}/g) || [];
        const alpha = parseFloat(values.pop());
        // Retrieve the background color.
        let bgRgbValues = [];
        if (node) {
            let bgColor = getComputedStyle(node).backgroundColor;
            if (bgColor.startsWith("rgba")) {
                // The background color is itself rgba so we need to compute
                // the resulting color using the background color of its
                // parent.
                bgColor = rgbToHex(bgColor, node.parentElement);
            }
            if (bgColor && bgColor.startsWith("#")) {
                bgRgbValues = (bgColor.match(/[\da-f]{2}/gi) || []).map((val) => parseInt(val, 16));
            } else if (bgColor && bgColor.startsWith("rgb")) {
                bgRgbValues = (bgColor.match(/[\d.]{1,5}/g) || []).map((val) => parseInt(val));
            }
        }
        bgRgbValues = bgRgbValues.length ? bgRgbValues : [255, 255, 255]; // Default to white.

        return (
            "#" +
            values
                .map((value, index) => {
                    const converted = Math.floor(
                        alpha * parseInt(value) + (1 - alpha) * bgRgbValues[index]
                    );
                    const hex = parseInt(converted).toString(16);
                    return hex.length === 1 ? "0" + hex : hex;
                })
                .join("")
        );
    } else {
        return (
            "#" +
            (rgb.match(/\d{1,3}/g) || [])
                .map((x) => {
                    x = parseInt(x).toString(16);
                    return x.length === 1 ? "0" + x : x;
                })
                .join("")
        );
    }
}
