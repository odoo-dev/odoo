/** @odoo-module alias=mail.components.DiscussSidebarItem **/

import usingModels from 'mail.componentMixins.usingModels';
import isEventHandled from 'mail.utils.isEventHandled';

import Dialog from 'web.Dialog';

const { Component, QWeb } = owl;

class DiscussSidebarItem extends usingModels(Component) {

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * Get the counter of this discuss item, which is based on the thread type.
     *
     * @returns {integer}
     */
    get counter() {
        if (this.thread.$$$model(this) === 'mail.box') {
            return this.thread.$$$counter(this);
        } else if (this.thread.$$$channelType(this) === 'channel') {
            return this.thread.$$$messageNeedactionCounter(this);
        } else if (this.thread.$$$channelType(this) === 'chat') {
            return this.thread.$$$localMessageUnreadCounter(this);
        }
        return 0;
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

    /**
     * @returns {boolean}
     */
    hasUnpin() {
        return this.thread.$$$channelType(this) === 'chat';
    }

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * @private
     * @returns {Promise}
     */
    _askAdminConfirmation() {
        return new Promise(resolve => {
            Dialog.confirm(this,
                this.env._t("You are the administrator of this channel. Are you sure you want to leave?"),
                {
                    buttons: [
                        {
                            text: this.env._t("Leave"),
                            classes: 'btn-primary',
                            close: true,
                            click: resolve
                        },
                        {
                            text: this.env._t("Discard"),
                            close: true
                        },
                    ],
                },
            );
        });
    }

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     * @param {Event} ev
     */
    _onCancelRenaming(ev) {
        this.env.services.action.dispatch('Discuss/cancelThreadRenaming',
            this.discuss,
            this.thread,
        );
    }

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClick(ev) {
        if (isEventHandled(ev, 'EditableText.click')) {
            return;
        }
        this.env.services.action.dispatch('Thread/open',
            this.thread,
        );
    }

    /**
     * Stop propagation to prevent selecting this item.
     *
     * @private
     * @param {CustomEvent} ev
     */
    _onClickedEditableText(ev) {
        ev.stopPropagation();
    }

    /**
     * @private
     * @param {MouseEvent} ev
     */
    async _onClickLeave(ev) {
        ev.stopPropagation();
        if (
            this.thread.$$$creator(this) ===
            this.env.services.model.messaging.$$$currentUser(this)
        ) {
            await this._askAdminConfirmation();
        }
        this.env.services.action.dispatch('Thread/unsubscribe',
            this.thread,
        );
    }

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickRename(ev) {
        ev.stopPropagation();
        this.env.services.action.dispatch('Discuss/setThreadRenaming',
            this.discuss,
            this.thread,
        );
    }

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickSettings(ev) {
        ev.stopPropagation();
        return this.env.bus.trigger('do-action', {
            action: {
                type: 'ir.actions.act_window',
                res_model: this.thread.$$$model(this),
                res_id: this.thread.$$$id(this),
                views: [[false, 'form']],
                target: 'current',
            },
        });
    }

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickUnpin(ev) {
        ev.stopPropagation();
        this.env.services.action.dispatch('Thread/unsubscribe', this.thread);
    }

    /**
     * @private
     * @param {CustomEvent} ev
     * @param {Object} ev.detail
     * @param {string} ev.detail.newName
     */
    _onValidateEditableText(ev) {
        ev.stopPropagation();
        this.env.services.action.dispatch('Discuss/renameThread',
            this.discuss,
            this.thread,
            ev.detail.newName,
        );
    }

}

Object.assign(DiscussSidebarItem, {
    props: {
        thread: {
            type: Object,
            validate(p) {
                if (p.constructor.modelName !== 'Thread') {
                    return false;
                }
                return true;
            },
        },
    },
    template: 'mail.DiscussSidebarItem',
});

QWeb.registerComponent('DiscussSidebarItem', DiscussSidebarItem);

export default DiscussSidebarItem;
