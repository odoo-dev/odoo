
$(document).ready(function () {
    // Document signatures
    var empty_sign = false;
    $('#modesign').on('shown.bs.modal', function (e) {
        $("#sign").empty().jSignature({'decor-color' : '#D1D0CE'});
        empty_sign = $("#sign").jSignature("getData",'image');
    });

    $('#sign_clean').on('click', function (e) {
        $("#sign").jSignature('reset');
    });

    $('#sign_doc').submit(function(ev){
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

    // Fields signatures
    $('#signature-validate-button').on('click', function(e) {
        $('#sign_doc_items').submit();
    });

    $('#sign_diag').on('shown.bs.modal', function(ev){
        // var id = $(ev.currentTarget.id.substr("sign_diag".length);
        $(ev.currentTarget).find(".sign").empty().jSignature({'decor-color' : '#D1D0CE'});
        // $('#sign_item[data-item-id=' + id).html('Sign here');
    });

    $('#sign_diag').on('hidden.bs.modal', function(e) {
        $(e.currentTarget).find('#confirm_sign').off('click');
    });

    $('#sign_doc_items').submit(function(ev){
        ev.preventDefault();
        var form = $(ev.currentTarget);
        var ok = true;

        var sign_values = {};
        var sign_items = form.find('.sign_item');
        sign_items.each(function(i, el){
            var value = {
                'text': $(el).val(),
                'signature': $(el).data('signature'),
            }[$(el).data('type')];

            if(!value && $(el).data('required')) {
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
