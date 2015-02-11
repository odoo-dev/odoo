# -*- coding: utf-8 -*-
from openerp.addons.website.models import website
from openerp.tools import DEFAULT_SERVER_DATE_FORMAT
import time
from openerp.addons.web.controllers.main import login_redirect, content_disposition
import mimetypes

from openerp import http, _
import base64, os

class website_sign(http.Controller):

    def __message_post(self, message, thread_model, thread_id, type='comment', subtype=False, attachments=[]):
        if not (thread_model and thread_id):
            return False # TODO

        http.request.session.body = message
        user = http.request.env.user
        msgid = False
        if 'body' in http.request.session and http.request.session.body:
            model = http.request.env[thread_model].with_context(notify_author=True)
            try: # If only sudo, notes will be sent by mails by 'Administrator'
                msgid = model.browse(thread_id).message_post(
                    body=http.request.session.body,
                    type=type,
                    subtype=subtype,
                    author_id=user.partner_id.id,
                    partner_ids=[user.partner_id.id],
                )
            except:
                msgid = model.sudo().browse(thread_id).message_post(
                    body=http.request.session.body,
                    type=type,
                    subtype=subtype,
                    author_id=user.partner_id.id,
                    partner_ids=[user.partner_id.id],
                )
            http.request.session.body = False
        return msgid

    @http.route([
        "/sign/document/<int:id>",
        "/sign/document/<int:id>/<token>"
    ], type='http', auth="user", website=True)
    def request_sign(self, id, token=None, message=False, viewmode=False, **post):
        signature_request = http.request.env['signature.request'].sudo().search([('id', '=', id)]) # TODO browse return a record (empty) even if it does not exist! normal?
        if not signature_request:
            return http.request.not_found()

        current_request_item = None
        if token:
            current_request_item = signature_request.request_items.filtered(lambda r: r.access_token == token)
            if not current_request_item:
                return http.request.render('website_sign.deleted_sign_request', {'url': '/sign/document/' + str(id)})

            if signature_request.attachment.res_model and signature_request.attachment.res_id:
                record = http.request.env[signature_request.attachment.res_model].sudo().browse(signature_request.attachment.res_id)
            else:
                record = False
        else:
            if signature_request.attachment.res_model and signature_request.attachment.res_id:
                record = http.request.env[signature_request.attachment.res_model].browse(signature_request.attachment.res_id)
            else:
                record = False

        values = {
            'signature_request': signature_request,
            'current_request_item': current_request_item,
            'readonly': not (current_request_item and current_request_item.state == 'opened'),
            'token': token,
            'messages': record.message_ids if record else [],
            'message': message and int(message) or False,
            'hasItems': len(signature_request.signature_items) > 0,
            'role': current_request_item.role.id if current_request_item else 0,
            'viewmode': viewmode and bool(viewmode) or False
        }

        return http.request.render('website_sign.doc_sign', values)

    @http.route(['/website_sign/signed/<int:id>/<token>'], type='json', auth="user", website=True)
    def signed(self, id=None, token=None, sign=None, signer=None, **post):
        request_item = http.request.env['signature.request.item'].search([('signature_request', '=', id), ('access_token', '=', token)], limit=1)
        if request_item:
            if request_item.sudo().sign(signer, sign):
                attach = http.request.env['signature.request'].sudo().browse(id).attachment
                message = _('Document <b>%s</b> signed by %s') % (attach.name, signer)
                self.__message_post(message, attach.res_model, attach.res_id, type='comment', subtype='mt_comment')

        return {'id': id, 'token': token}

    @http.route(['/website_sign/get_followers'], type='json', auth="user", website=True)
    def get_followers(self, attachment_id=None, res_model=None, res_id=None, **post):
        current_id = http.request.env.user.partner_id.id
        followers = http.request.env['mail.followers'].sudo().search([('res_model', '=', res_model), ('res_id', '=', res_id)])
        request_items = http.request.env['signature.request'].search([('attachment','=', attachment_id)], limit=1).request_items
        signers = map(lambda d: d.partner_id.id, request_items)

        res = []
        for follower in followers:
            if current_id == follower.partner_id.id:
                continue
            res.append({
                'id': follower.partner_id.id,
                'name': follower.partner_id.name,
                'email': follower.partner_id.email,
                'selected': 'checked' if follower.partner_id.id in signers else None
            })
        
        return res

    @http.route(['/website_sign/set_signers'], type='json', auth="user", website=True)
    def set_signers(self, attachment_id=None, signer_ids=None, message=None, **post):
        signature_request = http.request.env['signature.request'].search([('attachment', '=', attachment_id)])
        if not signature_request:
            signature_request = http.request.env['signature.request'].create({'attachment': attachment_id, 'message': message})
        signers_in_common = signature_request.set_signers(signer_ids)[0]
        
        # if signers_in_common != False and send_directly:
        #     attach = http.request.env['ir.attachment'].browse(attachment_id)
        #     if len(signer_ids) > 0:
        #         message = _("Signature request for document <b>%s</b> has been added/modified") % attach['name']
        #         self.__message_post(message, attach.res_model, attach.res_id, type='notification')
        #         signature_request.send_signature_accesses(message, ignored_partners=signers_in_common)
        #     else:
        #         message = _("Signature request for document <b>%s</b> has been deleted") % attach['name']
        #         self.__message_post(message, attach.res_model, attach.res_id, type='notification')
                
        return True

    @http.route(['/sign/document/<int:id>/<token>/note'], type='http', auth="user", website=True)
    def post_note(self, id, token, **post):
        attach = http.request.env['signature.request'].browse(id).attachment
        message = post.get('comment')
        if message:
            self.__message_post(message, attach.res_model, attach.res_id, type='comment', subtype='mt_comment')
        return http.request.redirect("/sign/document/%s/%s?message=1" % (id, token))

    @http.route(['/custom/document/<int:id>'], type="http", auth="user", website=True)
    def custom_document(self, id, **post):
        signature_request = http.request.env['signature.request'].browse(id)
        if not signature_request:
            http.request.not_found()

        values = {
            'signature_request': signature_request,
            'signature_item_parties': http.request.env['signature.item.party'].search([])
        }
        return http.request.render('website_sign.items_edit', values)

    @http.route(['/website_sign/set_signature_items/<int:id>'], type='json', auth='user', website=True)
    def set_signature_items(self, id, signature_items=None, **post):
        signature_item_obj = http.request.env['signature.item']
        signature_item_obj.search([('signature_request', '=', id)]).unlink(); # TODO maybe not delete not new ones and just update
        for item in signature_items:
            item.update({
                'signature_request': id,
            })
            signature_item_obj.create(item)
        return True

    @http.route(['/website_sign/get_fonts'], type='json', auth='user', website=True)
    def get_fonts(self, **post):
        fonts = []

        fonts_directory = os.path.dirname(os.path.abspath(__file__)) + '/../static/src/font'
        font_filenames = os.listdir(fonts_directory)

        for filename in font_filenames:
            font_file = open(fonts_directory + '/' + filename, 'r')
            font = base64.b64encode(font_file.read())
            fonts.append([filename[:-4], font])

        return fonts

    @http.route(['/website_sign/download/<int:id>/<type>'], type='http', auth='user', website=True)
    def download_completed_document(self, id, type=None, **post):
        signature_request = http.request.env['signature.request'].browse(id)
        document = None
        if type == "origin":
            document = signature_request.attachment.datas
        elif type == "completed":
            document = signature_request.completed_document

        if not document:
            return http.request.not_found()

        filecontent = base64.b64decode(document)
        filename = signature_request.attachment.name
        if filename != signature_request.attachment.datas_fname:
            filename += signature_request.attachment.datas_fname[signature_request.attachment.datas_fname.rfind('.'):]
        content_type = mimetypes.guess_type(filename)
        return http.request.make_response(
            filecontent,
            headers = [
                ('Content-Type', content_type[0] or 'application/octet-stream'),
                ('Content-Disposition', content_disposition(filename))
            ]
        )
