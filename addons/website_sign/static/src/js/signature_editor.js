
function update_page(canvas, pdf, pageNo, config) {
	if(!canvas || !pdf)
		return false;

	canvas.parent().find('.signature_item').detach();
	for(var i in config[pageNo])
		canvas.after(config[pageNo][i]);

	pdf.getPage(pageNo).then(function(page) {
		var scale = 1;
		var viewport = page.getViewport(scale);

		var context = canvas[0].getContext('2d');
		canvas.attr('width', viewport.width);
		canvas.attr('height', viewport.height);

		var renderContext = {
			canvasContext: context,
			viewport: viewport
		};
		page.render(renderContext);
	});

	return true;
}

function save_configuration_and_quit(id, config, url) {
	data = [];
	for(var page in config) {
		for(var i in config[page]) {
			data.push({
				'type': config[page][i].data('type'),
				'page': page,
				'posX': config[page][i].data('posX'),
				'posY': config[page][i].data('posY'),
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

$(document).ready(function() {
	// Specify the main script used to create a new PDF.JS web worker. 		TODO
	// In production, leave this undefined or change it to point to the
	// combined `pdf.worker.js` file.
	PDFJS.workerSrc = '/website_sign/static/lib/pdfjs/worker_loader.js';

	var signature_request_id = $('#input_signature_request_id').val();
	var attachment_location = $('#input_attachment_location').val();
	var canvas = $('#signature-editor canvas');;
	var pdf = false;
	var pageNo = 1;
	var currentFieldType = false;
	var configuration = {};

	PDFJS.getDocument(attachment_location).then(function(pdf_data) {
		pdf = pdf_data;
		update_page(canvas, pdf, pageNo, configuration);
		for(var i = 1 ; i <= pdf.numPages ; i++)
			configuration[i] = [];
	});

	// Save button
	button_save = $('#signature_fields_save');
	button_save.on('click', function(e) {
		e.preventDefault();
		save_configuration_and_quit(signature_request_id, configuration, button_save.attr('href'));
	});

	// Pages buttons
	button_before = $('#signature-editor #signature_page_before');
	button_after = $('#signature-editor #signature_page_after');

	button_before.prop('disabled', true);
	if(pdf.numPages == 1)
		button_after.prop('disabled', true);

	button_before.on('click', function(e){
		if(pageNo > 1) {
			pageNo--;
			if(pageNo == 1)
				button_before.prop('disabled', true);
			button_after.prop('disabled', false);
			update_page(canvas, pdf, pageNo, configuration);
		}
	});
	button_after.on('click', function(e){
		if(pageNo < pdf.numPages) {
			pageNo++;
			if(pageNo == pdf.numPages)
				button_after.prop('disabled', true);
			button_before.prop('disabled', false);
			update_page(canvas, pdf, pageNo, configuration);
		}
	});

	// Fields button
	field_type_buttons = $('#signature-editor .field_type_button');
	field_type_buttons.on('click', function(e) {
		field_type_buttons.removeClass('fa fa-check');

		checkedButton = $(e.currentTarget);
		checkedButton.addClass('fa fa-check');
		currentFieldType = checkedButton.attr('id').substr("signature_item_button_".length);
	})

	// Canvas actions
	canvas.on('dblclick', function(e) {
		var posX = (e.pageX - canvas.offset().left) / canvas.width();
		var posY = (e.pageY - canvas.offset().top) / canvas.height();

		var fx = canvas.width() / canvas.parent().width();
		var fy = canvas.height() / canvas.parent().height();

		var textElem = null;
		var WIDTH = 0.1, HEIGHT = 0.05;
		
		switch(currentFieldType)
		{
			case "text":
				textElem = $("<textarea/>");
				break;

			case "signature":

				break;
		}

		if(textElem !== null) {
			textElem.addClass('sign_item');
			textElem.css('left', (posX*fx-WIDTH/2)*100 + '%').css('top', (posY*fy-HEIGHT/2)*100 + '%');
			textElem.css('width', WIDTH*100 + '%').css('height', HEIGHT*100 + '%');
			textElem.data('type', currentFieldType).data('posX', posX).data('posY', posY).data('width', WIDTH).data('height', HEIGHT);
			//textElem.prop('disabled', true);

			textElem.on('dblclick', function(e) {
				var elem = $(e.currentTarget);
				elem.remove();
				console.log(configuration);
				for(var i in configuration[pageNo]) {
					if(configuration[pageNo][i].data('posX') == elem.data('posX')
						&& configuration[pageNo][i].data('posY') == elem.data('posY'))
						configuration[pageNo].splice(i, 1);
				}
			});

			configuration[pageNo].push(textElem);
			canvas.after(textElem);
		}
	});
});
