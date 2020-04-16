odoo.define('mail.messaging.component.FollowerListMenu', function (require) {
'use strict';

const components = {
    Follower: require('mail.messaging.component.Follower'),
};
const useStore = require('mail.messaging.component_hook.useStore');

const { Component } = owl;
const { useRef, useState } = owl.hooks;

class FollowerListMenu extends Component {
    /**
     * @override
     */
    constructor(...args) {
        super(...args);
        this.state = useState({
            /**
             * Determine whether the dropdown is open or not.
             */
            isDropdownOpen: false,
        });
        useStore(props => {
            const thread = this.env.entities.Thread.get(props.threadLocalId);
            const followers = thread ? thread.followers : [];
            return {
                followers: followers.map(follower => follower.__state),
                thread: thread ? thread.__state : undefined,
            };
        }, {
            compareDepth: {
                followers: 1,
            },
        });
        this._dropdownRef = useRef('dropdown');
        this._onClickCaptureGlobal = this._onClickCaptureGlobal.bind(this);
    }

    mounted() {
        document.addEventListener('click', this._onClickCaptureGlobal, true);
    }

    willUnmount() {
        document.removeEventListener('click', this._onClickCaptureGlobal, true);
    }

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * @return {mail.messaging.entity.Thread}
     */
    get thread() {
        return this.env.entities.Thread.get(this.props.threadLocalId);
    }

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * @private
     */
    _hide() {
        this.state.isDropdownOpen = false;
    }

    /**
     * @private
     * @param {KeyboardEvent} ev
     */
    _onKeydown(ev) {
        ev.stopPropagation();
        switch (ev.key) {
            case 'Escape':
                ev.preventDefault();
                this._hide();
                break;
        }
    }

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickAddChannels(ev) {
        ev.preventDefault();
        this._hide();
        this.thread.promptAddChannelFollower();
    }

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickAddFollowers(ev) {
        ev.preventDefault();
        this._hide();
        this.thread.promptAddPartnerFollower();
    }

    /**
     * Close the dropdown when clicking outside of it.
     *
     * @private
     * @param {MouseEvent} ev
     */
    _onClickCaptureGlobal(ev) {
        // since dropdown is conditionally shown based on state, dropdownRef can be null
        if (this._dropdownRef.el && !this._dropdownRef.el.contains(ev.target)) {
            this._hide();
        }
    }

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickFollowersButton(ev) {
        this.state.isDropdownOpen = !this.state.isDropdownOpen;
    }

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickFollower(ev) {
        this._hide();
    }
}

Object.assign(FollowerListMenu, {
    components,
    defaultProps: {
        isDisabled: false,
    },
    props: {
        isDisabled: Boolean,
        threadLocalId: String,
    },
    template: 'mail.messaging.component.FollowerListMenu',
});

return FollowerListMenu;

});
