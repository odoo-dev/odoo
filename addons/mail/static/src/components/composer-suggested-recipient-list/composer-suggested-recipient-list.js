/** @odoo-module alias=mail.components.ComposerSuggestedRecipientList **/

import usingModels from 'mail.componentMixins.usingModels';

const { Component, QWeb } = owl;
const { useState } = owl.hooks;


class ComposerSuggestedRecipientList extends usingModels(Component) {

    /**
     * @override
     */
    constructor(...args) {
        super(...args);
        this.state = useState({
            hasShowMoreButton: false,
        });
    }

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     */
    _onClickShowLess(ev) {
        this.state.hasShowMoreButton = false;
    }

    /**
     * @private
     */
    _onClickShowMore(ev) {
        this.state.hasShowMoreButton = true;
    }

}

Object.assign(ComposerSuggestedRecipientList, {
    props: {
        thread: {
            type: Object,
            validate(p) {
                if (p.constructor.modelName !== 'Thread') {
                    return false;
                }
                return true;
            },
        },
    },
    template: 'mail.ComposerSuggestedRecipientList',
});

QWeb.registerComponent('ComposerSuggestedRecipientList', ComposerSuggestedRecipientList);

export default ComposerSuggestedRecipientList;
