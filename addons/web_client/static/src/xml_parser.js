const parser = new DOMParser();

/**
 * @param {string} str
 * @returns {Element}
 */
export function parseXml(str) {
    const xml = parser.parseFromString(str, "text/xml");
    return xml.documentElement;
}
