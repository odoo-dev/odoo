/** @odoo-module alias=mail.components.Activity **/

import usingModels from 'mail.componentMixins.usingModels';

import {
    auto_str_to_date,
    getLangDateFormat,
    getLangDatetimeFormat,
} from 'web.time';

const { Component, QWeb, useState } = owl;
const { useRef } = owl.hooks;

class Activity extends usingModels(Component) {

    /**
     * @override
     */
    constructor(...args) {
        super(...args);
        this.state = useState({
            areDetailsVisible: false,
        });
        /**
         * Reference of the file uploader.
         * Useful to programmatically prompts the browser file uploader.
         */
        this._fileUploaderRef = useRef('fileUploader');
    }

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * @returns {string}
     */
    get assignedUserText() {
        return _.str.sprintf(
            this.env._t("for %s"),
            this.activity.assignee(this).nameOrDisplayName(this),
        );
    }

    /**
     * @returns {string}
     */
    get delayLabel() {
        const today = moment().startOf('day');
        const momentDeadlineDate = moment(
            auto_str_to_date(
                this.activity.dateDeadline(this),
            ),
        );
        // true means no rounding
        const diff = momentDeadlineDate.diff(today, 'days', true);
        if (diff === 0) {
            return this.env._t("Today:");
        } else if (diff === -1) {
            return this.env._t("Yesterday:");
        } else if (diff < 0) {
            return _.str.sprintf(this.env._t("%d days overdue:"), Math.abs(diff));
        } else if (diff === 1) {
            return this.env._t("Tomorrow:");
        } else {
            return _.str.sprintf(this.env._t("Due in %d days:"), Math.abs(diff));
        }
    }

    /**
     * @returns {string}
     */
    get formattedCreateDatetime() {
        const momentCreateDate = moment(
            auto_str_to_date(
                this.activity.dateCreate(this),
            ),
        );
        const datetimeFormat = getLangDatetimeFormat();
        return momentCreateDate.format(datetimeFormat);
    }

    /**
     * @returns {string}
     */
    get formattedDeadlineDate() {
        const momentDeadlineDate = moment(
            auto_str_to_date(
                this.activity.dateDeadline(this),
            ),
        );
        const datetimeFormat = getLangDateFormat();
        return momentDeadlineDate.format(datetimeFormat);
    }

    /**
     * @returns {string}
     */
    get MARK_DONE() {
        return this.env._t("Mark Done");
    }

    /**
     * @returns {string}
     */
    get summary() {
        return _.str.sprintf(
            this.env._t("“%s”"),
            this.activity.summary(this),
        );
    }

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     * @param {CustomEvent} ev
     * @param {Object} ev.detail
     * @param {Attachment} ev.detail.attachment
     */
    _onAttachmentCreated(ev) {
        this.env.services.action.dispatch(
            'Activity/markAsDone',
            this.activity,
            { attachments: [ev.detail.attachment] },
        );
    }

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClick(ev) {
        if (
            ev.target.tagName === 'A' &&
            ev.target.dataset.oeId &&
            ev.target.dataset.oeModel
        ) {
            this.env.services.action.dispatch(
                'Messaging/openProfile',
                this.env.services.model.messaging,
                {
                    id: Number(ev.target.dataset.oeId),
                    model: ev.target.dataset.oeModel,
                },
            );
            // avoid following dummy href
            ev.preventDefault();
        }
    }

    /**
     * @private
     * @param {MouseEvent} ev
     */
    async _onClickCancel(ev) {
        ev.preventDefault();
        await this.env.services.action.dispatch(
            'Activity/deleteServerRecord',
            this.activity,
        );
        this.trigger('reload', { keepChanges: true });
    }

    /**
     * @private
     */
    _onClickDetailsButton() {
        this.state.areDetailsVisible = !this.state.areDetailsVisible;
    }

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickEdit(ev) {
        this.env.services.action.dispatch(
            'Activity/edit',
            this.activity,
        );
    }

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickUploadDocument(ev) {
        this._fileUploaderRef.comp.openBrowserFileUploader();
    }

}

Object.assign(Activity, {
    props: {
        activity: {
            type: Object,
            validate(p) {
                if (p.constructor.modelName !== 'Activity') {
                    return false;
                }
                return true;
            },
        },
    },
    template: 'mail.Activity',
});

QWeb.registerComponent('Activity', Activity);

export default Activity;
