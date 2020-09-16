/** @odoo-module alias=mail.components.FollowButton **/

import usingModels from 'mail.componentMixins.usingModels';

const { Component } = owl;
const { useState } = owl.hooks;

class FollowButton extends usingModels(Component) {
    /**
     * @override
     */
    constructor(...args) {
        super(...args);
        this.state = useState({
            /**
             * Determine whether the unfollow button is highlighted or not.
             */
            isUnfollowButtonHighlighted: false,
        });
    }

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickFollow(ev) {
        this.env.services.action.dispatch('Thread/follow', this.thread);
    }

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickUnfollow(ev) {
        this.env.services.action.dispatch('Thread/unfollow', this.thread);
    }

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onMouseLeaveUnfollow(ev) {
        this.state.isUnfollowButtonHighlighted = false;
    }

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onMouseEnterUnfollow(ev) {
        this.state.isUnfollowButtonHighlighted = true;
    }

}

Object.assign(FollowButton, {
    defaultProps: {
        isDisabled: false,
    },
    props: {
        isDisabled: Boolean,
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
    template: 'mail.FollowButton',
});

export default FollowButton;
