/** @odoo-module **/

import { useComponentToModel } from '@mail/component_hooks/use_component_to_model/use_component_to_model';
import { registerMessagingComponent } from '@mail/utils/messaging_component';

const { Component } = owl;

export class ThreadView extends Component {

    /**
     * @override
     */
    setup() {
        super.setup();
        useComponentToModel({ fieldName: 'component', modelName: 'ThreadView', propNameAsRecordLocalId: 'threadViewLocalId' });
    }

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * @returns {ThreadView}
     */
    get threadView() {
        return this.messaging && this.messaging.models['ThreadView'].get(this.props.threadViewLocalId);
    }

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     */
    _onClickRetryLoadMessages() {
        if (!this.threadView) {
            return;
        }
        if (!this.threadView.threadCache) {
            return;
        }
        this.threadView.threadCache.update({ hasLoadingFailed: false });
    }

}

Object.assign(ThreadView, {
    defaultProps: {
        hasComposerDiscardButton: false,
        hasComposerThreadName: false,
        showComposerAttachmentsExtensions: true,
        showComposerAttachmentsFilenames: true,
    },
    props: {
        /**
         * Function returns the exact scrollable element from the parent
         * to manage proper scroll heights which affects the load more messages.
         */
        getScrollableElement: {
            type: Function,
            optional: true,
        },
        hasComposerCurrentPartnerAvatar: {
            type: Boolean,
            optional: true,
        },
        hasComposerDiscardButton: {
            type: Boolean,
            optional: true,
        },
        hasComposerSendButton: {
            type: Boolean,
            optional: true,
        },
        hasComposerThreadName: {
            type: Boolean,
            optional: true,
        },
        /**
         * If set, determines whether the composer should display status of
         * members typing on related thread. When this prop is not provided,
         * it defaults to composer component default value.
         */
        hasComposerThreadTyping: {
            type: Boolean,
            optional: true,
        },
        hasScrollAdjust: {
            type: Boolean,
            optional: true,
        },
        onFocusin: {
            type: Function,
            optional: true,
        },
        showComposerAttachmentsExtensions: Boolean,
        showComposerAttachmentsFilenames: Boolean,
        threadViewLocalId: String,
    },
    template: 'mail.ThreadView',
});

registerMessagingComponent(ThreadView);
