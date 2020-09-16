/** @odoo-module alias=mail.components.FollowerSubtypeList **/

import usingModels from 'mail.componentMixins.usingModels';

const { Component, QWeb } = owl;

class FollowerSubtypeList extends usingModels(Component) {

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * Called when clicking on cancel button.
     *
     * @private
     * @param {MouseEvent} ev
     */
    _onClickCancel(ev) {
        this.env.services.action.dispatch('Follower/closeSubtypes',
            this.record.$$$follower(this),
        );
    }

    /**
     * Called when clicking on apply button.
     *
     * @private
     * @param {MouseEvent} ev
     */
    _onClickApply(ev) {
        this.env.services.action.dispatch('Follower/updateSubtypes',
            this.record.$$$follower(this),
        );
    }

}

Object.assign(FollowerSubtypeList, {
    props: {
        record: {
            type: Object,
            validate(p) {
                if (p.constructor.modelName !== 'FollowerSubtypeList') {
                    return false;
                }
                return true;
            },
        },
    },
    template: 'mail.FollowerSubtypeList',
});

QWeb.registerComponent('FollowerSubtypeList', FollowerSubtypeList);

export default FollowerSubtypeList;
