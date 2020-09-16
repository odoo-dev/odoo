/** @odoo-module alias=mail.models.Composer.actions._generateEmojisOnHtml **/

import action from 'mail.action.define';
import emojis from 'mail.utils.emojis';

export default action({
    name: 'Composer/_generateEmojisOnHtml',
    id: 'mail.models.Composer.actions._generateEmojisOnHtml',
    global: true,
    /**
     * @private
     * @param {Object} _
     * @param {Composer} composer
     * @param {string} htmlString
     * @returns {string}
     */
    func(
        _,
        composer,
        htmlString,
    ) {
        for (const emoji of emojis) {
            for (const source of emoji.sources) {
                const escapedSource = String(source).replace(
                    /([.*+?=^!:${}()|[\]/\\])/g,
                    '\\$1',
                );
                const regexp = new RegExp(
                    '(\\s|^)(' + escapedSource + ')(?=\\s|$)',
                    'g',
                );
                htmlString = htmlString.replace(regexp, '$1' + emoji.unicode);
            }
        }
        return htmlString;
    },
});
