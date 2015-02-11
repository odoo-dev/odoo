
$(function () {
    var signatureDialog = new SignatureDialog();
    signatureDialog.run();

    if($('#sign_doc_items').length == 1) {
        signatureDialog.dialog.on('hidden.bs.modal', function(e) {
            signatureDialog.dialog.find('#confirm_sign').off('click');
        });
    }

    if($('#sign_doc').length == 1) {
        signatureDialog.dialog.find('#confirm_sign').on('click', function(e) {
            $('#sign_doc').submit();
        });
    }

    $('#signature-validate-button').on('click', function(e) {
        $('#sign_doc_items').submit();
    });

    $('#sign_doc').submit(function(ev){
        ev.preventDefault();
        var form = $(ev.currentTarget);

        var sign = signatureDialog.sign_field.jSignature("getData");
        var is_empty = (sign)? signatureDialog.empty_sign==sign : true;
        var signer_name = signatureDialog.signer_name_field.val();
        signatureDialog.dialog.find('#signer_info').toggleClass('has-error', !signer_name);
        signatureDialog.dialog.find('#signature_draw').toggleClass('panel-danger', is_empty).toggleClass('panel-default', !is_empty);

        if (is_empty || !signer_name)
            return false;
        signatureDialog.dialog.find('#confirm_sign').prop('disabled', true);

        openerp.jsonRpc(form.attr("action"), "call", {
            'sign': (sign)? sign.substr(sign.indexOf(",")+1) : false,
            'signer': signer_name
        }).then(function (data) {
            signatureDialog.dialog.modal('hide');
            window.location.href = '/sign/document/'+data['id']+'/'+data['token']+'?message=2';
        });
        return false;
    });

    $('#sign_doc_items').submit(function(ev){
        ev.preventDefault();
        var form = $(ev.currentTarget);
        var ok = true;

        var role = parseInt($('#input_current_role').val()) || 0;

        var sign_values = {};
        var sign_items = form.find('iframe').contents().find('.sign_item');
        sign_items.each(function(i, el){
            var value = {
                'signature': ($(el).data('signature') != signatureDialog.empty_sign)? $(el).data('signature') : false,
                'initial': ($(el).data('signature') != signatureDialog.empty_sign)? $(el).data('signature') : false,
                'text': $(el).val(),
                'textarea': $(el).val(),
                'date': $(el).val(),
            }[$(el).data('type')];

            var resp = parseInt($(el).data('responsible')) || 0;

            if(!value) {
                if($(el).data('required') && (resp <= 0 || resp == role))
                    ok = false;
                return;
            }

            sign_values[parseInt($(el).data('item-id'))] = value;
        });

        if(!ok) {
            alert("Some fields must be completed !");
            return false;
        }

        openerp.jsonRpc(form.attr("action"), "call", {
            'sign': sign_values,
            'signer': signatureDialog.signer_name_field.val()
        }).then(function (data) {
            window.location.href = '/sign/document/'+data['id']+'/'+data['token']+'?message=2&viewmode=1';
        });

        return false;
    });
});

function SignatureDialog()
{
    this.dialog = $('#signature_dialog');

    this.mode_buttons = this.dialog.find('a.sign_mode');
    this.instruction = this.dialog.find('#sign_instruction');
    this.sign_field = this.dialog.find("#sign");
    this.font_dialog = this.dialog.find("#font_dialog");
    this.font_selection = this.dialog.find("#sign_font_selection");
    this.clear_button = this.dialog.find('#sign_clean');
    this.select_style_button = this.dialog.find('#sign_select_style');
    this.load_button = this.dialog.find('#sign_load');

    this.signer_name_field = this.dialog.find("#signer_name");

    this.empty_sign = null
    this.fonts = null;

    this.run = function() {
        var self = this;
     
        currentFont = 0;
        self.get_sign_font().then(function(data) {
            for(var i = 0 ; i < data.length ; i++) {
                var name = data[i][0];
                if(name.length > 15)
                    name = name.substr(0, 12) + "...";
                var button = $("<a data-font-nb='" + i + "'>" + name + "</a>");
                button.addClass('btn btn-primary btn-block');

                button.on('click', function(e) {
                    currentFont = $(e.currentTarget).data('font-nb');
                    self.font_dialog.hide();
                    self.font_dialog.css('width', '0%');
                    self.font_dialog.find('.btn').css('opacity', 0.0);
                });
                button.on('mouseover', function(e) {
                    currentFont = $(e.currentTarget).data('font-nb');
                    self.signer_name_field.change();
                });

                self.font_selection.append(button);
            }
        });
        self.font_dialog.hide();
        self.font_dialog.css('width', '0%');
        self.font_dialog.find('.btn').css('opacity', 0.0);
            
        self.dialog.on('shown.bs.modal', function (e) {
            var width = self.sign_field.width();
            var height = 'ratio';
            if(self.dialog.data('signature-ratio'))
                height = width / self.dialog.data('signature-ratio');

            self.sign_field.empty().jSignature({
                'decor-color': 'transparent',
                'background-color': '#FFF', // Does not work
                'color': '#000',
                'lineWidth': 3,
                'width': width,
                'height': height
            });
            self.empty_sign = self.sign_field.jSignature("getData");

            var currentButton = self.mode_buttons.filter('.btn-primary');
            if(currentButton.length == 0)
                currentButton = self.mode_buttons.filter('#auto_sign_mode');

            currentButton.click();

            self.dialog.find('#confirm_sign').focus();
        });

        self.mode_buttons.on('click', function(e) {
            self.mode_buttons.removeClass('btn-primary');
            $(e.currentTarget).addClass('btn-primary');
            self.sign_field.jSignature('reset');

            self.dialog.find('#signer_name').off('change');
        });

        self.mode_buttons.filter('#auto_sign_mode').on('click', function(e) {
            self.instruction.html("Select your style");
            self.sign_field.jSignature('disable');

            self.clear_button.hide();
            self.select_style_button.show();
            self.load_button.hide();

            self.dialog.find('#signer_name').on('change', function(e) {
                var text = self.signer_name_field.val();
                if(self.dialog.data('signature-type') == 'initial') {
                    var words = text.split(' ');
                    text = "";
                    for(var i = 0 ; i < words.length ; i++)
                        text += words[i][0] + '.';
                }
                self.print_canvas_text(self.get_sign_font(currentFont), text);
            });
            self.dialog.find('#signer_name').change();
        });

        self.mode_buttons.filter('#draw_sign_mode').on('click', function(e) {
            self.instruction.html("Draw your signature");
            self.sign_field.jSignature('enable');

            self.clear_button.show();
            self.select_style_button.hide();
            self.load_button.hide();

            self.font_dialog.hide();
            self.font_dialog.css('width', '0%');
            self.font_dialog.find('.btn').css('opacity', 0.0);
        });

        self.mode_buttons.filter('#load_sign_mode').on('click', function(e) {
            self.instruction.html("Load your signature file");
            self.sign_field.jSignature('disable');

            self.clear_button.hide();
            self.select_style_button.hide();
            self.load_button.show();

            self.font_dialog.hide();
            self.font_dialog.css('width', '0%');
            self.font_dialog.find('.btn').css('opacity', 0.0);
        });

        self.clear_button.on('click', function (e) {
            self.sign_field.jSignature('reset');
        });

        self.select_style_button.on('click', function(e) {
            self.font_dialog.show();
            self.font_dialog.animate({'width': '40%'}, 500);
            self.font_dialog.find('.btn').animate({'opacity': 1.0}, 500);
        });

        self.load_button.on('change', function(e) {
            var f = e.currentTarget.files[0];
            if(f.type.substr(0, 5) != "image")
                return false;

            var reader = new FileReader();

            reader.onload = (function(theFile) {
                return function(e) {
                    self.print_canvas_img(e.currentTarget.result);
                };
            })(f);

            reader.readAsDataURL(f);
        });
    }

    this.print_canvas_text = function(font, text) {
        var self = this;

        var width = self.sign_field.find('canvas')[0].width, height = self.sign_field.find('canvas')[0].height

        var svgStr = "<?xml version='1.0' encoding='utf-8' ?>";
        svgStr += "<svg xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink' version='1.1' width='" + width + "' height='" + height + "'>";
        svgStr += "<defs><style type='text/css'><![CDATA[ @font-face { font-family: 'font'; src: url(data:font/ttf;base64," + font + ") format('woff'); font-weight: normal; font-style: normal; } ]]></style></defs>";
        svgStr += "<text x='50%' y='" + (height*4/5) + "' font-size='" + (height*4/5) + "' textLength='" + (width*4/5) + "' lengthAdjust='spacingAndGlyphs' style='font-family:\"font\"' fill='black' text-anchor='middle'>" + text + "</text></svg>";

        var imgSrc = "data:image/svg+xml;base64," + btoa(svgStr);

        return self.print_canvas_img(imgSrc);
    }

    this.print_canvas_img = function(imgSrc) {
        var self = this;

        self.print_canvas_img.refreshed = (self.print_canvas_img.refreshed === undefined)? true : self.print_canvas_img.refreshed;
        if(!self.print_canvas_img.refreshed) {
            return false;
        }

        self.print_canvas_img.refreshed = false;

        self.sign_field.jSignature('reset');
        var canvas = self.sign_field.find('canvas'), context = canvas[0].getContext("2d");

        var image = new Image;

        image.onload = function() {
            var width = 0, height = 0;
            var ratio = image.width/image.height

            if(image.width / canvas[0].width > image.height / canvas[0].height) {
                width = canvas[0].width;
                height = width / ratio;
            }
            else {
                height = canvas[0].height;
                width = height * ratio;
            }

            var zoom = 1.0;
            width *= zoom;
            height *= zoom;

            context.drawImage(image, 0, 0, image.width, image.height, (canvas[0].width - width)/2, (canvas[0].height - height)/2, width, height);
            self.print_canvas_img.refreshed = true;
        };

        image.src = imgSrc;

        return true;
    }

    this.get_sign_font = function(no) {
        var self = this;

        if(self.fonts == null) {
            return openerp.jsonRpc('/website_sign/get_fonts', "call", {}).then(function (data) {
                self.fonts = data;
                return data;
            });
        }
        return (no >= 0 && no < self.fonts.length)? self.fonts[no][1] : false;
    }
}
