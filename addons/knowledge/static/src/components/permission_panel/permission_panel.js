/** @odoo-module **/

import session from 'web.session';
import Dialog from 'web.Dialog';
import { _t } from 'web.core';
import { useService } from '@web/core/utils/hooks';

const { Component, onWillStart, useState } = owl;
const permissionLevel = {'none': 0, 'read': 1, 'write': 2}
const restrictMessage = _t("Are you sure you want to restrict this role and restrict access ? "
+ "This article will no longer inherit access settings from the parent page.");

class PermissionPanel extends Component {
    /**
     * @override
     */
    setup () {
        super.setup();
        this.rpc = useService('rpc');
        this.state = useState({
            loading: true,
            partner_id: session.partner_id
        })
        onWillStart(this.loadPanel);
    }

    async loadPanel () {
        const data = await this.loadData();
        this.state = {
            ...this.state,
            ...data,
            loading: false
        };
        this.render();
        this._showPanel();
    }

    /**
     * @returns {Object}
     */
    async loadData () {
        return await this.rpc({
            route: '/knowledge/get_article_permission_panel_data',
            params: {
                article_id: this.props.article_id
            }
        });
    }

    /**
     * @returns {Array[Array]}
     */
    getInternalPermissionOptions () {
        return this.state.internal_permission_options;
    }

    /**
     * @param {Proxy} member
     * @returns {Array[Array]}
     */
    getMemberPermissionOptions (member) {
        if (member.is_external) {
            return this.state.members_options.filter(option => {
                return option[0] === 'read';
            });
        }
        return this.state.members_options;
    }

    /**
     * @param {Proxy} member
     * @returns {Boolean}
     */
    isLoggedUser (member) {
        return member.partner_id === session.partner_id;
    }

    /**
     * Callback function called when the internal permission of the article changes.
     * @param {Event} event
     */
    _onChangeInternalPermission (event) {
        const self = this;
        const $select = $(event.target);
        const index = this.state.members.findIndex(current => {
            return current.partner_id === session.partner_id;
        });
        const newPermission = $select.val();
        const oldPermission = this.state.internal_permission;
        const willRestrict = this.state.based_on && permissionLevel[newPermission] < permissionLevel[oldPermission]
                                && permissionLevel[newPermission] < permissionLevel[this.state.parent_permission];
        const willLoseAccess = $select.val() === 'none' && (index >= 0 && this.state.members[index].permission === 'none');
        const confirm = () => {
            this.rpc({
                route: '/article/set_internal_permission',
                params: {
                    article_id: this.props.article_id,
                    permission: newPermission,
                }
            }).then(res => {
                if (self._onChangedPermission(res, willLoseAccess)) {
                    self.state.internal_permission = newPermission;
                    self.loadPanel();
                }
            });
        };

        if (!willLoseAccess && !willRestrict) {
            confirm();
            return;
        }

        const discard = () => {
            $select.val(oldPermission);
            self.loadPanel();
        };
        const loseAccessMessage = _t('Are you sure you want to set the internal permission to "none" ? If you do, you will no longer have access to the article.');
        this._showConfirmDialog(willLoseAccess ? loseAccessMessage : restrictMessage, confirm, discard);
    }

    /**
     * Callback function called when the permission of a user changes.
     * @param {Event} event
     * @param {Proxy} member
     */
    _onChangeMemberPermission (event, member) {
        const self = this;
        const index = this.state.members.findIndex(current => {
            return current.id === member.id;
        });
        if (index < 0) {
            return;
        }
        const $select = $(event.target);
        const newPermission = $select.val();
        const oldPermission = this.state.members[index].permission;
        const willLoseAccess = this.isLoggedUser(member) && newPermission === 'none';
        const willRestrict = this.state.based_on && permissionLevel[newPermission] < permissionLevel[oldPermission];
        const willLoseWrite = this.isLoggedUser(member) && newPermission !== 'write' && oldPermission === 'write';
        const confirm = () => {
            this.rpc({
                route: '/article/set_member_permission',
                params: {
                    article_id: this.props.article_id,
                    permission: newPermission,
                    member_id: member.id,
                    partner_id: member.based_on ? member.partner_id: false,
                }
            }).then(res => {
                if (self._onChangedPermission(res, willLoseAccess)) {
                    self.state.members[index].permission = newPermission;
                    self.loadPanel();
                }
            });
        };

        if (!willLoseAccess && !willRestrict && !willLoseWrite) {
            confirm();
            return;
        }

        const discard = () => {
            $select.val(this.state.members[index].permission);
            self.loadPanel();
        };
        const loseAccessMessage = _t('Are you sure you want to set your permission to "none"? If you do, you will no longer have access to the article.');
        const loseWriteMessage = _t('Are you sure you want to remove you own "Write" access ?');
        const message = willLoseAccess ? loseAccessMessage : willLoseWrite ? loseWriteMessage : loseAccessMessage;
        this._showConfirmDialog(message, confirm, discard);
    }

    /**
     * Callback function called when a member is removed.
     * @param {Event} event
     * @param {Proxy} member
     */
    _onRemoveMember (event, member) {
        const self = this;
        const index = this.state.members.findIndex(current => {
            return current.id === member.id;
        });
        if (index < 0) {
            return;
        }
        const willRestrict = member.based_on ? true : false;
        const willLoseAccess = this.isLoggedUser(member) && this.state.internal_permission === 'none';
        const confirm = () => {
            this.rpc({
                route: '/article/remove_member',
                params: {
                    article_id: this.props.article_id,
                    member_id: member.id,
                    partner_id: member.based_on ? member.partner_id: false,
                }
            }).then(res => {
                if (self._onChangedPermission(res, willLoseAccess)) {
                    self.state.members.splice(index, 1);
                    self.loadPanel();
                }
            });
        };

        if (!willLoseAccess && !willRestrict) {
            confirm();
            return;
        }

        const loseAccessMessage = _t('Are you sure you want to withdraw from the members? If you do, you will no longer have access to the article.');
        this._showConfirmDialog(willLoseAccess ? loseAccessMessage : restrictMessage, confirm);
    }

    /**
     * Callback function called when user clicks on 'Restore' button.
     * @param {Event} event
     */
    _onRestore (event) {
        const self = this;
        const articleId = this.props.article_id;
        const confirm = () => {
            this.rpc({
                model: 'knowledge.article',
                method: 'restore_article_access',
                args: [[articleId]],
            }).then(res => {
                if (res) {
                    self._onChangedPermission({success: res});
                    self.loadPanel();
                }
            });
        };

        const message = _t('Are you sure you want to restore access?');
        this._showConfirmDialog(message, confirm);
    }

    /**
     * @param {Event} event
     * @param {Proxy} member
     */
    async _onMemberAvatarClick (event, member) {
        if (member.user_ids.length === 1) {
            const messaging = await Component.env.services.messaging.get();
            messaging.openChat({
                userId: member.user_ids[0]
            });
        }
    }

  /**
    * This method is called before each permission change rpc when the user needs to confirm the change as them
    * would lose them access to the article if them do confirm.
    * @param {str} message
    * @param {function} confirm
    * @param {function} discard
    */
    _showConfirmDialog (message, confirm, discard) {
        const self = this;
        if (discard === undefined) {
            const discard = this.loadPanel;
        }
        Dialog.confirm(this, message, {
            buttons: [{
                text: _t('confirm'),
                classes: 'btn-primary',
                close: true,
                click: confirm
            }, {
                text: _t('Discard'),
                close: true,
                click: discard
            }],
        });
    }

  /**
    * This method is called after each permission change rpc.
    * It will check if a reloading of the article tree or a complete reload is needed in function
    * of the new article state (if change of category or if user lost his own access to the current article).
    * return True if the caller should continue after executing this method, and False, if caller should stop.
    * @param {Dict} result
    * @param {Boolean} lostAccess
    */
    _onChangedPermission (result, reloadAll, reloadArticleId) {
        if (!result.success) {
            return false;
        } else if (reloadAll) {
            this.env.bus.trigger('do-action', {
                action: 'knowledge.action_home_page',
                options: {
                    additional_context: {
                        res_id: reloadArticleId
                    }
                }
            });
            return false;
        } else if (result.reload_tree) {
            this.env.bus.trigger('reload_tree', {});
        }
        return true;
    }

    _showPanel () {
        // TODO DBE: get permission panel with owl brol ??
        const $permissionPanel = $('.o_knowledge_share_panel');
        $permissionPanel.addClass('show');
        $permissionPanel.parent().addClass('show');
    }
}

PermissionPanel.template = 'knowledge.PermissionPanel';
PermissionPanel.props = [
    'article_id',
    'user_permission'
];

export default PermissionPanel;
