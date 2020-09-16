/** @odoo-module alias=mail.utils.escapeAndCompactTextContent **/

/**
 * Returns an escaped conversion of a content.
 *
 * @param {string} content
 * @returns {string}
 */
export default function escapeAndCompactTextContent(content) {
    //Removing unwanted extra spaces from message
    let value = owl.utils.escape(content).trim();
    value = value.replace(/(\r|\n){2,}/g, '<br/><br/>');
    value = value.replace(/(\r|\n)/g, '<br/>');

    // prevent html space collapsing
    value = value.replace(/ /g, '&nbsp;').replace(/([^>])&nbsp;([^<])/g, '$1 $2');
    return value;
}
