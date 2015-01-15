# -*- coding: utf-8 -*-
from openerp import http
from openerp.addons.website.models import website
from openerp.tools import DEFAULT_SERVER_DATE_FORMAT
import time
from openerp.addons.web.controllers.main import login_redirect
from openerp.tools.translate import _

class website_sign(http.Controller):

    def __message_post(self, message, thread_model, thread_id, type='comment', subtype=False, attachments=[]):
        http.request.session.body = message
        user = http.request.env.user
        msgid = False
        if 'body' in http.request.session and http.request.session.body:
            model = http.request.env[thread_model].with_context(notify_author=True)
            msgid = model.browse(thread_id).message_post(
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
    def request_sign(self, id, token=None, message=False, **post):
        if not http.request.session.uid:
            return login_redirect()

        current_sign = None
        ir_attachment_signature = http.request.env['ir.attachment.signature']

        if token:
            current_sign = ir_attachment_signature.search([('document_id', '=', id),('access_token', '=', token)], limit=1)
            if not current_sign:
                return http.request.render('website_sign.deleted_sign_request', {'url': '/sign/document/' + str(id)})

        signatures = ir_attachment_signature.search([('document_id', '=', id)])
        if not signatures:
            return http.request.not_found()

        req_count = [signs.id for signs in signatures if signs.state == 'draft']
        attachment =  http.request.env['ir.attachment'].browse(id)
        if token:
            record = http.request.env[attachment.res_model].sudo().browse(attachment.res_id)
        else:
            record = http.request.env[attachment.res_model].browse(attachment.res_id)

        values = {
            'attachment_id': id,
            'signatures': signatures,
            'current_sign': current_sign,
            'token': token,
            'attachment': attachment,
            'record': record,
            'sign_req': req_count,
            'message': message and int(message) or False
        }

        return http.request.render('website_sign.doc_sign', values)

    @http.route(['/website_sign/signed/<int:id>/<token>'], type='json', auth="user", website=True)
    def signed(self, id=None, token=None, sign=None, signer=None, **post):
        signature =  http.request.env['ir.attachment.signature'].search([('document_id', '=', id),('access_token', '=', token)], limit=1)
        signature.sign(signer, sign)

        attach = http.request.env['ir.attachment'].browse([id])
        message = _('Document <b>%s</b> signed by %s') % (attach.name, signer)
        self.__message_post(message, attach.res_model, attach.res_id, type='comment', subtype='mt_comment')

        return {'id': id, 'token': token}

    @http.route(['/website_sign/get_followers'], type='json', auth="user", website=True)
    def get_followers(self, attachment_id=None, res_model=None, res_id=None, **post):
        partner_id = http.request.env.user.partner_id.id
        followers = http.request.env['mail.followers'].sudo().search([('res_model', '=', res_model), ('res_id', '=', res_id)])
        signatures = http.request.env['ir.attachment.signature'].search([('document_id','=', attachment_id)])
        signers = map(lambda d: d.partner_id.id, signatures)

        res = []
        for follower in followers:
            if not partner_id == follower.partner_id.id:
                if follower.partner_id.id in signers:
                    res.append({'id': follower.partner_id.id, 'name': follower.partner_id.name, 'email': follower.partner_id.email, 'selected':'checked'})
                else:
                    res.append({'id': follower.partner_id.id, 'name': follower.partner_id.name, 'email': follower.partner_id.email, 'selected': None})
        
        return res

    @http.route(['/website_sign/set_signers'], type='json', auth="user", website=True)
    def set_signers(self, attachment_id=None, signer_ids=None, send_directly=False, **post):
        attach = http.request.env['ir.attachment'].browse([attachment_id])
        signers_in_common = attach.set_signers(signer_ids)[0]
        if signers_in_common != False and send_directly:
            if len(signer_ids) > 0:
                message = _("Signature request for document <b>%s</b> has been added/modified") % attach['name']
                msgid = self.__message_post(message, attach.res_model, attach.res_id, type='notification')
                http.request.env['mail.message'].browse([msgid]).send_signature_accesses(attachment_ids=[attachment_id], ignored_partners=signers_in_common)
            else:
                message = _("Signature request for document <b>%s</b> has been deleted") % attach['name']
                self.__message_post(message, attach.res_model, attach.res_id, type='notification')
                
        return True

    @http.route(['/sign/document/<int:id>/<token>/note'], type='http', auth="user", website=True)
    def post_note(self, id, token, **post):
        record = http.request.env['ir.attachment'].search([('id', '=', id)], limit=1)
        message = post.get('comment')
        if message:
            self.__message_post(message, record.res_model, record.res_id, type='comment', subtype='mt_comment')
        return http.request.redirect("/sign/document/%s/%s?message=1" % (id, token))
