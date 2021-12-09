/** @odoo-module **/

import { registerMessagingComponent } from '@mail/utils/messaging_component';
import { useRefToModel } from '@mail/component_hooks/use_ref_to_model/use_ref_to_model';
import { useUpdate } from '@mail/component_hooks/use_update/use_update';

const { Component, useRef } = owl;

export class DiscussSidebar extends Component {

    /**
     * @override
     */
    setup() {
        super.setup();
        useUpdate({ func: () => this._update() });
        useRefToModel({ fieldName: 'startAMeetingButtonRef', modelName: 'Discuss', propNameAsRecordLocalId: 'localId', refName: 'startAMeetingButton' });
        /**
         * Reference of the quick search input. Useful to filter channels and
         * chats based on this input content.
         */
        this._quickSearchInputRef = useRef('quickSearchInput');
    }

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * @returns {Discuss}
     */
    get discuss() {
        return this.messaging && this.messaging.models['Discuss'].get(this.props.localId);
    }

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * @private
     */
    _update() {
        if (!this.discuss) {
            return;
        }
        if (this._quickSearchInputRef.el) {
            this._quickSearchInputRef.el.value = this.discuss.sidebarQuickSearchValue;
        }
    }

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     * @param {KeyboardEvent} ev
     */
    _onInputQuickSearch(ev) {
        ev.stopPropagation();
        this.discuss.onInputQuickSearch(this._quickSearchInputRef.el.value);
    }

}

Object.assign(DiscussSidebar, {
    props: {
        localId: String
    },
    template: 'mail.DiscussSidebar',
});

registerMessagingComponent(DiscussSidebar);
