
$(function() {
    PDFJS.workerSrc = '/website_sign/static/lib/pdfjs/build/pdf.worker.js';
    var pdfViewEdit = new PDFViewEdit();
    pdfViewEdit.run();
});

function PDFViewEdit()
{
    this.signature_request_id = $('#input_signature_request_id').val();

    this.iframe = $('#signature-field-view iframe');

    this.editMode = ($('#iframe-edit').length == 1);
    this.readonly = ($('#input_field_readonly').val() == "True") || false;
    this.pdfView = $('#document_viewmode').val();

    this.role = parseInt($('#input_current_role').val()) || 0;

    this.currentFieldType = false;
    this.configuration = {}

    this.sign_item_navigator = $('<div class="sign_item_navigator"/>');
    
    this.run = function() {
        var self = this;

        // Save button
        button_save = $('#signature_fields_save');
        button_save.on('click', function(e) {
            e.preventDefault();
            self.save_pdf_configuration_and_quit(button_save.attr('href'));
        });

        // Fields button
        field_type_buttons = $('#signature-field-view .field_type_button');
        field_type_buttons.on('click', function(e) {
            field_type_buttons.removeClass('fa fa-check');

            checkedButton = $(e.currentTarget);
            checkedButton.addClass('fa fa-check');
            self.currentFieldType = checkedButton.data('item-type');
        });
        $(field_type_buttons[0]).click();

        var viewerURL = "../../website_sign/static/lib/pdfjs/web/viewer.html?file=";
        if(!self.editMode)
            viewerURL = "../" + viewerURL;
        viewerURL += encodeURIComponent($('#input_attachment_location').val()).replace(/'/g,"%27").replace(/"/g,"%22");
        self.iframe.attr('src', viewerURL).css('width', '100%').css('height', '1000px');

        var completion_nav_fct = function(e) {
            var toComplete = self.check_pdf_items_completion().sort(function(a, b) {
                if(Math.abs($(b).offset().top - $(a).offset().top) > $(a).parent().height()/100)
                    return ($(b).offset().top < $(a).offset().top)? 1 : -1;
                else
                    return ($(b).offset().left < $(a).offset().left)? 1 : -1;
            });

            if(toComplete.length > 0)
                self.scrollToSignItem(toComplete[0]);
            else
                self.sign_item_navigator.hide();
        };
        $('#start-completion-button').on('click', completion_nav_fct);
        self.sign_item_navigator.on('click', completion_nav_fct);

        self.waitForPDF(button_save.attr('href'));
    };

    this.waitForPDF = function(urlError) {
        var self = this;

        if(self.iframe.contents().find('#errorMessage').is(":visible")) {
            alert('Need a valid PDF to add signature fields !');
            window.location.href = urlError;
            return;
        }

        nbPages = self.iframe.contents().find('.page').length;
        nbLayers = self.iframe.contents().find('.textLayer').length;

        if(nbPages > 0 && nbLayers > 0)
            setTimeout(function() { self.doPDFPostLoad(nbPages); }, 750);
        else
            setTimeout(function() { self.waitForPDF(urlError); }, 250);
    };

    this.doPDFPostLoad = function(nbPages) {
        var self = this;

        self.iframe.contents().find('#openFile').hide();
        self.iframe.contents().find('#pageRotateCw').hide();
        self.iframe.contents().find('#pageRotateCcw').hide();
        self.iframe.contents().find('#pageRotateCcw').next().hide();

        for(var i = 1 ; i <= nbPages ; i++)
            self.configuration[i] = [];

        var elemDblClickFct = function(e) {
            var currentElem = $(e.currentTarget);
            var pageNo = parseInt(currentElem.parent().attr('id').substr('pageContainer'.length));
            currentElem.remove();
            for(var i in self.configuration[pageNo]) {
                if(self.configuration[pageNo][i].data('posx') === currentElem.data('posx')
                    && self.configuration[pageNo][i].data('posy') === currentElem.data('posy'))
                    self.configuration[pageNo].splice(i, 1);
            }
            return false;
        }

        var cssLink = $("<link rel='stylesheet' type='text/css' href='../../../../../website_sign/static/src/css/iframe.css'/>");
        self.iframe.contents().find('head').append(cssLink);

        self.iframe.parent().find("input[type='hidden']").sort(function(a, b) {
            if($(b).data('page') < $(a).data('page'))
                return 1;
            else if($(b).data('page') > $(a).data('page'))
                return -1;

            if(Math.abs($(b).data('posy') - $(a).data('posy')) > 0.01)
                return ($(b).data('posy') < $(a).data('posy'))? 1 : -1;
            else
                return ($(b).data('posx') < $(a).data('posx'))? 1 : -1;
        }).each(function(i, el){
            var resp = parseInt($(el).data('responsible')) || 0;

            var elem = self.create_signature_item(
                $(el).data('type'), $(el).data('required') == "True", resp,
                $(el).data('posx'), $(el).data('posy'),
                $(el).data('width'), $(el).data('height'),
                $(el).data('item-value'));
            elem.data('item-id', $(el).data('item-id'));

            self.configuration[parseInt($(el).data('page'))].push(elem);
        });

        self.update_pdf_items();
        self.check_pdf_items_completion();
        setTimeout(function() {
            self.iframe.contents().find('.sign_item').each(function(i, el) {
                self.update_signature_element($(el));
                if(self.editMode) {
                    $(el).on('dblclick', elemDblClickFct);
                    self.enableCustom($(el));
                }
            });
        }, 0); // TODO this fix a problem but not very nice code
        self.updateFontSize();

        self.iframe.contents().find('#viewerContainer').on('scroll', function(e) { // TODO
            self.update_pdf_items();
            self.check_pdf_items_completion();
            self.scrollToSignItem(null);
            self.updateFontSize();
        });

        if(self.editMode) {
            self.iframe.contents().find('.page').on('dblclick', function(e) {
                var parent = $(e.currentTarget);
                var pageNo = parseInt(parent.attr('id').substr('pageContainer'.length));

                var pageBorderX = (parent.outerWidth() - parent.innerWidth())/2;
                var pageBorderY = (parent.outerHeight() - parent.innerHeight())/2;

                var required = true;
                var posX = (e.pageX - (parent.offset().left+pageBorderX)) / parent.innerWidth();
                var posY = (e.pageY - (parent.offset().top+pageBorderY)) / parent.innerHeight();
                
                var WIDTH = 0, HEIGHT = 0;
                switch(self.currentFieldType) {
                    case 'signature':
                        WIDTH = 0.300; HEIGHT = 0.090;
                        break;

                    case 'initial':
                        WIDTH = 0.100; HEIGHT = 0.045;
                        break;

                    case 'text':
                        WIDTH = 0.200; HEIGHT = 0.015;
                        break;

                    case 'textarea':
                        WIDTH = 0.500; HEIGHT = 0.200;
                        break;

                    case 'date':
                        WIDTH = 0.150; HEIGHT = 0.015;
                        break;
                }

                var elem = self.create_signature_item(self.currentFieldType, required, 0, posX-WIDTH/2, posY-HEIGHT/2, WIDTH, HEIGHT);
                if(elem !== null) {
                    elem.on('dblclick', elemDblClickFct);

                    self.configuration[pageNo].push(elem);
                    self.update_pdf_items();
                    self.update_signature_element(elem);
                    self.enableCustom(elem);
                }
            });
        }
    }

    this.check_pdf_items_completion = function() {
        var self = this;

        var ok = true;
        var toComplete = [];
        self.iframe.contents().find('.sign_item').each(function(i, el) {
            var value = $(el).val();
            if($(el).data('type') == 'signature' || $(el).data('type') == 'initial') {
                value = $(el).data('signature');
            }

            var resp = parseInt($(el).data('responsible')) || 0;

            if(!value && $(el).data('required') && (resp <= 0 || resp == self.role)) {
                ok = false;
                toComplete.push($(el));
            }
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

        return toComplete;
    };

    this.update_pdf_items = function() {
        var self = this;

        for(var page in self.configuration) {
            pageContainer = self.iframe.contents().find('body #pageContainer' + page);
            for(var i = 0 ; i < self.configuration[page].length ; i++) {
                self.configuration[page][i].detach();
                pageContainer.append(self.configuration[page][i]);
            }
        }
    };

    this.save_pdf_configuration_and_quit = function(url) {
        var self = this;

        data = [];
        for(var page in self.configuration) {
            for(var i = 0 ; i < self.configuration[page].length ; i++) {
                data.push({
                    'type': self.configuration[page][i].data('type'),
                    'required': self.configuration[page][i].data('required'),
                    'responsible': self.configuration[page][i].data('responsible'),
                    'page': page,
                    'posX': self.configuration[page][i].data('posx'),
                    'posY': self.configuration[page][i].data('posy'),
                    'width': self.configuration[page][i].data('width'),
                    'height': self.configuration[page][i].data('height'),
                })
            }
        }

        openerp.jsonRpc("/website_sign/set_signature_items/" + self.signature_request_id, "call", {
            'signature_items': data,
        }).then(function (result) {
            window.location.href = url;
        });
    };

    this.update_signature_element = function(elem) {
        var self = this;

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
    };

    this.create_signature_item = function(type, required, responsible, posX, posY, width, height, value) {
        var self = this;

        var readonly = self.readonly || self.editMode || (responsible > 0 && responsible != self.role);        

        var elem = $("<div><span class='helper'/></div>");
        if(!readonly) {
            elem = $({
                "signature": "<button type='button'><span class='helper'/></div>",
                "initial": "<button type='button'><span class='helper'/></div>",
                "text": "<input type='text'/>",
                "textarea": "<textarea/>",
                "date": "<input type='text'/>",
            }[type]);

            if(type === "signature" || type === "initial") {
                elem.on('click', function(e) {
                    var signed_items = self.iframe.contents().find('.sign_item').filter(function(i) {
                        return ($(this).data('type') == type
                                    && $(this).data('signature') && $(this).data('signature') != elem.data('signature')
                                    && ($(this).data('responsible') <= 0 || $(this).data('responsible') == elem.data('responsible')));
                    });
                    
                    if(signed_items.length > 0) {
                        elem.data('signature', $(signed_items[0]).data('signature'));
                        elem.html('<span class="helper"/><img src="' + elem.data('signature') + '"/>');

                        elem.change();
                    }
                    else {
                        var signature_dialog = $('#signature_dialog');

                        signature_dialog.find("#confirm_sign").one('click', function(e) {
                            var sign_img = $('#signature_dialog').find('#sign').jSignature("getData");
                            elem.data('signature', sign_img);
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

        if(type === 'textarea')
            elem.css('text-align', 'left');

        elem.addClass('sign_item');

        if(value !== undefined) {
            if(type == 'signature' || type == 'initial') {
                elem.data('signature', value);
                value = "<img src='" + value + "'/>";
            }
            else if(type == 'textarea')
                value = value.text.split('\n').join('<br/>');

            elem.append(value);
            elem.val(value);
        }
        else {
            if(type == 'signature')
                elem.append("Sign Here");
            else if(type == 'initial')
                elem.append("Mark");
        }

        elem.on('change', function(e) {
            self.check_pdf_items_completion(self.role);
            self.sign_item_navigator.html('<span class="helper"/>Next').focus();
        });

        if(required && (self.editMode || responsible <= 0 || responsible == self.role))
            elem.addClass('sign_item_required');
        if(self.pdfView || (self.role != responsible && responsible > 0))
            elem.addClass('sign_item_viewmode');

        elem.data('type', type).data('required', required).data('responsible', responsible).data('posx', posX).data('posy', posY).data('width', width).data('height', height);

        return elem;
    };

    this.enableCustom = function(elem) {
        var self = this;

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
                self.update_signature_element(elem);
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

            self.update_signature_element(elem);
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
    };

    this.scrollToSignItem = function(item) {
        var self = this;

        self.sign_item_navigator.detach();

        if(item != null) {
            self.iframe.contents().find('.sign_item_selected').removeClass('sign_item_selected');
            item.addClass('sign_item_selected').focus();

            $(self.iframe.contents().find('#viewerContainer')[0]).animate({
                scrollTop: item.offset().top - $(self.iframe.contents().find('#viewer')[0]).offset().top - $(self.iframe.contents().find('#viewerContainer')[0]).height()/4
            }, 500);

            self.sign_item_navigator.html('<span class="helper"/>' + {
                'signature': "Sign it",
                'initial': "Mark it",
                'text': "Fill in",
                'textarea': "Fill in",
                'date': "Time ?",
            }[item.data('type')]);

            self.sign_item_navigator.appendTo(item.parent()).css('top', item.position().top/item.parent().height()*100+'%'); // TODO would be nice to animate but impossible for now
            self.sign_item_navigator.data('parent', item.parent());
            self.sign_item_navigator.show();
        }
        else if(self.sign_item_navigator.data('parent'))
            self.sign_item_navigator.appendTo(self.sign_item_navigator.data('parent'));
    }

    this.updateFontSize = function() {
        var self = this;

        var size = $(self.iframe.contents().find('.page')[0]).height() / 75; // TODO
        self.iframe.contents().find('.sign_item').css('font-size', size + 'px');
        self.sign_item_navigator.css('font-size', size + 'px');
    };
}
