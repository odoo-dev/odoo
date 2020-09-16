/** @odoo-module alias=mail.models.MessagingInitializer.actions._initMentionPartnerSuggestions **/

import action from 'mail.action.define';
import executeGracefully from 'mail.utils.executeGracefully';

export default action({
    name: 'MessagingInitializer/_initMentionPartnerSuggestions',
    id: 'mail.models.MessagingInitializer.actions._initMentionPartnerSuggestions',
    global: true,
    /**
     * @private
     * @param {Object} param0
     * @param {web.env} param0.env
     * @param {MessagingInitializer} messagingInitializer
     * @param {Object[]} mentionPartnerSuggestionsData
     */
    async func(
        { env },
        messagingInitializer,
        mentionPartnerSuggestionsData,
    ) {
        return executeGracefully(
            mentionPartnerSuggestionsData.map(
                suggestions =>
                    () => {
                        return executeGracefully(
                            suggestions.map(
                                suggestion =>
                                    () => {
                                        const { email, id, name } = suggestion;
                                        env.services.action.dispatch(
                                            'Partner/insert',
                                            {
                                                email,
                                                id,
                                                name,
                                            },
                                        );
                                    },
                            ),
                        );
                    },
            ),
        );
    },
});