
$(function () {
    var empty_sign = false;
    var signature_dialog = $('#signature_dialog');

    signature_dialog.on('shown.bs.modal', function (e) {
        signature_dialog.find("#sign").empty().jSignature({'decor-color' : '#D1D0CE'});
        empty_sign = $("#sign").jSignature("getData",'image');
    });

    if($('#sign_doc_items').length == 1) {
        signature_dialog.on('hidden.bs.modal', function(e) {
            signature_dialog.find('#confirm_sign').off('click');
        });
    }

    signature_dialog.find('#sign_clean').on('click', function (e) {
        signature_dialog.find("#sign").jSignature('reset');
    });

    if($('#sign_doc').length == 1) {
        signature_dialog.find('#confirm_sign').on('click', function(e) {
            $('#sign_doc').submit();
        });
    }

    $('#signature-validate-button').on('click', function(e) {
        $('#sign_doc_items').submit();
    });

    $('#sign_doc').submit(function(ev){
        ev.preventDefault();
        var $link = $(ev.currentTarget);

        var sign = signature_dialog.find("#sign").jSignature("getData",'image');
        var is_empty = sign?empty_sign[1]==sign[1]:false;
        signature_dialog.find('#signer_info').toggleClass('has-error', ! signer_name);
        signature_dialog.find('#signature_draw').toggleClass('panel-danger', is_empty).toggleClass('panel-default', ! is_empty);

        if (is_empty || ! signer_name)
            return false;
        $('#confirm_sign').prop('disabled', true);

        openerp.jsonRpc($link.attr("action"), "call", {
            'sign': sign?JSON.stringify(sign[1]):false,
            'signer': signature_dialog.find("#signer_name").val()
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
                'text': $(el).val(),
                'signature': $(el).data('signature'),
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
            alert('Some required fields have not been completed')
            return false;
        }

        openerp.jsonRpc(form.attr("action"), "call", {
            'sign': sign_values,
            'signer': $("#signer_name").val()
        }).then(function (data) {
            window.location.href = '/sign/document/'+data['id']+'/'+data['token']+'?message=2';
        });

        return false;
    });
});
