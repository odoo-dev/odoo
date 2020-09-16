/** @odoo-module alias=mail.components.ChatterContainer **/

import useUpdate from 'mail.componentHooks.useUpdate';
import usingModels from 'mail.componentMixins.usingModels';

const { Component, QWeb } = owl;

/**
 * This component abstracts chatter component to its parent, so that it can be
 * mounted and receive chatter data even when a chatter component cannot be
 * created. Indeed, in order to create a chatter component, we must create
 * a chatter record, the latter requiring messaging to be initialized. The view
 * may attempt to create a chatter before messaging has been initialized, so
 * this component delays the mounting of chatter until it becomes initialized.
 */
class ChatterContainer extends usingModels(Component) {

    /**
     * @override
     */
    constructor(...args) {
        super(...args);
        useUpdate({ func: () => this._update() });
        this.chatter = undefined;
        this._wasMessagingInitialized = false;
    }

    mounted() {
        this._update();
    }

    /**
     * @override
     */
    willUpdateProps(nextProps) {
        const res = super.willUpdateProps(...arguments);
        if (this.env.isMessagingInitialized()) {
            this._insertFromProps(nextProps);
        }
        return res;
    }

    /**
     * @override
     */
    destroy() {
        super.destroy();
        if (this.chatter) {
            this.env.services.action.dispatch(
                'Record/delete',
                this.chatter,
            );
        }
    }

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * @private
     * @param {Object} props
     * @returns {Object}
     */
    _convertPropsToChatterFields(props) {
        return {
            activityIds: props.activityIds,
            context: props.context,
            followerIds: props.followerIds,
            hasActivities: props.hasActivities,
            hasFollowers: props.hasFollowers,
            hasMessageList: props.hasMessageList,
            isAttachmentBoxVisibleInitially: props.isAttachmentBoxVisibleInitially,
            messageIds: props.messageIds,
            threadAttachmentCount: props.threadAttachmentCount,
            threadId: props.threadId,
            threadModel: props.threadModel,
        };
    }

    /**
     * @private
     */
    _insertFromProps(props) {
        const values = { ...props };
        if (values.threadId === undefined) {
            values.threadId = this.env.services.action.dispatch(
                'RecordFieldCommand/clear',
            );
        }
        if (!this.chatter) {
            this.chatter = this.env.services.action.dispatch(
                'Chatter/create',
                this._convertPropsToChatterFields(values),
            );
        } else {
            this.env.services.action.dispatch(
                'Record/update',
                this.chatter,
                this._convertPropsToChatterFields(values),
            );
        }
    }

    /**
     * @private
     */
    _update() {
        if (this.chatter) {
            this.env.services.action.dispatch(
                'Chatter/refresh',
                this.chatter,
            );
        }
    }

}

Object.assign(ChatterContainer, {
    props: {
        hasActivities: {
            type: Boolean,
            optional: true,
        },
        hasExternalBorder: {
            type: Boolean,
            optional: true,
        },
        hasFollowers: {
            type: Boolean,
            optional: true,
        },
        hasMessageList: {
            type: Boolean,
            optional: true,
        },
        hasMessageListScrollAdjust: {
            type: Boolean,
            optional: true,
        },
        hasTopbarCloseButton: {
            type: Boolean,
            optional: true,
        },
        isAttachmentBoxVisibleInitially: {
            type: Boolean,
            optional: true,
        },
        threadId: {
            type: Number,
            optional: true,
        },
        threadModel: String,
    },
    template: 'mail.ChatterContainer',
});

QWeb.registerComponent('ChatterContainer', ChatterContainer);

export default ChatterContainer;
