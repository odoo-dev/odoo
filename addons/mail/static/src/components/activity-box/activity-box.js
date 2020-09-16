/** @odoo-module alias=mail.components.ActivityBox **/

import usingModels from 'mail.componentMixins.usingModels';

const { Component, QWeb } = owl;

class ActivityBox extends usingModels(Component) {

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     */
    _onClickTitle() {
        this.env.services.action.dispatch(
            'Chatter/toggleActivityBoxVisibility',
            this.chatter,
        );
    }

}

Object.assign(ActivityBox, {
    props: {
        chatter: {
            type: Object,
            validate(p) {
                if (p.constructor.modelName !== 'Chatter') {
                    return false;
                }
                return true;
            },
        },
    },
    template: 'mail.ActivityBox',
});

QWeb.registerComponent('ActivityBox', ActivityBox);

export default ActivityBox;
