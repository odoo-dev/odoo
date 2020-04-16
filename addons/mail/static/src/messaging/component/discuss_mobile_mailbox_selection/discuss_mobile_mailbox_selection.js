odoo.define('mail.messaging.component.DiscussMobileMailboxSelection', function (require) {
'use strict';

const useStore = require('mail.messaging.component_hook.useStore');

const { Component } = owl;

class DiscussMobileMailboxSelection extends Component {

    /**
     * @override
     */
    constructor(...args) {
        super(...args);
        useStore(props => {
            return {
                allOrderedAndPinnedMailboxes: this.orderedMailboxes.map(mailbox => mailbox.__state),
                discussThread: this.env.messaging.discuss.thread
                    ? this.env.messaging.discuss.thread.__state
                    : undefined,
            };
        }, {
            compareDepth: {
                allOrderedAndPinnedMailboxes: 1,
            },
        });
    }

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * @returns {mail.messaging.entity.Thread[]}
     */
    get orderedMailboxes() {
        return this.env.entities.Thread
            .all(thread => thread.isPinned && thread.model === 'mail.box')
            .sort((mailbox1, mailbox2) => {
                if (mailbox1.id === 'inbox') {
                    return -1;
                }
                if (mailbox2.id === 'inbox') {
                    return 1;
                }
                if (mailbox1.id === 'starred') {
                    return -1;
                }
                if (mailbox2.id === 'starred') {
                    return 1;
                }
                const mailbox1Name = mailbox1.displayName;
                const mailbox2Name = mailbox2.displayName;
                mailbox1Name < mailbox2Name ? -1 : 1;
            });
    }

    /**
     * @returns {mail.messaging.entity.Discuss}
     */
    get discuss() {
        return this.env.messaging && this.env.messaging.discuss;
    }

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * Called when clicking on a mailbox selection item.
     *
     * @private
     * @param {MouseEvent} ev
     */
    _onClick(ev) {
        const { mailbox } = ev.currentTarget.dataset;
        this.discuss.threadViewer.update({ thread: [['link', mailbox]] });
    }

}

Object.assign(DiscussMobileMailboxSelection, {
    props: {},
    template: 'mail.messaging.component.DiscussMobileMailboxSelection',
});

return DiscussMobileMailboxSelection;

});
