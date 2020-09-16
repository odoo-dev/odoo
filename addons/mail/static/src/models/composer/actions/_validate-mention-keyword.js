/** @odoo-module alias=mail.models.Composer.actions._validateMentionKeyword **/

import action from 'mail.action.define';

/**
 * Validates user's current typing as a correct mention keyword in order
 * to trigger mentions suggestions display.
 * Returns the mention keyword without the suggestion delimiter if it
 * has been validated and false if not.
 */
export default action({
    name: 'Composer/_validateMentionKeyword',
    id: 'mail.models.Composer.actions._validateMentionKeyword',
    global: true,
    /**
     * @private
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {Composer} composer
     * @param {boolean} beginningOnly
     * @returns {string|boolean}
     */
    func(
        { ctx },
        composer,
        beginningOnly,
    ) {
        const leftString = composer.textInputContent(ctx).substring(
            0,
            composer.textInputCursorStart(ctx),
        );
        // use position before suggestion delimiter because there should be whitespaces
        // or line feed/carriage return before the suggestion delimiter
        const beforeSuggestionDelimiterPosition = leftString.lastIndexOf(
            composer.suggestionDelimiter(ctx),
        ) - 1;
        if (beginningOnly && beforeSuggestionDelimiterPosition > 0) {
            return false;
        }
        let searchStr = composer.textInputContent(ctx).substring(
            beforeSuggestionDelimiterPosition,
            composer.textInputCursorStart(ctx),
        );
        // regex string start with suggestion delimiter or whitespace then suggestion delimiter
        const pattern = (
            "^" +
            composer.suggestionDelimiter(ctx) +
            "|^\\s" +
            composer.suggestionDelimiter(ctx)
        );
        const regexStart = new RegExp(pattern, 'g');
        // trim any left whitespaces or the left line feed/ carriage return
        // at the beginning of the string
        searchStr = searchStr.replace(/^\s\s*|^[\n\r]/g, '');
        if (regexStart.test(searchStr) && searchStr.length) {
            searchStr = searchStr.replace(pattern, '');
            return !searchStr.includes(' ') && !/[\r\n]/.test(searchStr)
                ? searchStr.replace(composer.suggestionDelimiter(ctx), '')
                : false;
        }
        return false;
    },
});
