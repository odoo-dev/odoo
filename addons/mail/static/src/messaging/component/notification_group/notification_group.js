odoo.define('mail.messaging.component.NotificationGroup', function (require) {
'use strict';

const useStore = require('mail.messaging.component_hook.useStore');

const { Component } = owl;
const { useRef } = owl.hooks;

class NotificationGroup extends Component {

    /**
     * @override
     */
    constructor(...args) {
        super(...args);
        useStore(props => {
            const group = this.env.entities.NotificationGroup.get(props.notificationGroupLocalId);
            return {
                group: group ? group.__state : undefined,
            };
        });
        /**
         * Reference of the "mark as read" button. Useful to disable the
         * top-level click handler when clicking on this specific button.
         */
        this._markAsReadRef = useRef('markAsRead');
    }

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * @returns {mail.messaging.entity.Notification}
     */
    get group() {
        return this.env.entities.NotificationGroup.get(this.props.notificationGroupLocalId);
    }

    /**
     * @returns {string|undefined}
     */
    image() {
        if (this.group.notification_type === 'email') {
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
            // handled in `_onClickFailureDiscard`
            return;
        }
        this.group.openDocuments();
    }

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickFailureDiscard(ev) {
        this.group.openCancelAction();
    }

}

Object.assign(NotificationGroup, {
    props: {
        notificationGroupLocalId: String,
    },
    template: 'mail.messaging.component.NotificationGroup',
});

return NotificationGroup;

});
