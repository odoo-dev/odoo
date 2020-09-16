/** @odoo-module alias=mail.components.FollowerSubtype **/

import usingModels from 'mail.componentMixins.usingModels';

const { Component } = owl;

class FollowerSubtype extends usingModels(Component) {

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * Called when clicking on cancel button.
     *
     * @private
     * @param {Event} ev
     */
    _onChangeCheckbox(ev) {
        if (ev.target.checked) {
            this.env.services.action.dispatch('Follower/selectSubtype',
                this.follower,
                this.followerSubtype,
            );
        } else {
            this.env.services.action.dispatch('Follower/unselectSubtype',
                this.follower,
                this.followerSubtype,
            );
        }
    }

}

Object.assign(FollowerSubtype, {
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
        followerSubtype: {
            type: Object,
            validate(p) {
                if (p.constructor.modelName !== 'FollowerSubtype') {
                    return false;
                }
                return true;
            },
        },
    },
    template: 'mail.FollowerSubtype',
});

export default FollowerSubtype;
