/** @odoo-module **/

import { _t } from "@web/core/l10n/translation";
import { escape } from "@web/core/utils/strings";
import { renderToElement } from "@web/core/utils/render";
import publicWidget from "@web/legacy/js/public/public_widget";
import { post } from "@web/core/network/http_service";
import { Component } from "@odoo/owl";
import { rpc, RPCError } from "@web/core/network/rpc";

/**
 * Widget PortalComposer
 *
 * Display the composer (according to access right)
 *
 */
var PortalComposer = publicWidget.Widget.extend({
    template: 'portal.Composer',
    events: {
        'change .o_portal_chatter_file_input': '_onFileInputChange',
        'click .o_portal_chatter_attachment_btn': '_onAttachmentButtonClick',
        'click .o_portal_chatter_attachment_delete': 'async _onAttachmentDeleteClick',
        'click .o_portal_chatter_composer_btn': 'async _onSubmitButtonClick',
    },

    /**
     * @constructor
     */
    init: function (parent, options) {
        this._super.apply(this, arguments);
        this.options = Object.assign({
            'allow_composer': true,
            'display_composer': false,
            'csrf_token': odoo.csrf_token,
            'token': false,
            'res_model': false,
            'res_id': false,
            'send_button_label': _t("Send"),
        }, options || {});
        this.attachments = [];
        this.notification = this.bindService("notification");
    },
    /**
     * @override
     */
    start: function () {
        var self = this;
        this.attachmentButton = this.el.querySelector('.o_portal_chatter_attachment_btn');
        this.fileInput = this.el.querySelector('.o_portal_chatter_file_input');
        this.sendButton = this.el.querySelector('.o_portal_chatter_composer_btn');
        this.attachmentElems = this.el.querySelectorAll('.o_portal_chatter_composer_input .o_portal_chatter_attachments');
        this.inputTextarea = this.el.querySelector('.o_portal_chatter_composer_input textarea[name="message"]');

        return this._super.apply(this, arguments).then(function () {
            if (self.options.default_attachment_ids) {
                self.attachments = self.options.default_attachment_ids || [];
                self.attachments.forEach((attachment) => {
                    attachment.state = 'done';
                });
                self._updateAttachments();
            }
            return Promise.resolve();
        });
    },

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     */
    _onAttachmentButtonClick: function () {
        const event = new Event('click');
        this.fileInput.dispatchEvent(event);
    },
    /**
     * @private
     * @param {Event} ev
     * @returns {Promise}
     */
    _onAttachmentDeleteClick: function (ev) {
        var self = this;
        const attachmentId = ev.currentTarget.closest('.o_portal_chatter_attachment').getAttribute('data-id');
        var accessToken = this.attachments.find(attachment => attachment.id === attachmentId).access_token;
        ev.preventDefault();
        ev.stopPropagation();

        this.sendButton.setAttribute('disabled', true);

        return rpc('/portal/attachment/remove', {
            'attachment_id': attachmentId,
            'access_token': accessToken,
        }).then(function () {
            self.attachments = self.attachments.filter(attachment => attachment.id !== attachmentId);
            self._updateAttachments();
            self.sendButton.setAttribute('disabled', false);
        });
    },
    _prepareAttachmentData: function (file) {
        return {
            'name': file.name,
            'file': file,
            'thread_id': this.options.res_id,
            'thread_model': this.options.res_model,
            'access_token': this.options.token,
        };
    },
    /**
     * @private
     * @returns {Promise}
     */
    _onFileInputChange: function () {
        var self = this;

        this.sendButton.setAttribute('disabled', true);

        return Promise.all([...this.$fileInput[0].files].map((file) => {
            return new Promise(function (resolve, reject) {
                var data = self._prepareAttachmentData(file);
                if (odoo.csrf_token) {
                    data.csrf_token = odoo.csrf_token;
                }
                post('/portal/attachment/add', data).then(function (attachment) {
                    attachment.state = 'pending';
                    self.attachments.push(attachment);
                    self._updateAttachments();
                    resolve();
                }).catch(function (error) {
                    if (error instanceof RPCError) {
                        self.notification.add(
                            _t("Could not save file <strong>%s</strong>", escape(file.name)),
                            { type: 'warning', sticky: true }
                        );
                        resolve();
                    }
                });
            });
        })).then(function () {
            // ensures any selection triggers a change, even if the same files are selected again
            self.fileInput.value = null;
            self.sendButton.setAttribute('disabled', false);
        });
    },
    /**
     * prepares data to send message
     *
     * @private
     */
    _prepareMessageData: function () {
        return Object.assign(this.options || {}, {
            thread_model: this.options.res_model,
            thread_id: this.options.res_id,
            post_data: {
                body: this.el.querySelector('textarea[name="message"]').value,
                attachment_ids: this.attachments.map((a) => a.id),
            },
            attachment_tokens: this.attachments.map((a) => a.access_token),
            token: this.options.token,
            hash: this.options.hash,
            pid: this.options.pid,
        });
    },
    /**
     * @private
     * @param {Event} ev
     */
    _onSubmitButtonClick: function (ev) {
        ev.preventDefault();
        const error = this._onSubmitCheckContent();
        if (error) {
            this.inputTextarea.classList.add('border-danger');
            const errorElem = this.el.querySelector(".o_portal_chatter_composer_error");
            errorElem.textContent = error;
            errorElem.classList.remove('d-none');
            return Promise.reject();
        } else {
            return this._chatterPostMessage(ev.currentTarget.getAttribute('data-action'));
        }
    },

    /**
     * @private
     */
    _onSubmitCheckContent: function () {
        if (!this.inputTextarea.value.trim() && !this.attachments.length) {
            return _t('Some fields are required. Please make sure to write a message or attach a document');
        };
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * @private
     */
    _updateAttachments: function () {
        this.attachmentElems.replaceChildren();
        this.attachmentElems.append(renderToElement('portal.Chatter.Attachments', {
            attachments: this.attachments,
            showDelete: true,
        }));
    },
    /**
     * post message using rpc call and display new message and message count
     *
     * @private
     * @param {String} route
     * @returns {Promise}
     */
    _chatterPostMessage: async function (route) {
        const result = await rpc(route, this._prepareMessageData());
        Component.env.bus.trigger('reload_chatter_content', result);
        return result;
    },
});

export default {
    PortalComposer: PortalComposer,
};
