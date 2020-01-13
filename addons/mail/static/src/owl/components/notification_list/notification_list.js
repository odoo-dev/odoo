odoo.define('mail.component.NotificationList', function (require) {
'use strict';

const ThreadNotification = require('mail.component.ThreadNotification');
const MailFailureNotification = require('mail.component.MailFailureNotification');
const useStore = require('mail.hooks.useStore');

const { Component } = owl;
const { useDispatch, useGetters } = owl.hooks;

class NotificationList extends Component {

    /**
     * @override
     * @param {...any} args
     */
    constructor(...args) {
        super(...args);
        this.storeDispatch = useDispatch();
        this.storeGetters = useGetters();
        this.storeProps = useStore((state, props) => {
            return {
                isMobile: state.isMobile,
                notifications: this.storeGetters.notifications({ filter: props.filter }),
            };
        }, {
            compareDepth: {
                notifications: 1,
            },
        });
    }

    mounted() {
        this._loadPreviews();
    }

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * Load previews of given thread. Basically consists of fetching all missing
     * last messages of each thread.
     *
     * @private
     */
    async _loadPreviews() {
        this.storeDispatch('loadThreadPreviews',
            this.storeProps.notifications
                .filter(notification => notification.threadLocalId)
                .map(notification => notification.threadLocalId)
        );
    }

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     * @param {CustomEvent} ev
     * @param {Object} ev.detail
     * @param {string} ev.detail.threadLocalId
     */
    _onClickedPreview(ev) {
        this.trigger('o-select-thread', {
            threadLocalId: ev.detail.threadLocalId,
        });
    }
}

NotificationList.components = { ThreadNotification, MailFailureNotification };

NotificationList.defaultProps = {
    filter: 'all',
};

NotificationList.props = {
    filter: {
        type: String, // ['all', 'mailbox', 'channel', 'chat']
    },
};

NotificationList.template = 'mail.component.NotificationList';

return NotificationList;

});
