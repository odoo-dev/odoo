odoo.define('mail.messaging.component.FollowerSubtype', function (require) {
'use strict';

const useStore = require('mail.messaging.component_hook.useStore');

const { Component } = owl;

class FollowerSubtype extends Component {

    /**
     * @override
     */
    constructor(...args) {
        super(...args);
        useStore(props => {
            const followerSubtype = this.env.entities.FollowerSubtype.get(props.followerSubtypeLocalId);
            return [followerSubtype ? followerSubtype.__state : undefined];
        });
    }

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * @returns {mail.messaging.entity.Follower|undefined}
     */
    get follower() {
        return this.env.entities.Follower.get(this.props.followerLocalId);
    }

    /**
     * @returns {mail.messaging.entity.FollowerSubtype}
     */
    get followerSubtype() {
        return this.env.entities.FollowerSubtype.get(this.props.followerSubtypeLocalId);
    }

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
            this.follower.selectSubtype(this.followerSubtype);
        } else {
            this.follower.unselectSubtype(this.followerSubtype);
        }
    }

}

Object.assign(FollowerSubtype, {
    props: {
        followerLocalId: String,
        followerSubtypeLocalId: String,
    },
    template: 'mail.messaging.component.FollowerSubtype',
});

return FollowerSubtype;

});
