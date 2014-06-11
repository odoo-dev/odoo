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
var QWeb = session.web.qweb,
      _t = session.web._t;

session.web.SignRequest = session.web.Widget.extend({
    init: function (parent, attachment_id, res_id, model) {
        this._super(parent);
        this.attach_id = attachment_id;
        this.res_id = res_id;
        this.model = model;
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
                    title: _t("Warning"),
                    buttons:[{
                        text: _t("Ok"),
                        click: function() {
                            this.parents('.modal').modal('hide');
                        }
                    }],
                }, $("<div />").text(_t("This document doesn't have any followers, please add them."))).open();
                return false;
            }
            self.$dialog = new session.web.Dialog(this, {
                size: 'medium',
                title: _t('Request Signature From'),
            }, $('<div class="oe_edit_partner_list">' + QWeb.render('select.people', {"result": data, "attach_id": self.attach_id}))).open();
            self.$dialog.$buttons.find('.oe_dialog_custom_buttons').empty();
            self.$dialog.$buttons.find('.oe_dialog_custom_buttons').append('<button class="oe_button oe_form_button oe_highlight" type="button" id="request">Request Signature</button><span> or </span> <button class="oe_button oe_form_button oe_link" type="button" id="cancel_request"><span>Cancel</span></button>');
            $('#request').click(function(event) {
                self.request_followers();
            });
            $('#cancel_request').click(function(event) {
                self.$dialog.$el.parents('.modal').modal('hide');
            });
            return false
        });
    },
    request_followers: function () {
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
        $('#doc_title').toggleClass('has-error', !title);
        if (!title) {
            return false;
        };
        openerp.jsonRpc("/website_sign/set_signer", 'call', {
            'attachment_id': parseInt(attachment_id),
            'signer_id': sign_ids,
            'title': title,
            'comments': comments,
        }).then(function () {
            self.$dialog.$el.parents('.modal').modal('hide');
        });
        return false
    },
});

session.mail.ThreadComposeMessage.include({
    on_attachment_loaded: function (event, result) {
        var self = this;
        if (result.erorr || !result.id ) {
            this.do_warn( session.web.qweb.render('mail.error_upload'), result.error);
            this.attachment_ids = _.filter(this.attachment_ids, function (val) { return !val.upload; });
        } else {
            for (var i in this.attachment_ids) {
                if (this.attachment_ids[i].filename == result.filename && this.attachment_ids[i].upload) {
                    this.attachment_ids[i]={
                        'id': result.id,
                        'name': result.name,
                        'filename': result.filename,
                        'url':session.mail.ChatterUtils.get_attachment_url(this.session, this.id, result.id)
                    };
                }
            }
        }
        this.display_attachments();
        if (!self.is_log){
            attach_ids = _.map(this.attachment_ids, function (file) {return file.id;});
            for (var id in attach_ids) {
                self.$el.find("[data-id='" + attach_ids[id] + "']").after(_.str.sprintf("<div id='request_sign' title='Request Signature'><img id='%s' src='/website_sign/static/src/img/sign.png'  style='margin-top:32px; margin-left:-17px; height:20px; width:20px'/></div>", attach_ids[id]));
            }
            this.$('div #request_sign').addClass('oe_sign');
            $('div#request_sign img').on('click', function (ev) {
                var attach_id = ev.currentTarget.id;
                var res_id = self.res_id;
                var model = self.model;
                var followers = new session.web.SignRequest(self, attach_id, res_id, model);
                followers.get_followers();
            });
        }
        var $input = this.$('input.oe_form_binary_file');
        $input.after($input.clone(true)).remove();
        this.$(".oe_attachment_file").show();
    },
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
});
session.web.form.FieldMany2ManyBinaryMultiFiles.include({
    render_value: function () {
        var self = this;
        this.read_name_values().then(function (ids) {
            var render = $(session.web.qweb.render('FieldBinaryFileUploader.files', {'widget': self, 'values': ids}));
            render.on('click', '.oe_delete', _.bind(self.on_file_delete, self));
            self.$('.oe_placeholder_files, .oe_attachments').replaceWith( render );
            if (!self.field_manager.datarecord.is_log) {
                for (var id in ids) {
                    self.$el.find("[data-id='" + ids[id] + "']").after(_.str.sprintf("<div id='request_sign' title='Request Signature'><img id='%s' src='/website_sign/static/src/img/sign.png'  style='margin-top:35px; margin-left:32px; height:20px; width:20px'/></div>", ids[id]));
                }
                $('div#request_sign img').on('click', function (ev) {
                    var attach_id = ev.currentTarget.id
                    var res_id = self.field_manager.datarecord.res_id;
                    var model = self.field_manager.datarecord.model;
                    var followers = new session.web.SignRequest(self, attach_id, res_id, model);
                        followers.get_followers();
                    });
            }

            // reinit input type file
            var $input = self.$('input.oe_form_binary_file');
            $input.after($input.clone(true)).remove();
            self.$(".oe_fileupload").show();

        });
    },
});
};