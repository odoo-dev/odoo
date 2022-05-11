/** @odoo-module **/

import Dialog from 'web.Dialog';
import { session } from '@web/session';
import { useService } from '@web/core/utils/hooks';
import { _lt } from '@web/core/l10n/translation';

const { Component, onMounted, onWillStart, onWillUnmount, useState } = owl;

const permissionLevel = {
    none: 0,
    read: 1,
    write: 2
};

const Message = {
    restrict: _lt('Are you sure you want to restrict this role and restrict access? This article will no longer inherit access settings from the parent page.'),
    loseWrite: _lt('Are you sure you want to remove you own "Write" access ?')
};

class PermissionPanel extends Component {

    // Public:

    /**
     * @override
     */
    setup () {
        this.rpc = useService('rpc');
        this.state = useState({
            is_admin: session.is_admin,
            partner_id: session.partner_id
        });
        onWillStart(this._loadPanel);
        onMounted(() => {
            this.env.bus.on('reload_panel', this, this._reloadPanel);
        });
        onWillUnmount(() => {
            this.env.bus.off('reload_panel', this);
        });
    }

    // Handlers:

    /**
     * Callback function called when the internal permission of the article changes.
     * @param {Event} event
     */
    _onChangeInternalPermission (event) {
        const select = event.target;
        const permission = select.value;
        const willRestrict = this.state.based_on &&
                             permissionLevel[permission] < permissionLevel[this.state.internal_permission] &&
                             permissionLevel[permission] < permissionLevel[this.state.parent_permission];
        const { _t } = this.env;
        const confirm = () => {
            return this.rpc({
                route: '/knowledge/article/set_internal_permission',
                params: {
                    article_id: this.props.article_id,
                    permission,
                }
            }).then(result => {
                if (result.error) {
                    Dialog.alert(this, result.error, {
                        title: _t('Error'),
                    });
                    discard();
                    return;
                }
                if (result.reload_tree) {
                    this.env.bus.trigger('reload_tree', {});
                }
                this._reloadPanel();
            });
        };

        const discard = () => {
            select.value = this.state.internal_permission;
        };

        if (willRestrict) {
            this._openConfirmationDialog({
                message: Message.restrict,
                confirm,
                discard
            });
        } else {
            confirm();
        }
    }

    /**
     * Callback function called when the permission of a user changes.
     * @param {Event} event
     * @param {Proxy} member
     */
    _onChangeMemberPermission (event, member) {
        const select = event.target;
        const permission = select.value;
        const willLoseAccess = !session.is_admin &&
                               this._isLoggedUser(member) &&
                               permission === 'none';
        const willLoseWrite = !session.is_admin &&
                              this._isLoggedUser(member) &&
                              permission !== 'write' &&
                              member.permission === 'write';
        const { _t } = this.env;
        const confirm = () => {
            this.rpc({
                route: '/knowledge/article/set_member_permission',
                params: {
                    article_id: this.props.article_id,
                    permission: permission,
                    member_id: member.based_on ? false : member.id,
                    inherited_member_id: member.based_on ? member.id: false,
                }
            }).then(result => {
                if (result.error) {
                    Dialog.alert(this, result.error, {
                        title: _t('Error'),
                    });
                    discard();
                    return;
                }
                if (willLoseAccess) {
                    this._goToHomepage();
                    return;
                }
                if (willLoseWrite) {
                    this.env.bus.trigger('reload_view', {});
                    return;
                }
                member.permission = permission;
                if (result.reload_tree) {
                    this.env.bus.trigger('reload_tree', {});
                }
            });
        };

        const discard = () => {
            select.value = member.permission;
        };

        if (!willLoseAccess && !willLoseWrite) {
            confirm();
            return;
        }

        this._openConfirmationDialog({
            message: (willLoseWrite && !willLoseAccess) ? Message.loseWrite : _t('Are you sure you want to set your permission to "none"? If you do, you will no longer have access to the article.'),
            confirm,
            discard
        });
    }

    /**
     * Callback function called when the user clicks on an article (see template file).
     * @param {Event} event
     * @param {integer} id - article id
     */
    _onOpen (event, id) {
        event.preventDefault();
        this._openArticle(id);
    }

    /**
     * Callback function called when a member is removed.
     * @param {Event} event
     * @param {Proxy} member
     */
    _onRemoveMember (event, member) {
        const willLoseAccess = !session.is_admin &&
                               this._isLoggedUser(member) &&
                               this.state.internal_permission === 'none';
        const willLoseWrite = !session.is_admin &&
                              this._isLoggedUser(member) &&
                              this.state.internal_permission !== 'write' &&
                              member.permission === 'write';
        const { _t } = this.env;
        const confirm = () => {
            this.rpc({
                route: '/knowledge/article/remove_member',
                params: {
                    article_id: this.props.article_id,
                    member_id: member.based_on ? false : member.id,
                    inherited_member_id: member.based_on ? member.id: false,
                }
            }).then(result => {
                if (result.error) {
                    Dialog.alert(this, result.error, {
                        title: _t('Error'),
                    });
                    return;
                }
                if (willLoseAccess) {
                    this._goToHomepage();
                    return;
                }
                if (willLoseWrite) {
                    this.env.bus.trigger('reload_view', {});
                    return;
                }
                this._reloadPanel();
                if (result.reload_tree) {
                    this.env.bus.trigger('reload_tree', {});
                }
            });
        };
        if (!willLoseAccess && !willLoseWrite) {
            confirm();
            return;
        }
        this._openConfirmationDialog({
            message: (willLoseWrite && !willLoseAccess) ? Message.loseWrite : _t('Are you sure you want to withdraw from the members? If you do, you will no longer have access to the article.'),
            confirm,
            discard: () => {}
        });
    }

    /**
     * Callback function called when the user clicks on the 'Restore' button.
     * @param {Event} event
     */
    _onRestore (event) {
        const { _t } = this.env;
        this._openConfirmationDialog({
            message: _t('Are you sure you want to restore access?'),
            confirm: () => {
                this.rpc({
                    model: 'knowledge.article',
                    method: 'restore_article_access',
                    args: [[this.props.article_id]],
                }).then(result => {
                    if (result) {
                        this._reloadPanel();
                    }
                });
            },
            discard: () => {}
        });
    }

    /**
     * @param {Event} event
     * @param {Proxy} member
     */
    async _onMemberAvatarClick (event, member) {
        if (member.partner_share) {
            return;
        }
        const partnerRead = await this.rpc({
            model: 'res.partner',
            method: 'read',
            args: [member.partner_id, ['user_ids']],
        });
        const userIds = partnerRead && partnerRead.length === 1 ? partnerRead[0]['user_ids'] : false;
        const userId = userIds && userIds.length === 1 ? userIds[0] : false;
        if (userId) {
            const messaging = await Component.env.services.messaging.get();
            messaging.openChat({
                userId: userId
            });
        }
    }

    // Private:

    /**
     * Fetches the data from the server
     * @returns {Promise}
     */
    _fetchData () {
        return this.rpc({
            route: '/knowledge/get_article_permission_panel_data',
            params: {
                article_id: this.props.article_id
            }
        }).then(data => {
            if (typeof data === 'string') {
                return Promise.reject(data);
            }
            data.show_admin_tip = session.is_admin && data.user_permission !== 'write';
            return data;
        });
    }

    /**
     * Opens the homepage of the document
     */
    _goToHomepage () {
        this.env.bus.trigger('do-action', {
            action: 'knowledge.action_home_page'
        });
    }

    /**
     * @param {Proxy} member
     * @returns {Boolean}
     */
    _isLoggedUser (member) {
        return member.partner_id === session.partner_id;
    }

    /**
     * @returns {Promise}
     */
    _loadPanel () {
        this.state.loading = true;
        return this._fetchData().then(data => {
            Object.assign(this.state, data); // copy all data
            this.state.loading = false;
        });
    }

    /**
     * Opens the article with the given id
     * @param {integer} id - article id
     */
    _openArticle (id) {
        this.env.bus.trigger('do-action', {
            action: 'knowledge.action_home_page',
            options: {
                additional_context: {
                    res_id: id
                }
            }
        });
    }

    /**
     * @returns {Promise}
     */
    _reloadPanel () {
        return this._fetchData().then(data => {
            Object.assign(this.state, data); // copy all data
        });
    }

    /**
     * Opens a confirmation dialog
     * @param {Object} options
     * @param {String} options.message
     * @param {Function} options.confirm
     * @param {Function} options.discard
     */
    _openConfirmationDialog (options) {
        const { _t } = this.env;
        return Dialog.confirm(this, options.message, {
            buttons: [{
                text: _t('Confirm'),
                classes: 'btn-primary',
                close: true,
                click: options.confirm
            }, {
                text: _t('Discard'),
                close: true,
                click: options.discard
            }],
        });
    }
}

PermissionPanel.template = 'knowledge.PermissionPanel';
PermissionPanel.props = ['article_id'];

export default PermissionPanel;
