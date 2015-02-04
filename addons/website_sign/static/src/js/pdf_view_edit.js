
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
                'responsible': config[page][i].data('responsible'),
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

function update_signature_element(elem) {
    var relOuterSizeX = (elem.outerWidth() - elem.width()) / elem.parent().innerWidth();
    var relOuterSizeY = (elem.outerHeight() - elem.height()) / elem.parent().innerHeight();

    var posX = elem.data('posx'), posY = elem.data('posy');
    var width = elem.data('width'), height = elem.data('height');

    if(posX < 0)
        posX = 0;
    else if(posX+width+relOuterSizeX > 1.0)
        posX = 1.0-width-relOuterSizeX;
    if(posY < 0)
        posY = 0;
    else if(posY+height+relOuterSizeY > 1.0)
        posY = 1.0-height-relOuterSizeY;

    elem.data('posx', posX).data('posy', posY);

    elem.css('left', posX*100 + '%').css('top', posY*100 + '%');
    elem.css('width', width*100 + '%').css('height', height*100 + '%');
}

function create_signature_item(iframe, role, type, required, responsible, posX, posY, width, height, readonly, value) {
    value = (value === undefined)? {"text": "", "image": ""} : value;

    var elem = $("<div><span class='helper'/></div>");
    if(!readonly) {
        elem = $({
            "text": "<textarea/>",
            "signature": "<button type='button'><span class='helper'/></div>",
            "date": "<input type='date'/>",
        }[type]);

        if(type === "signature") {
            elem.on('click', function(e) {
                $("#signature_dialog #confirm_sign").one('click', function(e) {
                    var sign_img = $('#signature_dialog').find('#sign').jSignature("getData",'image');
                    elem.html('<span class="helper"/><img src="data:'+sign_img[0]+','+sign_img[1]+'"/>');
                    elem.data('signature', JSON.stringify(sign_img[1]));
                    elem.change();
                });

                var sign_img = $('#signature_dialog').find('#sign').jSignature("getData",'image');
                if(sign_img && (elem.html() == "Sign Here" || 'data:'+sign_img[0]+','+sign_img[1] != elem.find('img').attr('src')))
                    $("#signature_dialog #confirm_sign").click();
                else {
                    $("#signature_dialog").attr('data-target', '#signature_dialog');
                    $("#signature_dialog").click();
                    $("#signature_dialog").removeAttr('data-target');
                }
            });
        }
    }

    elem.addClass('sign_item');
    var v = {
        "text": value.text,
        "signature": (value.image)? "<img src='data:image/png;base64," + (value.image.substr(1, value.image.length-2)) + "'/>" : "Sign Here",
        "date": value.text,
    }[type];
    elem.html(elem.html() + v);
    elem.val(v);

    elem.on('change', function(e) {
        check_pdf_items_completion(iframe, role);
    });

    if(required)
        elem.addClass('sign_item_required');

    elem.data('type', type).data('required', required).data('responsible', responsible).data('posx', posX).data('posy', posY).data('width', width).data('height', height);

    return elem;
}

function enableCustom(elem) {
    elem.css('resize', 'both').css('overflow', 'auto');
    
    var relOuterSizeX = (elem.outerWidth() - elem.width()) / elem.parent().innerWidth();
    var relOuterSizeY = (elem.outerHeight() - elem.height()) / elem.parent().innerHeight();

    elem.on('mousedown', function(e) {
        var grabX = (e.pageX - elem.offset().left) / elem.outerWidth();
        var grabY = (e.pageY - elem.offset().top) / elem.outerHeight();
        if((1-grabX)*elem.outerWidth() < 25 && (1-grabY)*elem.outerHeight() < 25)
            return true;

        var relWidth = elem.outerWidth()/elem.parent().innerWidth();
        var relHeight = elem.outerHeight()/elem.parent().innerHeight();

        move_fct = function(e) {
            var posX = (e.pageX - (elem.parent().offset().left)) / elem.parent().innerWidth() - relWidth * grabX;
            var posY = (e.pageY - (elem.parent().offset().top)) / elem.parent().innerHeight() - relHeight * grabY;

            elem.data('posx', posX).data('posy', posY);
            update_signature_element(elem);
        };

        elem.on('mousemove', move_fct);
        elem.parent().on('mousemove', move_fct);
    });

    elem.on('mouseup', function(e) {
        elem.off('mousemove');
        elem.parent().off('mousemove');

        elem.data('width', elem.width()/elem.parent().innerWidth());
        elem.data('height', elem.height()/elem.parent().innerHeight());

        var relWidth = elem.outerWidth()/elem.parent().innerWidth();
        var relHeight = elem.outerHeight()/elem.parent().innerHeight();
        if(elem.data('posx') + relWidth > 1) {
            var newWidth = 1 - elem.data('posx');
            elem.data('width', newWidth-relOuterSizeX);
        }
        if(elem.data('posy') + relHeight > 1) {
            var newHeight = 1 - elem.data('posy');
            elem.data('height', newHeight-relOuterSizeY);
        }

        update_signature_element(elem);
    });

    var requiredCheckbox = $("<input type='checkbox'/>");
    requiredCheckbox.prop("checked", elem.data('required'));
    requiredCheckbox.on('change', function(e) {
        elem.data('required', requiredCheckbox.prop('checked'));
        elem.toggleClass('sign_item_required');
    });
    requiredCheckbox.on('dblclick', function(e) {
        return false;
    });
    elem.append(requiredCheckbox);

    var responsibleField = $("<button type='button'/>");
    var str = $('#responsibles_diag button[data-party="' + elem.data('responsible') + '"]').html();
    if(str.length > 10)
        str = str.substr(0, 5) + "...";
    responsibleField.html(str);
    responsibleField.on('click', function(e) {
        var diag = $('#responsibles_diag');
        diag.attr('data-target', "#responsibles_diag");
        diag.click();
        diag.removeAttr('data-target');

        diag.find("button").off('click');
        diag.find("button").on('click', function(e) {
            var b = $(e.currentTarget);
            var str = b.html();
            if(str.length > 10)
                str = str.substr(0, 5) + "...";
            responsibleField.html(str);
            elem.data('responsible', parseInt(b.data('party')));
        });
    });
    elem.append(responsibleField);
}

$(function() {
    PDFJS.workerSrc = '/website_sign/static/lib/pdfjs/build/pdf.worker.js';

    var signature_request_id = $('#input_signature_request_id').val();
    var attachment_location = $('#input_attachment_location').val();
    var readonly = ($('#input_field_readonly').val() == "True") || false;
    var role = parseInt($('#input_current_role').val()) || 0;
    var iframe = $('#signature-field-view iframe');
    var editMode = ($('#iframe-edit').length == 1);

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
    if(!editMode)
        viewerURL = "../" + viewerURL;
    iframe.attr('src', viewerURL).css('width', '100%').css('height', '1000px');

    whenPdfIsLoaded(iframe, function(nbPages) {
        for(var i = 1 ; i <= nbPages ; i++)
            configuration[i] = [];

        var elemDblClickFct = function(e) {
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

        // var cssLinks = $("head link[rel='stylesheet']"); 
        // iframe.contents().find('head').append(cssLinks.clone());
        var cssLink = $("<link rel='stylesheet' type='text/css' href='../../../../../website_sign/static/src/css/iframe.css'/>");
        iframe.contents().find('head').append(cssLink);

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
                readonly || editMode || (resp > 0 && resp != role), values);
            elem.data('item-id', $(el).data('item-id'));

            configuration[parseInt($(el).data('page'))].push(elem);
        });

        update_pdf_items(iframe, configuration);
        check_pdf_items_completion(iframe, role);
        setTimeout(function() {
            iframe.contents().find('.sign_item').each(function(i, el) {
                update_signature_element($(el));
                if(editMode) {
                    $(el).on('dblclick', elemDblClickFct);
                    enableCustom($(el));
                }
            });
        }, 0); // TODO why is this necessary...

        // var update_timer = setInterval(update_pdf_items, 1000, iframe, configuration);
        iframe.contents().find('#viewerContainer').on('scroll', function(e) {
            update_pdf_items(iframe, configuration);
            check_pdf_items_completion(iframe, role);
        });

        if(editMode) {
            iframe.contents().find('.page').on('dblclick', function(e) {
                var parent = $(e.currentTarget);
                var pageNo = parseInt(parent.attr('id').substr('pageContainer'.length));

                var required = true;
                var posX = (e.pageX - parent.offset().left) / parent.innerWidth();
                var posY = (e.pageY - parent.offset().top) / parent.innerHeight();
                var WIDTH = 0.2, HEIGHT = 0.05;

                var elem = create_signature_item(iframe, role, currentFieldType, required, 0, posX-WIDTH/2, posY-HEIGHT/2, WIDTH, HEIGHT, true);
                if(elem !== null) {
                    elem.on('dblclick', elemDblClickFct);

                    configuration[pageNo].push(elem);
                    update_pdf_items(iframe, configuration);
                    update_signature_element(elem);
                    enableCustom(elem);
                }
            });
        }
    });
});
