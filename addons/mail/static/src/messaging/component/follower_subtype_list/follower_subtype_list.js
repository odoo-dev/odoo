odoo.define('mail.messaging.component.FollowerSubtypeList', function (require) {
'use strict';

const components = {
    FollowerSubtype: require('mail.messaging.component.FollowerSubtype'),
};
const useStore = require('mail.messaging.component_hook.useStore');

const { Component, QWeb } = owl;

class FollowerSubtypeList extends Component {

    /**
     * @override
     */
    constructor(...args) {
        super(...args);
        useStore(props => {
            const followerSubtypeList = this.env.entities.FollowerSubtypeList.get(props.localId);
            const follower = followerSubtypeList
                ? followerSubtypeList.follower
                : undefined;
            const followerSubtypes = follower ? follower.subtypes : [];
            return {
                follower: follower ? follower.__state : undefined,
                followerSubtypeList: followerSubtypeList
                    ? followerSubtypeList.__state
                    : undefined,
                followerSubtypes: followerSubtypes.map(subtype => subtype.__state),
            };
        }, {
            compareDepth: {
                followerSubtypes: 1,
            },
        });
    }

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * @returns {mail.messaging.entity.FollowerSubtypeList}
     */
    get followerSubtypeList() {
        return this.env.entities.FollowerSubtypeList.get(this.props.localId);
    }

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
        this.followerSubtypeList.follower.closeSubtypes();
    }

    /**
     * Called when clicking on apply button.
     *
     * @private
     * @param {MouseEvent} ev
     */
    _onClickApply(ev) {
        this.followerSubtypeList.follower.updateSubtypes();
    }

}

Object.assign(FollowerSubtypeList, {
    components,
    props: {
        localId: String,
    },
    template: 'mail.messaging.component.FollowerSubtypeList',
});

QWeb.registerComponent('FollowerSubtypeList', FollowerSubtypeList);

return FollowerSubtypeList;

});
