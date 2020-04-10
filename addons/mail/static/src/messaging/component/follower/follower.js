odoo.define('mail.messaging.component.Follower', function (require) {
'use strict';

const components = {
    FollowerSubtypeList: require('mail.messaging.component.FollowerSubtypeList'),
};
const useStore = require('mail.messaging.component_hook.useStore');

const { Component } = owl;

class Follower extends Component {

    /**
     * @override
     */
    constructor(...args) {
        super(...args);
        useStore(props => {
            const follower = this.env.entities.Follower.get(props.followerLocalId);
            return [follower ? follower.__state : undefined];
        });
    }

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * @returns {mail.messaging.entity.Follower}
     */
    get follower() {
        return this.env.entities.Follower.get(this.props.followerLocalId);
    }

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
        this.env.messaging.openDocument({
            id: this.follower.resId,
            model: this.follower.resModel,
        });
    }

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickEdit(ev) {
        ev.preventDefault();
        this.follower.showSubtypes();
    }

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickRemove(ev) {
        this.follower.remove();
    }

}

Object.assign(Follower, {
    components,
    props: {
        followerLocalId: String,
    },
    template: 'mail.messaging.component.Follower',
});

return Follower;

});
