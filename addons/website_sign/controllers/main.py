# -*- coding: utf-8 -*-
from openerp import http
from openerp.addons.website.models import website
from openerp.tools import DEFAULT_SERVER_DATE_FORMAT
import time
from openerp.addons.web.controllers.main import login_redirect
from openerp.tools.translate import _

class website_sign(http.Controller):
    @http.route([
        "/sign/document/<int:id>",
        "/sign/document/<int:id>/<token>"
    ], type='http', auth="public", website=True)
    def request_sign(self, id, token=None, message=False, **post):
        if not http.request.session.uid:
            return login_redirect()
        current_sign = None
        ir_attachment_signature = http.request.env['ir.attachment.signature']
        ir_attachment = http.request.env['ir.attachment']

        if token:
            current_sign =  ir_attachment_signature.search([('document_id', '=', id),('access_token', '=', token)], limit=1)
            if not current_sign:
                return http.request.render('website_sign.deleted_sign_request')

        # list out partners and their signatures who are requested to sign.
        signatures = ir_attachment_signature.search([('document_id', '=', id)])
        if not signatures:
            return http.request.not_found()
        req_count = [signs.id for signs in signatures if signs.state == 'draft']
        attachment =  ir_attachment.browse(id)
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

    @http.route(['/website_sign/signed'], type='json', auth="public", website=True)
    def signed(self, res_id=None, token=None, sign=None, signer=None, **post):
        ir_attachment_signature = http.request.env['ir.attachment.signature']
        signature_id =  ir_attachment_signature.search([('document_id', '=', int(res_id)),('access_token', '=', token)], limit=1)
        signature_id.write({'state': 'closed', 'signing_date': time.strftime(DEFAULT_SERVER_DATE_FORMAT), 'sign': sign, 'signer_name': signer})

        #send mail and notification in chatter about signed by user.
        model = http.request.env['ir.attachment'].search([('id', '=', int(res_id))], limit=1)
        message = _('Document <b>%s</b> signed by %s') % (model.name, signer)
        self.__message_post(message, model.res_model, model.res_id, type='comment', subtype='mt_comment')

        return True

    def __message_post(self, message, thread_model, thread_id, type='comment', subtype=False, attachments=[]):
        http.request.session.body = message
        user = http.request.env.user
        if 'body' in http.request.session and http.request.session.body:
            if hasattr(self, 'signers_data') and self.signers_data:
                model = http.request.env[thread_model].with_context(notify_author=True,signers_data=self.signers_data)
            else:
                model = http.request.env[thread_model].with_context(notify_author=True)
            model.browse(thread_id).message_post(
                body=http.request.session.body,
                type=type,
                subtype=subtype,
                author_id=user.partner_id.id,
                partner_ids=[user.partner_id.id],
            )
            http.request.session.body = False
            self.signers_data = None
        return True

    @http.route(['/website_sign/get_followers'], type='json', auth="public", website=True)
    def get_followers(self, thread_id=None, attachment_id=None, model=None, **post):
        partner_id = http.request.env.user.partner_id.id

        followers = http.request.env['mail.followers'].sudo().search([('res_model', '=', model), ('res_id', 'in', [thread_id])])

        # get already selected signers
        sel_fol_obj = http.request.env['ir.attachment.signature']
        sel_follower = sel_fol_obj.search([('document_id','=', attachment_id)])
        sel_fol_ids = map(lambda d: d.partner_id.id, sel_follower)

        res = []
        followers_data = {}
        for follower in followers:
            if not partner_id == follower.partner_id.id:
                if follower.partner_id.id in sel_fol_ids:
                    res.append({'followers_id': follower.partner_id.id, 'name': follower.partner_id.name, 'email': follower.partner_id.email, 'selected':'checked'})
                else:
                    res.append({'followers_id': follower.partner_id.id, 'name': follower.partner_id.name, 'email': follower.partner_id.email, 'selected': None})
        followers_data['signer_data'] = res

        #get title and comments of attachment
        doc_data = http.request.env['ir.attachment'].search([('id','=', attachment_id)], limit=1)
        followers_data['doc_data'] = {}
        followers_data['doc_data']['name'] = doc_data.name
        followers_data['doc_data']['desc'] = doc_data.description

        return followers_data

    @http.route(['/website_sign/set_signer'], type='json', auth="public", website=True)
    def set_signer(self, attachment_id=None, signer_id=None, title=None, comments=None, send_directly=False, **post):
        ir_attachment_signature = http.request.env['ir.attachment.signature']
        vals, att_vals = {}, {}

        old_signers = ir_attachment_signature.search([('document_id','=', attachment_id)])
        old_signers_ids = map(lambda d: d['partner_id']['id'], old_signers)
        old_ids = map(lambda d: d['id'], old_signers)

        attach_data = http.request.env['ir.attachment'].search([('id','=', attachment_id)], limit=1)
        if attach_data['name'] != title:
            att_vals['name'] =  title
        if attach_data['description'] != comments:
            att_vals['description'] = comments

        if att_vals:
            http.request.env['ir.attachment'].browse(attachment_id).write(att_vals)

        if not set(signer_id) == set(old_signers_ids):
            ir_attachment_signature.browse(old_ids).unlink()

            for signer in signer_id:
                vals['partner_id'] = signer
                vals['document_id'] = attachment_id
                vals['state'] = 'draft'
                vals['date'] = time.strftime(DEFAULT_SERVER_DATE_FORMAT)
                ir_attachment_signature.create(vals)

            if send_directly:
                if len(signer_id) > 0:
                    self.signers_data = self.get_signer([attachment_id])
                    message = _("New sign request for document <b>{}</b>").format(title)
                    self.__message_post(message, attach_data['res_model'], attach_data['res_id'], type='notification', subtype='mt_comment')
                else:
                    message = _("Sign request for document <b>{}</b> has been deleted").format(title)
                    self.__message_post(message, attach_data['res_model'], attach_data['res_id'], type='notification')

        return True

    @http.route(['/website_sign/get_signer'], type='json', auth="public", website=True)
    def get_signer(self, attachment_ids=None, **post):
        ir_attachment_signature = http.request.env['ir.attachment.signature']
        signers = ir_attachment_signature.search([('document_id', 'in', attachment_ids)])
        signer_ids = map(lambda d: d.partner_id.id, signers)

        signers_data = {}
        for sign_id in signer_ids:
            signers_data[sign_id] = []
            for doc in signers:
                if sign_id == doc.partner_id.id:
                    signers_data[sign_id].append({'id': doc.document_id.id,'name': doc.document_id.name, 'token': doc.access_token, 'fname': doc.document_id.datas_fname})
        return signers_data

    @http.route(['/sign/document/<int:id>/<token>/note'], type='http', auth="public", website=True)
    def post_note(self, id, token, **post):
        record = http.request.env['ir.attachment'].search([('id', '=', id)], limit=1)
        message = post.get('comment')
        if message:
            self.__message_post(message, record.res_model, record.res_id, type='comment', subtype='mt_comment')
        return http.request.redirect("/sign/document/%s/%s?message=1" % (id, token))
