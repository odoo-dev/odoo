
function get_sign_font(no) {
    if(!get_sign_font.fonts) {
        return openerp.jsonRpc('/website_sign/get_fonts', "call", {}).then(function (data) {
            get_sign_font.fonts = data;
            return data;
        });
    }

    return (no >= 0 && no < get_sign_font.fonts.length)? get_sign_font.fonts[no][1] : false;
}

function print_canvas_img(sign_field, imgSrc) {
    print_canvas_img.refreshed = (print_canvas_img.refreshed === undefined)? true : print_canvas_img.refreshed;
    if(!print_canvas_img.refreshed) {
        return false;
    }

    print_canvas_img.refreshed = false;

    sign_field.jSignature('reset');
    var canvas = sign_field.find('canvas'), context = canvas[0].getContext("2d");

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
        print_canvas_img.refreshed = true;
    };

    image.src = imgSrc;

    return true;
}

function print_canvas_text(sign_field, font, text) {
    var width = sign_field.find('canvas')[0].width, height = sign_field.find('canvas')[0].height

    var svgStr = "<?xml version='1.0' encoding='utf-8' ?>";
    svgStr += "<svg xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink' version='1.1' width='" + width + "' height='" + height + "'>";
    svgStr += "<defs><style type='text/css'><![CDATA[ @font-face { font-family: 'font'; src: url(data:font/ttf;base64," + font + ") format('woff'); font-weight: normal; font-style: normal; } ]]></style></defs>";
    svgStr += "<text x='50%' y='" + (height*4/5) + "' font-size='" + (height*4/5) + "' textLength='" + (width*4/5) + "' lengthAdjust='spacingAndGlyphs' style='font-family:\"font\"' fill='black' text-anchor='middle'>" + text + "</text></svg>";

    var imgSrc = "data:image/svg+xml;base64," + btoa(svgStr);

    return print_canvas_img(sign_field, imgSrc);
}

$(function () {
    var empty_sign = null;

    var signature_dialog = $('#signature_dialog');
    var sign_mode_buttons = signature_dialog.find('a.sign_mode');
    var sign_instruction = signature_dialog.find('#sign_instruction');
    var sign_field = signature_dialog.find("#sign");
    var sign_font_dialog = signature_dialog.find("#font_dialog");
    var sign_font_selection = signature_dialog.find("#sign_font_selection");
    var sign_clear = signature_dialog.find('#sign_clean');
    var sign_select_style = signature_dialog.find('#sign_select_style');
    var sign_load = signature_dialog.find('#sign_load');
 
    currentFont = 0;
    get_sign_font().then(function(data) {
        for(var i = 0 ; i < data.length ; i++) {
            var name = data[i][0];
            if(name.length > 15)
                name = name.substr(0, 12) + "...";
            var button = $("<a data-font-nb='" + i + "'>" + name + "</a>");
            button.addClass('btn btn-primary btn-block');

            button.on('click', function(e) {
                currentFont = $(e.currentTarget).data('font-nb');
                sign_font_dialog.hide();
                sign_font_dialog.css('width', '0%');
                sign_font_dialog.find('.btn').css('opacity', 0.0);
            });
            button.on('mouseover', function(e) {
                currentFont = $(e.currentTarget).data('font-nb');
                signature_dialog.find("#signer_name").change();
            });

            sign_font_selection.append(button);
        }
    });
    sign_font_dialog.hide();
    sign_font_dialog.css('width', '0%');
    sign_font_dialog.find('.btn').css('opacity', 0.0);
        
    signature_dialog.on('shown.bs.modal', function (e) {
        var width = sign_field.width(), height = width / signature_dialog.data('signature-ratio');

        sign_field.empty().jSignature({'decor-color': '#D1D0CE', 'lineWidth': 3, 'width': width, 'height': height});
        empty_sign = sign_field.jSignature("getData", 'image');

        var currentButton = sign_mode_buttons.filter('.btn-primary');
        if(currentButton.length == 0)
            currentButton = sign_mode_buttons.filter('#auto_sign_mode');

        currentButton.click();

        signature_dialog.find('#confirm_sign').focus();
    });

    if($('#sign_doc_items').length == 1) {
        signature_dialog.on('hidden.bs.modal', function(e) {
            signature_dialog.find('#confirm_sign').off('click');
        });
    }

    if($('#sign_doc').length == 1) {
        signature_dialog.find('#confirm_sign').on('click', function(e) {
            $('#sign_doc').submit();
        });
    }

    sign_mode_buttons.on('click', function(e) {
        sign_mode_buttons.removeClass('btn-primary');
        $(e.currentTarget).addClass('btn-primary');
        sign_field.jSignature('reset');

        signature_dialog.find('#signer_name').off('change');
    });

    sign_mode_buttons.filter('#auto_sign_mode').on('click', function(e) {
        sign_instruction.html("Select your style");
        sign_field.jSignature('disable');

        sign_clear.hide();
        sign_select_style.show();
        sign_load.hide();

        signature_dialog.find('#signer_name').on('change', function(e) {
            var text = signature_dialog.find("#signer_name").val();
            if(signature_dialog.data('signature-type') == 'initial') {
                var words = text.split(' ');
                text = "";
                for(var i = 0 ; i < words.length ; i++)
                    text += words[i][0] + '.';
            }
            print_canvas_text(sign_field, get_sign_font(currentFont), text);
        });
        signature_dialog.find('#signer_name').change();
    });

    sign_mode_buttons.filter('#draw_sign_mode').on('click', function(e) {
        sign_instruction.html("Draw your signature");
        sign_field.jSignature('enable');

        sign_clear.show();
        sign_select_style.hide();
        sign_load.hide();

        sign_font_dialog.hide();
        sign_font_dialog.css('width', '0%');
        sign_font_dialog.find('.btn').css('opacity', 0.0);
    });

    sign_mode_buttons.filter('#load_sign_mode').on('click', function(e) {
        sign_instruction.html("Load your signature file");
        sign_field.jSignature('disable');

        sign_clear.hide();
        sign_select_style.hide();
        sign_load.show();

        sign_font_dialog.hide();
        sign_font_dialog.css('width', '0%');
        sign_font_dialog.find('.btn').css('opacity', 0.0);
    });

    sign_clear.on('click', function (e) {
        sign_field.jSignature('reset');
    });

    sign_select_style.on('click', function(e) {
        sign_font_dialog.show();
        sign_font_dialog.animate({'width': '40%'}, 500);
        sign_font_dialog.find('.btn').animate({'opacity': 1.0}, 500);
    });

    sign_load.on('change', function(e) {
        var f = e.currentTarget.files[0];
        if(f.type.substr(0, 5) != "image")
            return false;

        var reader = new FileReader();

        reader.onload = (function(theFile) {
            return function(e) {
                print_canvas_img(sign_field, e.currentTarget.result);
            };
        })(f);

        reader.readAsDataURL(f);
    });

    $('#signature-validate-button').on('click', function(e) {
        $('#sign_doc_items').submit();
    });

    $('#sign_doc').submit(function(ev){
        ev.preventDefault();
        var form = $(ev.currentTarget);

        var sign = sign_field.jSignature("getData",'image');
        var is_empty = (sign)? empty_sign[1]==sign[1] : true;
        var signer_name = signature_dialog.find("#signer_name").val();
        signature_dialog.find('#signer_info').toggleClass('has-error', !signer_name);
        signature_dialog.find('#signature_draw').toggleClass('panel-danger', is_empty).toggleClass('panel-default', !is_empty);

        if (is_empty || !signer_name)
            return false;
        $('#confirm_sign').prop('disabled', true);

        openerp.jsonRpc(form.attr("action"), "call", {
            'sign': sign?JSON.stringify(sign[1]):false,
            'signer': signer_name
        }).then(function (data) {
            signature_dialog.modal('hide');
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
                'signature': ($(el).data('signature') != 'data:'+empty_sign[0]+','+empty_sign[1])? $(el).data('signature') : false,
                'initial': ($(el).data('signature') != 'data:'+empty_sign[0]+','+empty_sign[1])? $(el).data('signature') : false,
                'text': $(el).val(),
                'textarea': $(el).val(),
                'date': $(el).val(),
            }[$(el).data('type')];

            var resp = parseInt($(el).data('responsible')) || 0;

            if(!value && $(el).data('required') && (resp <= 0 || resp == role)) {
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
            'signer': signature_dialog.find("#signer_name").val()
        }).then(function (data) {
            window.location.href = '/sign/document/'+data['id']+'/'+data['token']+'?message=2';
        });

        return false;
    });
});
