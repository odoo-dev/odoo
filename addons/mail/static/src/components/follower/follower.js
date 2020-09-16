/** @odoo-module alias=mail.components.Follower **/

import usingModels from 'mail.componentMixins.usingModels';

const { Component, QWeb } = owl;

class Follower extends usingModels(Component) {

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickDetails(ev) {
        ev.preventDefault();
        ev.stopPropagation();
        this.env.services.action.dispatch(
            'Follower/openProfile',
            this.follower,
        );
    }

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickEdit(ev) {
        ev.preventDefault();
        this.env.services.action.dispatch(
            'Follower/showSubtypes',
            this.follower,
        );
    }

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickRemove(ev) {
        this.env.services.action.dispatch(
            'Follower/remove',
            this.follower,
        );
    }

}

Object.assign(Follower, {
    props: {
        follower: {
            type: Object,
            validate(p) {
                if (p.constructor.modelName !== 'Follower') {
                    return false;
                }
                return true;
            },
        },
    },
    template: 'mail.Follower',
});

QWeb.registerComponent('Follower', Follower);

export default Follower;
