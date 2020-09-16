/** @odoo-module alias=mail.components.NotificationGroup **/

import usingModels from 'mail.componentMixins.usingModels';

const { Component } = owl;
const { useRef } = owl.hooks;

class NotificationGroup extends usingModels(Component) {

    /**
     * @override
     */
    constructor(...args) {
        super(...args);
        /**
         * Reference of the "mark as read" button. Useful to disable the
         * top-level click handler when clicking on this specific button.
         */
        this._markAsReadRef = useRef('markAsRead');
    }

    /**
     * @returns {string|undefined}
     */
    image() {
        if (this.notificationGroup.$$$type(this) === 'email') {
            return '/mail/static/src/img/smiley/mailfailure.jpg';
        }
    }

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClick(ev) {
        const markAsRead = this._markAsReadRef.el;
        if (markAsRead && markAsRead.contains(ev.target)) {
            // handled in `_onClickMarkAsRead`
            return;
        }
        this.env.services.action.dispatch('NotificationGroup/openDocuments',
            this.notificationGroup,
        );
        if (!this.env.services.model.messaging.$$$device(this).$$$isMobile(this)) {
            this.env.services.action.dispatch('MessagingMenu/close',
                this.env.services.model.messaging.$$$messagingMenu(this),
            );
        }
    }

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickMarkAsRead(ev) {
        this.env.services.action.dispatch('NotificationGroup/openCancelAction',
            this.notificationGroup,
        );
        if (!this.env.services.model.messaging.$$$device(this).$$$isMobile(this)) {
            this.env.services.action.dispatch('MessagingMenu/close',
                this.env.services.model.messaging.$$$messagingMenu(this),
            );
        }
    }

}

Object.assign(NotificationGroup, {
    props: {
        notificationGroup: {
            type: Object,
            validate(p) {
                if (p.constructor.modelName !== 'NotificationGroup') {
                    return false;
                }
                return true;
            },
        },
    },
    template: 'mail.NotificationGroup',
});

export default NotificationGroup;
