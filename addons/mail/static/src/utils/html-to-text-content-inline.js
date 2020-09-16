/** @odoo-module alias=mail.utils.parseAndTransform **/

/**
 * WARNING: this is not enough to unescape potential XSS contained in htmlString, transformFunction
 * should handle it or it should be handled after/before calling parseAndTransform. So if the result
 * of this function is used in a t-raw, be very careful.
 *
 * @param {string} htmlString
 * @param {function} transformFunction
 * @returns {string}
 */
export default function parseAndTransform(htmlString, transformFunction) {
    var openToken = "OPEN" + Date.now();
    var string = htmlString.replace(/&lt;/g, openToken);
    var children;
    try {
        children = $('<div>').html(string).contents();
    } catch (e) {
        children = $('<div>').html('<pre>' + string + '</pre>').contents();
    }
    return _parseAndTransform(children, transformFunction)
                .replace(new RegExp(openToken, "g"), "&lt;");
}

/**
 * @param {Node[]} nodes
 * @param {function} transformFunction with:
 *   param node
 *   param function
 *   return string
 * @return {string}
 */
function _parseAndTransform(nodes, transformFunction) {
    return _.map(nodes, function (node) {
        return transformFunction(node, function () {
            return _parseAndTransform(node.childNodes, transformFunction);
        });
    }).join("");
}
