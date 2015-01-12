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
        var href = $link.attr("action");
        var attach_id = href.match(/signed\/([0-9]+)/);
        var token = href.match(/token=(.*)/);
        if (token)
            token = token[1];
        var signer_name = $("#signer_name").val();
        var sign = $("#sign").jSignature("getData",'image');
        var is_empty = sign?empty_sign[1]==sign[1]:false;
        $('#signer').toggleClass('has-error', ! signer_name);
        $('#drawsign').toggleClass('panel-danger', is_empty).toggleClass('panel-default', ! is_empty);

        if (is_empty || ! signer_name)
            return false;
        $('#signed_req').prop('disabled',true);

        openerp.jsonRpc("/website_sign/signed", 'call', {
            'res_id': parseInt(attach_id[1]),
            'token': token,
            'sign': sign?JSON.stringify(sign[1]):false,
            'signer': signer_name
        }).then(function (data) {
            $('#modesign').modal('hide');
            window.location.href = '/sign/document/'+attach_id[1]+'/'+token+'?message=2';
        });
        return false
    });
});

openerp.website_sign = function (session) {
    var QWeb = session.web.qweb, _t = session.web._t;

    session.web.SignRequest = session.web.Widget.extend({
        init: function (parent, sign_icon, attachment_id, res_id, model, send_directly) {
            this._super(parent);
            this.sign_icon = sign_icon;
            this.attach_id = attachment_id;
            this.res_id = res_id;
            this.model = model;
            this.send_directly = (typeof send_directly !== undefined)? (send_directly == true) : false;
        },
        get_followers: function () {
            var self = this;
            $('div.oe_edit_partner_list').remove();
            openerp.jsonRpc("/website_sign/get_followers", 'call', {
                'thread_id': parseInt(self.res_id),
                'attachment_id': parseInt(self.attach_id),
                'model': self.model,
            }).then(function (data) {
                if (data.signer_data.length === 0) {
                    var dialog = new session.web.Dialog(this, {
                        size: 'small',
                        title: _t("This document does not have any followers, please add them."),
                        buttons:[{
                            text: _t("Ok"),
                            click: function() {
                                this.parents('.modal').modal('hide');
                            }
                        }],
                    }, null).open();
                    return false;
                }
                self.$dialog = new session.web.Dialog(this, {
                    size: 'medium',
                    title: _t('Signature Request'),
                }, $('<div class="oe_edit_partner_list">' + QWeb.render('select.people', {"result": data, "attach_id": self.attach_id}) + "</div>")).open();
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
                    self.$dialog.$el.parents('.modal').modal('hide');
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
                            this.parents('.modal').modal('hide');
                        }
                    }],
                }, null).open();
                return false;
            }
            $('#doc_title').toggleClass('has-error', !title);
            if (!title) {
                return false;
            };
            openerp.jsonRpc("/website_sign/set_signer", 'call', {
                'attachment_id': parseInt(attachment_id),
                'signer_id': (deleteRequest)? [] : sign_ids,
                'title': title,
                'comments': comments,
                'send_directly': self.send_directly,
            }).then(function () {
                self.$dialog.$el.parents('.modal').modal('hide');
                if(!deleteRequest)
                    self.sign_icon.attr("src", "/website_sign/static/src/img/check.png");
                else
                    self.sign_icon.attr("src", "/website_sign/static/src/img/sign.png");
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
                    var signImg = "sign";
                    if($.inArray(attach_ids[id], checkedIds) > -1)
                        signImg = "check";

                    var sign_icon = $(_.str.sprintf("<img id='%s' class='request_sign oe_sign' title='Request Signature' src='/website_sign/static/src/img/%s.png'/>", attach_ids[id], signImg));
                    self.$el.find("[data-id='" + attach_ids[id] + "']").after(sign_icon);
                    sign_icon.on('click', function (ev) {
                        var attach_id = ev.currentTarget.id;
                        var res_id = self.res_id;
                        var model = self.model;
                        var signrequest = self.get_signrequest_dialog($(ev.currentTarget), attach_id, res_id, model);
                        signrequest.get_followers();
                    });
                }
            }
        },

        get_signrequest_dialog: function(sign_icon, attach_id, res_id, model){
            return new session.web.SignRequest(this, sign_icon, attach_id, res_id, model, true);
        },
    });

    session.mail.ThreadComposeMessage.include({
        do_send_message_post: function (partner_ids, log) {
            var self = this;
            var attach_ids = _.map(this.attachment_ids, function (file) {return file.id;})
            var parent = this._super;
            var args = arguments;
            openerp.jsonRpc("/website_sign/get_signer", 'call', {
                'attachment_ids': attach_ids,
            }).then(function (res) {
                var values = {
                    'context': _.extend(self.parent_thread.context, {
                        'signers_data': res,
                    }),
                };
                return parent.apply(self, args);
            });
        },

        get_signrequest_dialog: function(sign_icon, attach_id, res_id, model){
            return new session.web.SignRequest(this, sign_icon, attach_id, res_id, model, false);
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
                    var signImg = "sign";
                    if($.inArray(ids[id], checkedIds) > -1)
                        signImg = "check";

                    var sign_icon = $(_.str.sprintf("<img id='%s' class='request_sign oe_sign' title='Request Signature' src='/website_sign/static/src/img/%s.png'/>", ids[id], signImg));
                    self.$el.find("[data-id='" + ids[id] + "']").after(sign_icon);
                    sign_icon.on('click', function (ev) {
                        var attach_id = ev.currentTarget.id;
                        var res_id = self.field_manager.datarecord.res_id;
                        var model = self.field_manager.datarecord.model;
                        var signrequest = new session.web.SignRequest(self, $(ev.currentTarget), attach_id, res_id, model, false);
                        signrequest.get_followers();
                    });
                }
            });
        },
    });
};
