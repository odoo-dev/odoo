/** @odoo-module alias=mail.components.DiscussMobileMailboxSelection **/

import usingModels from 'mail.componentMixins.usingModels';

const { Component } = owl;

class DiscussMobileMailboxSelection extends usingModels(Component) {

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * @returns {Thread[]}
     */
    get orderedMailboxes() {
        return this.env.services.action.dispatch('Thread/all',
                thread => (
                    thread.$$$isPinned(this) &&
                    thread.$$$model(this) === 'mail.box'
                ),
            )
            .sort(
                (mailbox1, mailbox2) => {
                    if (mailbox1 === this.env.services.model.messaging.$$$inbox(this)) {
                        return -1;
                    }
                    if (mailbox2 === this.env.services.model.messaging.$$$inbox(this)) {
                        return 1;
                    }
                    if (mailbox1 === this.env.services.model.messaging.$$$starred(this)) {
                        return -1;
                    }
                    if (mailbox2 === this.env.services.model.messaging.$$$starred(this)) {
                        return 1;
                    }
                    const mailbox1Name = mailbox1.$$$displayName(this);
                    const mailbox2Name = mailbox2.$$$displayName(this);
                    mailbox1Name < mailbox2Name ? -1 : 1;
                },
            );
    }

    /**
     * @returns {Discuss}
     */
    get discuss() {
        return (
            this.env.services.model.messaging &&
            this.env.services.model.messaging.$$$discuss(this)
        );
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
        const { mailboxLocalId } = ev.currentTarget.dataset;
        const mailbox = this.env.services.action.dispatch('Record/get', mailboxLocalId);
        if (!mailbox) {
            return;
        }
        this.env.services.action.dispatch('Thread/open', mailbox);
    }

}

Object.assign(DiscussMobileMailboxSelection, {
    props: {},
    template: 'mail.DiscussMobileMailboxSelection',
});

export default DiscussMobileMailboxSelection;
