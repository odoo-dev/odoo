odoo.define('mail.component.Chatter', function (require) {
'use strict';

const Activity = require('mail.Activity');
// TODO: we should probably use something like ChatterComposer here, which is
// a bit different from classic composer
const AttachmentBox = require('mail.component.AttachmentBox');
const Followers = require('mail.Followers');
const Composer = require('mail.component.Composer');
const Thread = require('mail.component.Thread');

class Chatter extends owl.store.ConnectedComponent {

    /**
     * @param {...any} args
     */
    constructor(...args) {
        super(...args);
        this.components = { AttachmentBox, Composer, Thread };
        this.id = _.uniqueId('o_chatter_');
        this.state = {
            hasComposer: false,
            isAttachmentBoxOpen: false,
            isComposerLog: false,
        };
        this.template = 'mail.component.Chatter';

        this.fields = {};  // for Odoo widgets
        if (this.props.mailFields.mail_activity) {
            this.fields.activity = new Activity(
                this.props.parent,
                this.props.mailFields.mail_activity,
                this.props.record,
                this.props.fieldOptions);
        }
        if (this.props.mailFields.mail_followers) {
            this.fields.followers = new Followers(
                this.props.parent,
                this.props.mailFields.mail_followers,
                this.props.record,
                this.props.fieldOptions);
        }
        const threadField = this.props.mailFields.mail_thread;
        if (threadField) {
            var fieldsInfo = this.props.record.fieldsInfo[this.props.fieldOptions.viewType || this.props.parent.viewType];
            var nodeOptions = fieldsInfo[threadField].options || {};
            this.hasLogButton = this.props.fieldOptions.display_log_button || nodeOptions.display_log_button;

            // TODO
            // this.postRefresh = nodeOptions.post_refresh || 'never';
            // this.reloadOnUploadAttachment = this.postRefresh === 'always';
        }
    }

    async willStart() {
        const proms = _.invoke(this.fields, 'appendTo', $('<div>'));
        await Promise.all(proms);
    }

    mounted() {
        if (
            this.props.mailFields.mail_thread &&
            this.props.record.res_id
        ) {
            this._insertThread();
        }

        // append Odoo widgets for optionnal activities and followers
        if (this.fields.activity) {
            this.refs.activity.appendChild(this.fields.activity.$el[0]);
        }
        if (this.fields.followers) {
            this.refs.topbarRightArea.appendChild(this.fields.followers.$el[0]);
        }
    }

    patched() {
        _.invoke(this.fields, 'reset', this.props.record);
    }

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * @private
     */
    _insertThread() {
        const threadField = this.props.mailFields.mail_thread;
        const threadLocalId = this.env.store.commit('insertThread', {
            _model: this.props.record.model,
            id: this.props.record.res_id,
        });
        this.env.store.commit('updateDocumentThreadMessageIds', threadLocalId,
            this.props.record.data[threadField].res_ids);
    }

    /**
     * @private
     */
    _resetComposerState() {
        this.state.hasComposer = false;
        this.state.composerMode = 'send';
    }

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     */
    _onAttachmentClick() {
        this.state.isAttachmentBoxOpen = !this.state.isAttachmentBoxOpen;
    }

    /**
     * @private
     */
    _onClickLog() {
        this.state.hasComposer = true;
        this.state.isComposerLog = true;
    }

    /**
     * @private
     */
    _onClickSend() {
        this.state.hasComposer = true;
        this.state.isComposerLog = false;
        if (!this.props.suggestedRecipients) {
            this.env.store.dispatch('fetchSuggestedRecipientsOnThread',
                this.props.threadLocalId);
        }
    }

    /**
     * @private
     */
    _onClickScheduleActivity() {
        this.fields.activity.scheduleActivity();
    }

    /**
     * @private
     */
    _onFullComposerOpened() {
        this._resetComposerState();
    }

    /**
     * @private
     */
    _onMessagePosted() {
        this._resetComposerState();
    }
}

/**
 * @param {Object} state
 * @param {Object} ownProps
 * @param {Object} ownProps.record
 * @param {string} ownProps.record.model
 * @param {integer} ownProps.record.res_id
 * @return {Object}
 */
Chatter.mapStoreToProps = function (state, ownProps) {
    const record = ownProps.record;
    const threadLocalId = `${record.model}_${record.res_id}`;
    const thread = state.threads[threadLocalId];
    const suggestedRecipients = thread && thread.suggestedRecipients;
    return {
        suggestedRecipients,
        thread,
        threadLocalId,
    };
};

Chatter.props = {
    fieldOptions: Object,
    mailFields: {
        type: Object,
        shape: {
            mail_activity: {
                type: String,
                optional: true,
            },
            mail_followers: {
                type: String,
                optional: true,
            },
            mail_thread: {
                type: String,
                optional: true,
            },
        },
    },
    parent: Object,
    record: {
        type: Object,
        shape: {
            data: {
                type: Object,
                shape: {
                    display_name: String,
                    message_attachment_count: Number,
                },
            },
            model: String,
            res_id: Number,
        },
    },
    suggestedRecipients: {
        type: Array,
        element: {
            type: Object,
            shape: {
                checked: Boolean,
                partnerLocalId: String,
                reason: String,
            },
        },
        optional: true,
    },
    thread: {
        type: Object, // {mail.store.model.Thread}
        optional: true,
    },
    threadLocalId: {
        type: String,
        optional: true,
    },
};

return Chatter;

});
