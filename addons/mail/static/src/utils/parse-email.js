/** @odoo-module alias=mail.utils.parseEmail **/

// Parses text to find email: Tagada <address@mail.fr> -> [Tagada, address@mail.fr] or False
export default function parseEmail(text) {
    if (text){
        var result = text.match(/(.*)<(.*@.*)>/);
        if (result) {
            return [_.str.trim(result[1]), _.str.trim(result[2])];
        }
        result = text.match(/(.*@.*)/);
        if (result) {
            return [_.str.trim(result[1]), _.str.trim(result[1])];
        }
        return [text, false];
    }
}
