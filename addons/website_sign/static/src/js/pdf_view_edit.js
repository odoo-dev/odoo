
function whenPdfIsLoaded(iframe, fct) {
    nbPages = iframe.contents().find('.page').length;
    nbLayers = iframe.contents().find('.textLayer').length

    if(nbPages > 0 && nbLayers > 0)
        setTimeout(fct, 750, nbPages);
    else
        setTimeout(whenPdfIsLoaded, 250, iframe, fct);
}

function check_pdf_items_completion(iframe, role) {
    var ok = true;
    iframe.contents().find('.sign_item').each(function(i, el) {
        var value = {
            'text': $(el).val(),
            'signature': $(el).data('signature'),
            'date': $(el).val()
        }[$(el).data('type')];

        var resp = parseInt($(el).data('responsible')) || 0;

        if(!value && $(el).data('required') && (resp <= 0 || resp == role))
            ok = false;
    });

    validateButton = $('#signature-validate-button');
    if(ok) {
        validateButton.prop("disabled", false);
        validateButton.html("Validate");
        validateButton.addClass("fa fa-check");
    }
    else {
        $('#signature-validate-button').prop("disabled", true);
        validateButton.html("Fields to complete");
        validateButton.removeClass("fa fa-check");
    }
}

function update_pdf_items(iframe, configuration) {
    for(var page in configuration) {
        pageContainer = iframe.contents().find('body #pageContainer' + page);
        for(var i = 0 ; i < configuration[page].length ; i++) {
            configuration[page][i].detach();
            pageContainer.append(configuration[page][i]);
        }
    }
}

function save_pdf_configuration_and_quit(id, config, url) {
    data = [];

    for(var page in config) {
        for(var i = 0 ; i < config[page].length ; i++) {
            data.push({
                'type': config[page][i].data('type'),
                'required': config[page][i].data('required'),
                'page': page,
                'posX': config[page][i].data('posx'),
                'posY': config[page][i].data('posy'),
                'width': config[page][i].data('width'),
                'height': config[page][i].data('height'),
            })
        }
    }

    openerp.jsonRpc("/website_sign/set_signature_items/" + id, "call", {
        'signature_items': data,
    }).then(function (result) {
        window.location.href = url;
    });
}

function create_signature_item(iframe, role, type, required, responsible, posX, posY, width, height, readonly, value) {
    readonly = (readonly === undefined)? false : readonly;
    value = (value === undefined)? {"text": "", "image": ""} : value;

    var elem = null;
    if(readonly) {
        elem = $({
            "text": "<div><span class='helper'/>" + value.text + "</div>",
            "signature": "<div><span class='helper'/>" + ((value.image)? "<img src='data:image/png;base64," + (value.image.substr(1, value.image.length-2)) + "'/>" : "Sign Here") + "</div>",
            "date": "<div><span class='helper'/>" + value.text + "</div>",
        }[type]);
    }
    else {
        elem = $({
            "text": "<textarea/>",
            "signature": "<button>Sign Here</button>",
            "date": "<input type='date'/>",
        }[type]);

        if(type === "signature") {
            elem.attr('type', "button");
            elem.on('click', function(e) {
                $("#sign_diag #confirm_sign").one('click', function(e) {
                    var sign_img = $('#sign_diag').find('.sign').jSignature("getData",'image');
                    elem.html('<span class="helper"/><img src="data:'+sign_img[0]+','+sign_img[1]+'"/>');
                    elem.data('signature', JSON.stringify(sign_img[1]));
                    elem.change();
                });

                var sign_img = $('#sign_diag').find('.sign').jSignature("getData",'image');
                if(sign_img && (elem.html() == "Sign Here" || 'data:'+sign_img[0]+','+sign_img[1] != elem.find('img').attr('src')))
                    $("#sign_diag #confirm_sign").click();
                else {
                    $("#sign_diag").attr('data-target', '#sign_diag');
                    $("#sign_diag").click();
                    $("#sign_diag").removeAttr('data-target');
                }
            });
        }
    }    

    if(elem !== null) {
        if(posX < width/2)
            posX = width/2;
        else if(posX > 1.0-width/2)
            posX = 1.0-width/2;
        if(posY < height/2)
            posY = height/2;
        else if(posY > 1.0-height/2)
            posY = 1.0-height/2;

        elem.addClass('sign_item');
        elem.css('left', (posX-width/2)*100 + '%').css('top', (posY-height/2)*100 + '%');
        elem.css('width', width*100 + '%').css('height', height*100 + '%');
        elem.data('type', type).data('required', required).data('responsible', responsible).data('posx', posX).data('posy', posY).data('width', width).data('height', height);

        elem.css('resize', 'none');

        elem.on('change', function(e) {
            check_pdf_items_completion(iframe, role);
        });
    }

    return elem;
}

function enableCustom(elem) {
    var width = elem.data('width');
    var height = elem.data('height');

    elem.css('resize', 'both');

    elem.on('mousedown', function(e) {
        var posX = (e.pageX - elem.offset().left) / parseFloat(elem.css('width'));
        var posY = (e.pageY - elem.offset().top) / parseFloat(elem.css('height'));;
        if(posX > 0.8 && posY > 0.8)
            return true;

        fct = function(e) {
            var posX = (e.pageX - elem.parent().offset().left) / elem.parent().width();
            var posY = (e.pageY - elem.parent().offset().top) / elem.parent().height();

            if(posX < width/2)
                posX = width/2;
            else if(posX > 1.0-width/2)
                posX = 1.0-width/2;
            if(posY < height/2)
                posY = height/2;
            else if(posY > 1.0-height/2)
                posY = 1.0-height/2;

            elem.css('left', (posX-elem.data('width')/2)*100 + '%').css('top', (posY-elem.data('height')/2)*100 + '%');
        };

        elem.on('mousemove', fct);
        elem.parent().on('mousemove', fct);
    });

    mouveup_fct = function(e) {
        elem.off('mousemove');
        elem.parent().off('mousemove');

        var width = parseFloat(elem.css('width'))/parseFloat(elem.parent().css('width'));
        var height = parseFloat(elem.css('height'))/parseFloat(elem.parent().css('height'));

        elem.data('posx', parseFloat(elem.css('left'))/parseFloat(elem.parent().css('width')) + width/2);
        elem.data('posy', parseFloat(elem.css('top'))/parseFloat(elem.parent().css('height')) + height/2);
        elem.data('width', width);
        elem.data('height', height);

        elem.css('width', width*100 + '%').css('height', height*100 + '%');

        if(elem.data('posx') + width/2 > 1) {
            var newWidth = 1 - (elem.data('posx') - width/2);
            elem.data('posx', 1 - newWidth/2);
            elem.css('width', newWidth*100 + '%');
        }
        if(elem.data('posy') + height/2 > 1) {
            var newHeight = 1 - (elem.data('posy') - height/2);
            elem.data('posy', 1 - newHeight/2);
            elem.css('height', newHeight*100 + '%');
        }
    };

    elem.on('mouseup', mouveup_fct);
}

$(function() {
    // Specify the main script used to create a new PDF.JS web worker.      TODO
    // In production, leave this undefined or change it to point to the
    // combined `pdf.worker.js` file.
    PDFJS.workerSrc = '/website_sign/static/lib/pdfjs/build/pdf.worker.js';

    var signature_request_id = $('#input_signature_request_id').val();
    var attachment_location = $('#input_attachment_location').val();
    var readonly = $('#input_field_readonly').val() == "True" || false;
    var role = parseInt($('#input_current_role').val()) || 0;
    var iframe = $('#signature-field-view iframe');;

    var currentFieldType = false;
    var configuration = {};

    // Save button
    button_save = $('#signature_fields_save');
    button_save.on('click', function(e) {
        e.preventDefault();
        save_pdf_configuration_and_quit(signature_request_id, configuration, button_save.attr('href'));
    });

    // Fields button
    field_type_buttons = $('#signature-field-view .field_type_button');
    field_type_buttons.on('click', function(e) {
        field_type_buttons.removeClass('fa fa-check');

        checkedButton = $(e.currentTarget);
        checkedButton.addClass('fa fa-check');
        currentFieldType = checkedButton.data('item-type');
    });
    $(field_type_buttons[0]).click();

    var viewerURL = "../../website_sign/static/lib/pdfjs/web/viewer.html?file=../../../../.." + encodeURIComponent(attachment_location).replace(/'/g,"%27").replace(/"/g,"%22");
    if($('#iframe-view').length > 0)
        viewerURL = "../" + viewerURL;
    iframe.attr('src', viewerURL).css('width', '100%').css('height', '1000px');

    whenPdfIsLoaded(iframe, function(nbPages) {
        for(var i = 1 ; i <= nbPages ; i++)
            configuration[i] = [];

        elemDblClickFct = function(e) {
            var currentElem = $(e.currentTarget);
            var pageNo = parseInt(currentElem.parent().attr('id').substr('pageContainer'.length));
            currentElem.remove();
            for(var i in configuration[pageNo]) {
                if(configuration[pageNo][i].data('posx') === currentElem.data('posx')
                    && configuration[pageNo][i].data('posy') === currentElem.data('posy'))
                    configuration[pageNo].splice(i, 1);
            }
            return false;
        }

        iframe.parent().find("input[type='hidden']").each(function(i, el){
            var values = {
                'text': $(el).data('item-value-text') || "",
                'image': $(el).data('item-value-image') || "",
            };

            var resp = parseInt($(el).data('responsible')) || 0;

            var elem = create_signature_item(iframe, role,
                $(el).data('type'), $(el).data('required') == "True", $(el).data('responsible') || 0,
                $(el).data('posx'), $(el).data('posy'),
                $(el).data('width'), $(el).data('height'),
                readonly || (resp > 0 && resp != role), values);
            elem.data('item-id', $(el).data('item-id'));

            configuration[parseInt($(el).data('page'))].push(elem);

            if($('#iframe-edit').length == 1) {
                elem.on('dblclick', elemDblClickFct);
                enableCustom(elem);
            }
        });

        update_pdf_items(iframe, configuration);
        check_pdf_items_completion(iframe, role);

        // var update_timer = setInterval(update_pdf_items, 1000, iframe, configuration);
        iframe.contents().find('#viewerContainer').on('scroll', function(e) {
            update_pdf_items(iframe, configuration);
            check_pdf_items_completion(iframe, role);
        });
        
        // var cssLinks = $("head link[rel='stylesheet']"); 
        // iframe.contents().find('head').append(cssLinks.clone());
        var cssLink = $("<link rel='stylesheet' type='text/css' href='../../../../../website_sign/static/src/css/iframe_style.css'/>"); 
        iframe.contents().find('head').append(cssLink);

        $('#iframe-edit').contents().find('.page').on('dblclick', function(e) {
            var parent = $(e.currentTarget);
            var pageNo = parseInt(parent.attr('id').substr('pageContainer'.length));

            var required = true;
            var posX = (e.pageX - parent.offset().left) / parent.width();
            var posY = (e.pageY - parent.offset().top) / parent.height();
            var WIDTH = 0.2, HEIGHT = 0.05;

            var elem = create_signature_item(iframe, role, currentFieldType, required, 0, posX, posY, WIDTH, HEIGHT, false);
            if(elem !== null) {
                elem.on('dblclick', elemDblClickFct);

                configuration[pageNo].push(elem);
                update_pdf_items(iframe, configuration);
                enableCustom(elem);
            }
        });
    });
});
