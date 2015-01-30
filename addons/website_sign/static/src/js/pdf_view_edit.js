
function check_pdf_items_completion(canvas) {
    var ok = true;
    canvas.parent().find('.sign_item').each(function(i, el) {
        var value = {
            'text': $(el).val(),
            'signature': $(el).data('signature'),
        }[$(el).data('type')];

        if(!value && $(el).data('required')) {
            ok = false;
            return;
        }
    });

    validateButton = $('#signature-validate-button');
    if(ok) {
        validateButton.prop("disabled", false);
        validateButton.html("Validate")
        validateButton.addClass("fa fa-check");
    }
    else {
        $('#signature-validate-button').prop("disabled", true);
        validateButton.html("Fields to complete")
        validateButton.removeClass("fa fa-check");
    }
}

function update_pdf_items(canvas, pageNo, config) {
    canvas.parent().find('.sign_item').hide();
    for(var i in config[pageNo])
        config[pageNo][i].show();
}

function update_pdf_page(canvas, pdf, pageNo, config) {
    if(!canvas || !pdf)
        return false;

    if(update_pdf_page.is_updating === true)
        return false;
    update_pdf_page.is_updating = true;

    update_pdf_items(canvas, pageNo, config);

    return pdf.getPage(pageNo).then(function(page) {
        var scale = 1.25;
        var viewport = page.getViewport(scale);

        var context = canvas[0].getContext('2d');
        canvas.attr('width', viewport.width);
        canvas.attr('height', viewport.height);

        var renderContext = {
            canvasContext: context,
            viewport: viewport
        };
        page.render(renderContext);
        update_pdf_page.is_updating = false;
    });
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

function create_signature_item(canvas, type, required, posX, posY, width, height, readonly, value) {
    readonly = (readonly === undefined)? false : readonly;
    value = (value === undefined)? {"text": "", "image": ""} : value;

    var fx = canvas.width() / canvas.parent().width();
    var fy = canvas.height() / canvas.parent().height();

    var elem = null;
    if(readonly) {
        elem = $({
            "text": "<div>" + value.text + "</div>",
            "signature": (value.image)? "<div><span class='helper'/><img src='data:image/png;base64," + (value.image.substr(1, value.image.length-2)) + "'/></div>" : "<button type='button'>Sign Here</button>"
        }[type]);
    }
    else {
        elem = $({
            "text": "<textarea>" + value.text + "</textarea>",
            "signature": "<button data-toggle='modal' data-target='#sign_diag'>Sign Here</button>",
        }[type]);

        if(type === "signature") {
            elem.addClass("btn btn-block");
            elem.attr('type', "button");
            elem.on('click', function(e) {
                $("#sign_diag #confirm_sign").one('click', function(e) {
                    var sign_img = $('#sign_diag').find('.sign').jSignature("getData",'image');
                    elem.html('<span class="helper"/><img src="data:'+sign_img[0]+','+sign_img[1]+'"/>');
                    elem.data('signature', JSON.stringify(sign_img[1]));
                    elem.change();
                });
            });
        }
    }    

    if(elem !== null) {
        elem.addClass('sign_item');
        elem.css('left', (posX-width/2)*100*fx + '%').css('top', (posY-height/2)*100*fy + '%');
        elem.css('width', width*100*fx + '%').css('height', height*100*fy + '%');
        elem.data('type', type).data('required', required).data('posx', posX).data('posy', posY).data('width', width).data('height', height);

        elem.on('change', function(e) {
            check_pdf_items_completion(canvas);
        });
    }

    return elem;
}

$(document).ready(function() {
    // Specify the main script used to create a new PDF.JS web worker.      TODO
    // In production, leave this undefined or change it to point to the
    // combined `pdf.worker.js` file.
    PDFJS.workerSrc = '/website_sign/static/lib/pdfjs/worker_loader.js';

    var signature_request_id = $('#input_signature_request_id').val();
    var attachment_location = $('#input_attachment_location').val();
    var readonly = $('#input_field_readonly').val() || false;
    var roles = $('#input_current_roles').val() || [];
    if(typeof roles === "string")
        roles = $.parseJSON(roles);
    var canvas = $('#signature-field-view canvas');;
    var pdf = false;
    var pageNo = 1;
    var currentFieldType = false;

    var configuration = {};

    // Save button
    button_save = $('#signature_fields_save');
    button_save.on('click', function(e) {
        e.preventDefault();
        save_pdf_configuration_and_quit(signature_request_id, configuration, button_save.attr('href'));
    });

    // Pages buttons
    button_before = $('#signature_page_before');
    button_after = $('#signature_page_after');
    page_fields = $('#signature_pages input');

    page_fields.val(pageNo);
    button_before.prop('disabled', true);

    button_before.on('click', function(e){
        if(pageNo > 1) {
            pageNo--;
            if(pageNo == 1)
                button_before.prop('disabled', true);
            button_after.prop('disabled', false);
            $(page_fields[0]).val(pageNo);
            update_pdf_page(canvas, pdf, pageNo, configuration);
        }
    });
    button_after.on('click', function(e){
        if(pageNo < pdf.numPages) {
            pageNo++;
            if(pageNo == pdf.numPages)
                button_after.prop('disabled', true);
            button_before.prop('disabled', false);
            $(page_fields[0]).val(pageNo);
            update_pdf_page(canvas, pdf, pageNo, configuration);
        }
    });
    $(page_fields[0]).on('change', function(e) {
        pageNo = parseInt($(e.currentTarget).val());
        if(pageNo < 1)
            pageNo = 1;
        else if(pageNo > pdf.numPages)
            pageNo = pdf.numPages;
        $(e.currentTarget).val(pageNo);
        update_pdf_page(canvas, pdf, pageNo, configuration);
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

    // Load PDF
    PDFJS.getDocument(attachment_location).then(function(pdf_data) {
        pdf = pdf_data;
        
        $(page_fields[1]).val(pdf.numPages);
        if(pdf.numPages == 1) {
            $(page_fields[0]).prop('disabled', true);
            button_after.prop('disabled', true);
        }
        for(var i = 1 ; i <= pdf.numPages ; i++)
            configuration[i] = [];

        var task = update_pdf_page(canvas, pdf, pageNo, configuration);
        if(task !== false) {
            task.then(function(result){
                canvas.parent().find("input[type='hidden']").each(function(i, el){
                    var values = {
                        'text': $(el).data('item-value-text') || "",
                        'image': $(el).data('item-value-image') || "",
                    };

                    var resp = parseInt($(el).data('responsible'));
                    
                    var elem = create_signature_item(canvas,
                        $(el).data('type'), $(el).data('required'),
                        $(el).data('posx'), $(el).data('posy'),
                        $(el).data('width'), $(el).data('height'),
                        readonly || (resp !== 0 && !$.inArray(resp, roles)), values);
                    elem.data('item-id', $(el).data('item-id'));

                    if($('#canvas-edit').length == 1)
                        elem.on('dblclick', function(e) {
                            var currentElem = $(e.currentTarget);
                            currentElem.remove();
                            for(var i in configuration[pageNo]) {
                                if(configuration[pageNo][i].data('posx') === currentElem.data('posx')
                                    && configuration[pageNo][i].data('posy') === currentElem.data('posy'))
                                    configuration[pageNo].splice(i, 1);
                            }
                        });

                    configuration[parseInt($(el).data('page'))].push(elem);
                    canvas.after(elem);
                });
                check_pdf_items_completion(canvas);
                update_pdf_items(canvas, pageNo, configuration);
            });
        }
    });

    // Canvas actions
    $('#canvas-edit').on('dblclick', function(e) {
        var canvas = $(e.currentTarget);
        var required = true;
        var posX = (e.pageX - canvas.offset().left) / canvas.width();
        var posY = (e.pageY - canvas.offset().top) / canvas.height();
        var WIDTH = 0.2, HEIGHT = 0.05;

        var elem = create_signature_item(canvas, currentFieldType, required, posX, posY, WIDTH, HEIGHT, false);
        if(elem !== null) {
            elem.on('dblclick', function(e) {
                var currentElem = $(e.currentTarget);
                currentElem.remove();
                for(var i in configuration[pageNo]) {
                    if(configuration[pageNo][i].data('posx') === currentElem.data('posx')
                        && configuration[pageNo][i].data('posy') === currentElem.data('posy'))
                        configuration[pageNo].splice(i, 1);
                }
            });

            configuration[pageNo].push(elem);
            canvas.after(elem);
        }
    });
});
