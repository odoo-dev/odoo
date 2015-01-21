
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

    // PDF signatures
    // $('.sign_diag').on('shown.bs.modal', function(ev){
    //     var id = ev.currentTarget.id.substr("sign_diag".length);
    //     $(ev.currentTarget).find(".sign").empty().jSignature({'decor-color' : '#D1D0CE'});
    //     $('#sign_item' + id).html('Sign here');
    // });

    // $('.confirm_sign').on('click', function(ev){
    //     var id = ev.currentTarget.id.substr("confirm_sign".length);
    //     var sign_img = $('#sign_diag' + id).find('.sign').jSignature("getData",'image');
    //     $('#sign_item' + id).html('<span class="helper"/><img src="data:'+sign_img[0]+','+sign_img[1]+'"/>');
    // });

    // $('#sign_doc_items').submit(function(ev){
    //     ev.preventDefault();
    //     var $link = $(ev.currentTarget);

    //     var sign_items = $link.find('.sign_item');
    //     var sign_values = {};
    //     for(var i = 0 ; i < sign_items.length ; i++){
    //         var id = parseInt(sign_items[i].id.substr('sign_item'.length));
    //         var value = $(sign_items[i]).val();
    //         if(!value){
    //             try{
    //                 value = JSON.stringify($('#sign_diag' + id).find('.sign').jSignature("getData",'image')[1]);
    //             }catch(e){}
    //         }

    //         if(!value) return false; // TODO must warn the user

    //         sign_values[id] = value;
    //     }

    //     openerp.jsonRpc($link.attr("action"), "call", {
    //         'sign': sign_values,
    //         'signer': $("#signer_name").val()
    //     }).then(function (data) {
    //         window.location.href = '/sign/document/'+data['id']+'/'+data['token']+'?message=2';
    //     });

    //     return false;
    // });
});
