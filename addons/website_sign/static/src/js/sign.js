$(document).ready(function () {
    var empty_sign = false;
    $('#modesign').on('shown.bs.modal', function (e) {
        $("#sign").empty().jSignature({'decor-color' : '#D1D0CE'});
        empty_sign = $("#sign").jSignature("getData",'image');
    });

    $('#sign_clean').on('click', function (e) {
        $("#sign").jSignature('reset');
    });


    $('form.js_sign_json').submit(function(ev){
        ev.preventDefault();
        var $link = $(ev.currentTarget);

        var sign = $("#sign").jSignature("getData",'image');
        var is_empty = sign?empty_sign[1]==sign[1]:false;
        $('#signer').toggleClass('has-error', ! signer_name);
        $('#drawsign').toggleClass('panel-danger', is_empty).toggleClass('panel-default', ! is_empty);

        if (is_empty || ! signer_name)
            return false;
        $('#signed_req').prop('disabled',true);

        openerp.jsonRpc($link.attr("action"), "call", {
            'sign': sign?JSON.stringify(sign[1]):false,
            'signer': $("#signer_name").val()
        }).then(function (data) {
            $('#modesign').modal('hide');
            window.location.href = '/sign/document/'+data['id']+'/'+data['token']+'?message=2';
        });
        return false;
    });
});

openerp.website_sign = function (session) {
    var QWeb = session.web.qweb, _t = session.web._t;

    session.web.SignRequest = session.web.Widget.extend({
        init: function (parent, sign_icon, attachment_id, res_model, res_id, send_directly) {
            this._super(parent);
            this.sign_icon = sign_icon;
            this.attach_id = attachment_id;
            this.res_model = res_model;
            this.res_id = res_id;
            this.send_directly = (typeof send_directly !== undefined)? (send_directly == true) : false;
        },
        get_followers: function () {
            var self = this;
            $('div.oe_edit_partner_list').remove();
            openerp.session.rpc("/website_sign/get_followers", {
                'attachment_id': parseInt(self.attach_id),
                'res_model': self.res_model,
                'res_id': self.res_id
            }).then(function (followers) {
                if (followers.length === 0) {
                    var dialog = new session.web.Dialog(this, {
                        size: 'small',
                        title: _t("This document does not have any followers, please add them."),
                        buttons:[{
                            text: _t("Ok"),
                            click: function() {
                                dialog.close();
                            }
                        }],
                    }, null).open();
                    return false;
                }

                var Attachment = new openerp.Model("ir.attachment");
                Attachment.query(['name', 'description'])
                        .filter([['id', '=', parseInt(self.attach_id)]])
                        .first().then(function(attachment){

                    self.$dialog = new session.web.Dialog(self, {
                        size: 'medium',
                        title: _t('Signature Request'),
                    }, $('<div class="oe_edit_partner_list">' + QWeb.render('select.people', {"followers": followers, "attachment": attachment}) + "</div>")).open();
                    self.$dialog.$buttons.find('.oe_dialog_custom_buttons').empty();
                    var reqStr = _t("Request Signature"), delStr = _t("Delete Signature Request"), cancelStr = _t("Cancel");
                    self.$dialog.$buttons.find('.oe_dialog_custom_buttons').append(
                        '<button class="oe_button oe_form_button oe_highlight" id="request">' + reqStr + '</button>' +
                        '<button class="oe_button oe_form_button" id="delete_request">' + delStr + '</button>' +
                        '<span> or </span>' +
                        '<button class="oe_button oe_form_button oe_link" id="cancel_request"><span>' + cancelStr + '</span></button>'
                    );
                    
                    self.$dialog.$buttons.find('#request').click(function(event) {
                        self.request_followers();
                    });
                    self.$dialog.$buttons.find('#delete_request').click(function(event) {
                        self.request_followers(true);
                    });
                    self.$dialog.$buttons.find('#cancel_request').click(function(event) {
                        self.$dialog.close();
                    });
                });

                return false;
            });
        },
        request_followers: function (deleteRequest) {
            deleteRequest = (typeof deleteRequest !== undefined)? deleteRequest : false;
            var self = this;
            var attachment_id = this.$dialog.$el.find("#attach_id").val();
            var title = this.$dialog.$el.find("#title").val();
            var comments = this.$dialog.$el.find("#comments").val() || false;
            var sign_ids = [];
            var oe_action = $('div.oe_edit_partner_list input[type="checkbox"]');
            _(oe_action).each(function (record) {
                if ($(record).is(':checked')) {
                    sign_ids.push(parseInt($(record).data('id')));
                }
            });
            if(sign_ids.length <= 0 && !deleteRequest){
                var dialog = new session.web.Dialog(this, {
                    size: 'medium',
                    title: _t("You must select at least one signer to send a sign request."),
                    buttons:[{
                        text: _t("Ok"),
                        click: function() {
                            dialog.close();
                        }
                    }],
                }, null).open();
                return false;
            }
            $('#doc_title').toggleClass('has-error', !title);
            if (!title) {
                return false;
            };

            var Attachment = new openerp.Model("ir.attachment");
            Attachment.call("set_name_and_description", [parseInt(attachment_id), title, comments])
                    .then(function(){

                openerp.session.rpc("/website_sign/set_signers", {
                    'attachment_id': parseInt(attachment_id),
                    'signer_ids': (deleteRequest)? [] : sign_ids,
                    'send_directly': self.send_directly,
                }).then(function(){

                    self.$dialog.close();
                    if(!deleteRequest)
                        self.sign_icon.attr("src", "/website_sign/static/src/img/check.png");
                    else
                        self.sign_icon.attr("src", "/website_sign/static/src/img/sign.png");
                });
            });
            return false;
        },
    });

    session.mail.MessageCommon.include({
        display_attachments: function(){
            var self = this;

            var checkedIds = [];
            self.$el.find("img.request_sign.oe_sign[src='/website_sign/static/src/img/check.png']")
                .each(function(i, el){
                    checkedIds.push(parseInt(el.id));
                });

            this._super();

            if(this.is_author || this.author_id === false){
                attach_ids = _.map(this.attachment_ids, function (file) {return file.id;});
                for (var id in attach_ids) {
                    var sign_icon = self.$el.find("img.request_sign#" + attach_ids[id]);
                    if($.inArray(attach_ids[id], checkedIds) > -1)
                        sign_icon.attr("src", "/website_sign/static/src/img/check.png");
                    sign_icon.on('click', function (ev) {
                        var attach_id = ev.currentTarget.id;
                        var signrequest = self.get_signrequest_dialog($(ev.currentTarget), attach_id);
                        signrequest.get_followers();
                    });
                }
            }
        },

        get_signrequest_dialog: function(sign_icon, attach_id){
            return new session.web.SignRequest(this, sign_icon, attach_id, this.model, this.res_id, true);
        },
    });

    session.mail.ThreadComposeMessage.include({
        get_signrequest_dialog: function(sign_icon, attach_id){
            return new session.web.SignRequest(this, sign_icon, attach_id, this.model, this.res_id, false);
        },
    });

    session.web.form.FieldMany2ManyBinaryMultiFiles.include({
        render_value: function () {
            var self = this;

            var checkedIds = [];
            self.$el.find("img.request_sign.oe_sign[src='/website_sign/static/src/img/check.png']")
                .each(function(i, el){
                    checkedIds.push(parseInt(el.id));
                });

            self._super();

            this.read_name_values().then(function (ids) {
                for (var id in ids) {
                    var sign_icon = self.$el.find("img.request_sign#" + ids[id]);
                    if($.inArray(ids[id], checkedIds) > -1)
                        sign_icon.attr("src", "/website_sign/static/src/img/check.png");
                    sign_icon.on('click', function (ev) {
                        var attach_id = ev.currentTarget.id;
                        var signrequest = new session.web.SignRequest(self, $(ev.currentTarget), attach_id, false);
                        signrequest.get_followers();
                    });
                }
            });
        },
    });
};
