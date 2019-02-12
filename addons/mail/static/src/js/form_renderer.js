odoo.define('mail.form_renderer', function (require) {
"use strict";

var Chatter = require('mail.Chatter');
const ChatterOwl = require('mail.widget.Chatter');

var FormRenderer = require('web.FormRenderer');

/**
 * Include the FormRenderer to instanciate the chatter area containing (a
 * subset of) the mail widgets (mail_thread, mail_followers and mail_activity).
 */
FormRenderer.include({
    // TODO: to remove
    DISPLAY_OLD_CHATTER: true,
    /**
     * @override
     */
    init: function (parent, state, params) {
        this._super.apply(this, arguments);
        this.mailFields = params.mailFields;
        this.chatter = undefined;
        this.chatterOwl = undefined;
    },
    on_attach_callback: async function () {
        this._super.apply(this, arguments);
        if (this.chatterOwl) {
            await this.chatterOwl.on_attach_callback();
        }
    },

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * Updates the chatter area with the new state if its fields has changed
     *
     * @override
     */
    confirmChange: function (state, id, fields) {
        if (this.chatterOwl) {
            var chatterFields = ['message_attachment_count'].concat(_.values(this.mailFields));
            var updatedMailFields = _.intersection(fields, chatterFields);
            if (updatedMailFields.length) {
                if (this.DISPLAY_OLD_CHATTER) {
                    this.chatter.update(state, updatedMailFields);
                }
                this.chatterOwl.update({
                    fieldOptions: {
                        isEditable: this.activeActions.edit,
                        viewType: 'form',
                    },
                    mailFields: this.mailFields,
                    parent: this,
                    record: state,
                });
            }
        }
        return this._super.apply(this, arguments);
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * Overrides the function that renders the nodes to return the chatter's $el
     * for the 'oe_chatter' div node.
     *
     * @override
     * @private
     */
    _renderNode: function (node) {
        var self = this;
        if (node.tag === 'div' && node.attrs.class === 'oe_chatter') {

            // see @on_attach_callback
            // class needed to avoid wrapping in sheet, see @_updateView

            if (!this.chatterOwl) {
                this.chatterOwl = new ChatterOwl(this, {
                    fieldOptions: {
                        isEditable: this.activeActions.edit,
                        viewType: 'form',
                    },
                    mailFields: this.mailFields,
                    parent: this,
                    record: this.state,
                });
                var $temporaryParentDivOwl = $('<div>');
                this.defs.push(this.chatterOwl.appendTo($temporaryParentDivOwl).then(function () {
                    self.chatterOwl.$el.unwrap();
                    self._handleAttributes(self.chatterOwl.$el, node);
                }));
                if (this.DISPLAY_OLD_CHATTER) {
                    this.chatter = new Chatter(this, this.state, this.mailFields, {
                        isEditable: this.activeActions.edit,
                        viewType: 'form',
                    });
                    var $temporaryParentDiv = $('<div>');
                    this.defs.push(this.chatter.appendTo($temporaryParentDiv).then(function () {
                        self.chatter.$el.unwrap();
                        self._handleAttributes(self.chatter.$el, node);
                    }));
                    return $temporaryParentDiv.add($temporaryParentDivOwl);
                } else {
                    return $temporaryParentDivOwl;
                }
            } else {
                this.chatterOwl.update({
                    fieldOptions: {
                        isEditable: this.activeActions.edit,
                        viewType: 'form',
                    },
                    mailFields: this.mailFields,
                    parent: this,
                    record: this.state,
                });
                if (this.DISPLAY_OLD_CHATTER) {
                    this.chatter.update(this.state);
                    return this.chatter.$el.add($(this.chatterOwl.el));
                } else {
                    return $(this.chatterOwl.el);
                }
            }
        } else {
            return this._super.apply(this, arguments);
        }
    },
});

});
