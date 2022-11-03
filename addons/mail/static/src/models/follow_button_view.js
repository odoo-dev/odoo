/** @odoo-module **/

import { registerModel } from '@mail/model/model_core';
import { attr, one } from '@mail/model/model_field';
import { clear } from '@mail/model/model_field_command';

registerModel({
    name: 'FollowButtonView',
    template: 'mail.FollowButtonView',
    recordMethods: {
        /**
         * @param {MouseEvent} ev
         */
        onClickFollow(ev) {
            if (!this.exists()) {
                return;
            }
            if (!this.chatterOwner || !this.chatterOwner.thread) {
                return;
            }
            this.chatterOwner.thread.follow();
        },
        /**
         * @param {MouseEvent} ev
         */
        onClickUnfollow(ev) {
            if (!this.exists()) {
                return;
            }
            if (!this.chatterOwner || !this.chatterOwner.thread) {
                return;
            }
            this.chatterOwner.thread.unfollow();
            this.chatterOwner.reloadParentView({ fieldNames: ['message_follower_ids'] });
        },
        /**
         * @param {MouseEvent} ev
         */
        onMouseEnterUnfollow(ev) {
            if (!this.exists()) {
                return;
            }
            this.update({ isUnfollowButtonHighlighted: true });
        },
        /**
         * @param {MouseEvent} ev
         */
        onMouseleaveUnfollow(ev) {
            if (!this.exists()) {
                return;
            }
            this.update({ isUnfollowButtonHighlighted: false });
        },
    },
    fields: {
        chatterOwner: one('Chatter', { identifying: true, inverse: 'followButtonView' }),
        followingText: attr({
            compute() {
                return this.env._t("Following");
            },
        }),
        isDisabled: attr({
            compute() {
                if (!this.chatterOwner) {
                    return clear();
                }
                return !this.chatterOwner.hasReadAccess;
            },
        }),
        isUnfollowButtonHighlighted: attr({ default: false }),
        unfollowingText: attr({
            compute() {
                return this.env._t("Unfollow");
            },
        }),
    },
});
