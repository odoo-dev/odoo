/** @odoo-module alias=mail.utils.getTextToHTML **/

// Replaces textarea text into html text (add <p>, <a>)
// TDE note : should be done server-side, in Python -> use mail.compose.message ?
export default function getTextToHTML(text) {
    return text
        .replace(/((?:https?|ftp):\/\/[\S]+)/g,'<a href="$1">$1</a> ')
        .replace(/[\n\r]/g,'<br/>');
}
