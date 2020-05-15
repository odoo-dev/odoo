odoo.define('mail.messaging.entity.Chatter', function (require) {
'use strict';

const { registerNewEntity } = require('mail.messaging.entityCore');
const { attr, one2many, one2one } = require('mail.messaging.EntityField');

function ChatterFactory({ Entity }) {

    const getThreadNextTemporaryId = (function () {
        let tmpId = 0;
        return () => {
            tmpId -= 1;
            return tmpId;
        };
    })();

    const getMessageNextTemporaryId = (function () {
        let tmpId = 0;
        return () => {
            tmpId -= 1;
            return tmpId;
        };
    })();

    class Chatter extends Entity {

        /**
         * @override
         */
        delete() {
            this._stopAttachmentsLoading();
            super.delete();
        }

        //----------------------------------------------------------------------
        // Public
        //----------------------------------------------------------------------

        async refresh() {
            const thread = this.thread;
            if (!thread || thread.isTemporary) {
                return;
            }
            thread.loadNewMessages();
            if (!this._isPreparingAttachmentsLoading && !this.isShowingAttachmentsLoading) {
                this._prepareAttachmentsLoading();
            }
            await thread.fetchAttachments();
            this._stopAttachmentsLoading();
        }

        async refreshActivities() {
            // A bit "extreme", may be improved
            const [{ activity_ids: newActivityIds }] = await this.async(() => this.env.rpc({
                model: this.thread.model,
                method: 'read',
                args: [this.thread.id, ['activity_ids']]
            }));
            const activitiesData = await this.async(() => this.env.rpc({
                model: 'mail.activity',
                method: 'activity_format',
                args: [newActivityIds]
            }));
            const activities = [];
            for (const activityData of activitiesData) {
                const activity = this.env.entities.Activity.insert(
                    this.env.entities.Activity.convertData(activityData)
                );
                activities.push(activity);
            }
            this.update({ activities: [['replace', activities]] });
        }

        showLogNote() {
            this.update({
                isComposerLog: true,
                isComposerVisible: true,
            });
        }

        showSendMessage() {
            this.update({
                isComposerLog: false,
                isComposerVisible: true,
            });
        }

        toggleActivityBoxVisibility() {
            this.update({ isActivityBoxVisible: !this.isActivityBoxVisible });
        }

        //----------------------------------------------------------------------
        // Private
        //----------------------------------------------------------------------

        /**
         * @private
         * @returns {mail.messaging.entity.Activity[]}
         */
        _computeFutureActivities() {
            return [['replace', this.activities.filter(activity => activity.state === 'planned')]];
        }

        /**
         * @private
         * @returns {boolean}
         */
        _computeIsDisabled() {
            return !this.threadId;
        }

        /**
         * @private
         * @returns {mail.messaging.entity.Activity[]}
         */
        _computeOverdueActivities() {
            return [['replace', this.activities.filter(activity => activity.state === 'overdue')]];
        }

        /**
         * @private
         * @returns {mail.messaging.entity.Activity[]}
         */
        _computeTodayActivities() {
            return [['replace', this.activities.filter(activity => activity.state === 'today')]];
        }

        /**
         * @private
         */
        _prepareAttachmentsLoading() {
            this._isPreparingAttachmentsLoading = true;
            this._attachmentsLoaderTimeout = setTimeout(() => {
                this.update({isShowingAttachmentsLoading: true});
                this._isPreparingAttachmentsLoading = false;
            }, this.env.loadingBaseDelayDuration);
        }

        /**
         * @private
         */
        _stopAttachmentsLoading() {
            clearTimeout(this._attachmentsLoaderTimeout);
            this._attachmentsLoaderTimeout = null;
            this.update({isShowingAttachmentsLoading: false});
            this._isPreparingAttachmentsLoading = false;
        }

        /**
         * @override
         */
        _updateAfter(previous) {
            // thread
            if (
                this.threadModel !== previous.threadModel ||
                this.threadId !== previous.threadId
            ) {
                // change of thread
                this._updateRelationThread();
                if (previous.thread && previous.thread.isTemporary) {
                    // AKU FIXME: make dedicated models for "temporary" threads,
                    // so that it auto-handles causality of messages for deletion
                    // automatically
                    const oldMainThreadCache = previous.thread.mainCache;
                    const message = oldMainThreadCache.messages[0];
                    message.delete();
                    previous.thread.delete();
                }
            }

            if (previous.activityIds.join(',') !== this.activityIds.join(',')) {
                this.refreshActivities();
            }
            if (
                previous.followerIds.join(',') !== this.followerIds.join(',') &&
                !this.thread.isTemporary
            ) {
                this.thread.refreshFollowers();
            }
            if (
                previous.thread !== this.thread ||
                (this.thread && this.messageIds.join(',') !== previous.messageIds.join(','))
            ) {
                this.refresh();
            }
        }

        /**
         * @override
         */
        _updateBefore() {
            return {
                activityIds: this.activityIds,
                followerIds: this.followerIds,
                messageIds: this.messageIds,
                threadModel: this.threadModel,
                threadId: this.threadId,
                thread: this.thread,
            };
        }

        /**
         * @private
         */
        _updateRelationThread() {
            if (!this.threadId) {
                if (this.thread && this.thread.isTemporary) {
                    return;
                }
                const nextId = getThreadNextTemporaryId();
                const thread = this.env.entities.Thread.create({
                    areAttachmentsLoaded: true,
                    id: nextId,
                    isTemporary: true,
                    model: this.threadModel,
                });
                const currentPartner = this.env.messaging.currentPartner;
                const message = this.env.entities.Message.create({
                    author: [['link', currentPartner]],
                    body: this.env._t("Creating a new record..."),
                    id: getMessageNextTemporaryId(),
                    isTemporary: true,
                });
                this.threadViewer.update({ thread: [['link', thread]] });
                for (const cache of thread.caches) {
                    cache.update({ messages: [['link', message]] });
                }
            } else {
                // thread id and model
                const thread = this.env.entities.Thread.insert({
                    id: this.threadId,
                    model: this.threadModel,
                });
                this.threadViewer.update({ thread: [['link', thread]] });
            }
        }

    }

    Chatter.entityName = 'Chatter';

    Chatter.fields = {
        activities: one2many('Activity', {
            inverse: 'chatter',
        }),
        activityIds: attr({
            default: [],
        }),
        activitiesState: attr({
            related: 'activities.state',
        }),
        context: attr({
            default: {},
        }),
        followerIds: attr({
            default: [],
        }),
        futureActivities: one2many('Activity', {
            compute: '_computeFutureActivities',
            dependencies: ['activitiesState'],
        }),
        hasActivities: attr({
            default: true,
        }),
        hasExternalBorder: attr({
            default: true,
        }),
        hasFollowers: attr({
            default: true,
        }),
        hasThread: attr({
            default: true,
        }),
        hasTopbarCloseButton: attr({
            default: false,
        }),
        isActivityBoxVisible: attr({
            default: true,
        }),
        isAttachmentBoxVisible: attr({
            default: false,
        }),
        isComposerLog: attr({
            default: true,
        }),
        isComposerVisible: attr({
            default: false,
        }),
        isDisabled: attr({
            compute: '_computeIsDisabled',
            default: false,
            dependencies: ['threadId'],
        }),
        isShowingAttachmentsLoading: attr({
            default: false,
        }),
        messageIds: attr({
            default: [],
        }),
        overdueActivities: one2many('Activity', {
            compute: '_computeOverdueActivities',
            dependencies: ['activitiesState'],
        }),
        thread: one2one('Thread', {
            related: 'threadViewer.thread',
        }),
        threadAttachmentCount: attr({
            default: 0,
        }),
        threadId: attr(),
        threadModel: attr(),
        threadViewer: one2one('ThreadViewer', {
            autocreate: true,
        }),
        todayActivities: one2many('Activity', {
            compute: '_computeTodayActivities',
            dependencies: ['activitiesState'],
        }),
    };

    return Chatter;
}

registerNewEntity('Chatter', ChatterFactory);

});
