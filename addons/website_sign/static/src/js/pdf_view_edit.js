
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
        var value = $(el).val();
        if($(el).data('type') == 'signature' || $(el).data('type') == 'initial') {
            value = $(el).data('signature');
        }

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

    var signature_dialog = $('#signature_dialog');

    var elem = $("<div><span class='helper'/></div>");
    if(!readonly) {
        elem = $({
            "signature": "<button type='button'><span class='helper'/></div>",
            "initial": "<button type='button'><span class='helper'/></div>",
            "text": "<input type='text'/>",
            "textarea": "<textarea/>",
            "date": "<input type='date'/>",
        }[type]);

        if(type === "signature" || type === "initial") {
            elem.on('click', function(e) {
                var signed_items = iframe.contents().find('.sign_item').filter(function(i) {
                    return $(this).data('type') == type && $(this).data('signature') && $(this).data('signature') != elem.data('signature');
                });
                
                if(signed_items.length > 0) {
                    elem.data('signature', $(signed_items[0]).data('signature'));
                    elem.html('<span class="helper"/><img src="' + elem.data('signature') + '"/>');

                    elem.change();
                }
                else {
                    $("#signature_dialog #confirm_sign").one('click', function(e) {
                        var sign_img = $('#signature_dialog').find('#sign').jSignature("getData",'image');
                        elem.data('signature', 'data:'+sign_img[0]+','+sign_img[1]);
                        elem.html('<span class="helper"/><img src="' + elem.data('signature') + '"/>');
                        
                        elem.change();
                    });

                    signature_dialog.data('signature-type', type);
                    signature_dialog.data('signature-ratio', width/height);
                    signature_dialog.attr('data-target', '#signature_dialog');
                    signature_dialog.click();
                    signature_dialog.removeAttr('data-target');
                }
            });
        }
    }

    if(type == 'textarea')
        elem.css('text-align', 'left');

    elem.addClass('sign_item');
    var v = value.text;
    if(type == 'signature')
        v = (value.image)? "<img src='" + value.image + "'/>" : "Sign Here";
    else if(type == 'initial')
        v = (value.image)? "<img src='" + value.image + "'/>" : "Mark";
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
    var pageBorderX = (elem.parent().outerWidth() - elem.parent().innerWidth())/2;
    var pageBorderY = (elem.parent().outerHeight() - elem.parent().innerHeight())/2;

    elem.on('mousedown', function(e) {
        var grabX = (e.pageX - elem.offset().left) / elem.outerWidth();
        var grabY = (e.pageY - elem.offset().top) / elem.outerHeight();
        if((1-grabX)*elem.outerWidth() < 25 && (1-grabY)*elem.outerHeight() < 25)
            return true;

        var relWidth = elem.outerWidth()/elem.parent().innerWidth();
        var relHeight = elem.outerHeight()/elem.parent().innerHeight();

        move_fct = function(e) {
            var posX = (e.pageX - (elem.parent().offset().left+pageBorderX)) / elem.parent().innerWidth() - relWidth * grabX;
            var posY = (e.pageY - (elem.parent().offset().top+pageBorderY)) / elem.parent().innerHeight() - relHeight * grabY;

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

function scrollToSignItem(iframe, itemNo) {
    var sign_item_navigator = $(iframe.contents().find('.sign_item_navigator')[0]);
    sign_item_navigator.detach();

    var sign_items = iframe.contents().find('.sign_item').sort(function(a, b) {
        if(Math.abs($(b).offset().top - $(a).offset().top) > $(a).parent().height()/100) {
            return ($(b).offset().top < $(a).offset().top)? 1 : -1;
        }
        else {
            return ($(b).offset().left < $(a).offset().left)? 1 : -1;
        }
    });

    sign_items.removeClass('sign_item_selected');
    $(sign_items[itemNo]).addClass('sign_item_selected');

    $(iframe.contents().find('#viewerContainer')[0]).animate({
        scrollTop: $(sign_items[itemNo]).offset().top - $(iframe.contents().find('#viewer')[0]).offset().top - $(iframe.contents().find('#viewerContainer')[0]).height()/4
    }, 500);

    sign_item_navigator.html({
        'signature': "Sign !",
        'initial': "Mark !",
        'text': "Fill in !",
        'textarea': "Fill in !",
        'date': "Time ?",
    }[$(sign_items[itemNo]).data('type')]);
    sign_item_navigator.appendTo($(sign_items[itemNo]).parent()).animate({'top': $(sign_items[itemNo]).position().top/$(sign_items[itemNo]).parent().height()*100+'%'}, 500);
}

function updateFontSize(iframe) {
    var size = $(iframe.contents().find('.page')[0]).height() / 75; // TODO
    iframe.contents().find('.sign_item').css('font-size', size + 'px');
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

    var sign_item_navigator = $('<div/>');
    sign_item_navigator.addClass('sign_item_navigator');

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

        var cssLink = $("<link rel='stylesheet' type='text/css' href='../../../../../website_sign/static/src/css/iframe.css'/>");
        iframe.contents().find('head').append(cssLink);

        iframe.parent().find("input[type='hidden']").sort(function(a, b) {
            if($(b).data('page') < $(a).data('page'))
                return 1;
            else if($(b).data('page') > $(a).data('page'))
                return -1;

            if(Math.abs($(b).data('posy') - $(a).data('posy')) > 0.01) {
                return ($(b).data('posy') < $(a).data('posy'))? 1 : -1;
            }
            else {
                return ($(b).data('posx') < $(a).data('posx'))? 1 : -1;
            }
        }).each(function(i, el){
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

            if(!editMode && resp > 0 && resp != role)
                elem.removeClass('sign_item_required');

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
        }, 0); // TODO this fix a problem but not very nice code

        // var update_timer = setInterval(update_pdf_items, 1000, iframe, configuration);
        iframe.contents().find('#viewerContainer').on('scroll', function(e) {
            update_pdf_items(iframe, configuration);
            check_pdf_items_completion(iframe, role);
            updateFontSize(iframe);
            // TODO ? scrollToSignItem(iframe, 0);
        });

        if(editMode) {
            iframe.contents().find('.page').on('dblclick', function(e) {
                var parent = $(e.currentTarget);
                var pageNo = parseInt(parent.attr('id').substr('pageContainer'.length));

                var pageBorderX = (parent.outerWidth() - parent.innerWidth())/2;
                var pageBorderY = (parent.outerHeight() - parent.innerHeight())/2;

                var required = true;
                var posX = (e.pageX - (parent.offset().left+pageBorderX)) / parent.innerWidth();
                var posY = (e.pageY - (parent.offset().top+pageBorderY)) / parent.innerHeight();
                
                var WIDTH = 0, HEIGHT = 0;
                switch(currentFieldType) {
                    case 'signature':
                        WIDTH = 0.300;
                        HEIGHT = 0.090;
                        break;

                    case 'initial':
                        WIDTH = 0.100;
                        HEIGHT = 0.045;
                        break;

                    case 'text':
                        WIDTH = 0.200;
                        HEIGHT = 0.015;
                        break;

                    case 'textarea':
                        WIDTH = 0.500;
                        HEIGHT = 0.200;
                        break;

                    case 'date':
                        WIDTH = 0.150;
                        HEIGHT = 0.015;
                        break;
                }

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

        iframe.contents().find('#viewer').append(sign_item_navigator);
    });

    // Go to other sign item buttons
    var nav_buttons = $('.other-sign-item-button');
    var currentItemNo = 0;
    $(nav_buttons[0]).on('click', function(e) {
        currentItemNo--;
        if(currentItemNo < 0)
            currentItemNo = iframe.contents().find('.sign_item').length-1;
    });
    $(nav_buttons[1]).on('click', function(e) {
        currentItemNo++;
        if(currentItemNo >= iframe.contents().find('.sign_item').length)
            currentItemNo = 0;
    });
    nav_buttons.on('click', function(e) {
        scrollToSignItem(iframe, currentItemNo);
    });
});
