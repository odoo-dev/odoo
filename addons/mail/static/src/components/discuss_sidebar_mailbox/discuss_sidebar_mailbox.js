/** @odoo-module **/

import useShouldUpdateBasedOnProps from '@mail/component_hooks/use_should_update_based_on_props/use_should_update_based_on_props';
import useStore from '@mail/component_hooks/use_store/use_store';
import ThreadIcon from '@mail/components/thread_icon/thread_icon';


const { Component } = owl;

const components = { ThreadIcon };

export class DiscussSidebarMailBox extends Component {

    /**
     * @override
     */
    constructor(...args) {
        super(...args);
        useShouldUpdateBasedOnProps();
        useStore(props => {
            const mailbox = this.env.models['mail.thread'].get(props.threadLocalId);
            return {
                discussThread: this.env.messaging.discuss && this.env.messaging.discuss.thread,
                mailbox,
                mailboxCounter: mailbox && mailbox.counter,
                mailBoxDisplayName: mailbox && mailbox.displayName,
                starred: this.env.messaging.starred,
            }
        })
    }

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * @returns {mail.thread}
     */
    get mailbox() {
        return this.env.models['mail.thread'].get(this.props.threadLocalId);
    }

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     */
     _onClick() {
        this.mailbox.open();
    }
 }

 Object.assign(DiscussSidebarMailBox, {
     components,
     props: {
        threadLocalId: String,
     },
     template: 'mail.DiscussSidebarMailBox',
 });

