# -*- coding: utf-8 -*-

from openerp import SUPERUSER_ID
from openerp.addons.web import http
from openerp.addons.web.http import request
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
        if not request.session.uid:
            return login_redirect()
        current_sign = None
        ir_attachment_signature = request.registry.get('ir.attachment.signature')
        ir_attachment = request.registry.get('ir.attachment')

        if token:
            signature_id =  ir_attachment_signature.search(request.cr, request.uid,[('document_id', '=', id),('access_token', '=', token)], context=request.context)
            if not signature_id:
                return request.website.render('website.404')
            current_sign = ir_attachment_signature.browse(request.cr, request.uid, signature_id[0])

        # list out partners and their signatures who are requested to sign.
        request_sign = ir_attachment_signature.search(request.cr, request.uid,[('document_id', '=', id)], context=request.context)
        signatures = ir_attachment_signature.browse(request.cr, SUPERUSER_ID, request_sign)
        req_count = [signs.id for signs in signatures if signs.state == 'draft']
        attachment =  ir_attachment.browse(request.cr, SUPERUSER_ID, id)
        record = request.registry.get(attachment.res_model).browse(request.cr, token and SUPERUSER_ID or request.uid, attachment.res_id)

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

        return request.website.render('website_sign.doc_sign', values)

    @http.route(['/website_sign/signed'], type='json', auth="public", website=True)
    def signed(self, res_id=None, token=None, sign=None, signer=None, **post):
        ir_attachment_signature = request.registry.get('ir.attachment.signature')
        signature_id =  ir_attachment_signature.search(request.cr, request.uid,[('document_id', '=', int(res_id)),('access_token', '=', token)], context=request.context)
        ir_attachment_signature.write(request.cr, request.uid, signature_id[0], {'state': 'closed', 'signing_date': time.strftime(DEFAULT_SERVER_DATE_FORMAT), 'sign': sign, 'signer_name': signer}, context=request.context)

        #send mail and notification in chatter about signed by user.
        model = request.registry.get('ir.attachment').search_read(request.cr, request.uid, [('id', '=', int(res_id))], ['res_model', 'res_id', 'name'], context=request.context)[0]
        thread_model = model['res_model']
        thread_id = model['res_id']
        message = _('Document <b>%s</b> signed by %s') % (model['name'], signer)
        self.__message_post(message, thread_model, thread_id, type='comment', subtype='mt_comment')

        return True

    def __message_post(self, message, thread_model, thread_id, type='comment', subtype=False, attachments=[]):
        request.session.body =  message
        cr, uid, context = request.cr, request.uid, request.context
        user = request.registry['res.users'].browse(cr, SUPERUSER_ID, uid, context=context)
        if 'body' in request.session and request.session.body:
            context.update({'notify_author': True})
            request.registry.get(thread_model).message_post(cr, SUPERUSER_ID, thread_id,
                    body=request.session.body,
                    type=type,
                    subtype=subtype,
                    author_id=user.partner_id.id,
                    partner_ids=[user.partner_id.id],
                    context=context,
                )
            request.session.body = False
        return True

    @http.route(['/website_sign/get_followers'], type='json', auth="public", website=True)
    def get_followers(self, thread_id=None, attachment_id=None, model=None, **post):
        partner_id = (request.registry.get('res.users').browse(request.cr, request.uid, request.uid)).partner_id.id

        fol_obj = request.registry.get('mail.followers')
        fol_ids = fol_obj.search(request.cr, SUPERUSER_ID, [('res_model', '=', model), ('res_id', 'in', [thread_id])])

        # get already selected signers
        sel_fol_obj = request.registry.get('ir.attachment.signature')
        sel_follower = sel_fol_obj.search_read(request.cr, SUPERUSER_ID,[('document_id','=', attachment_id)],['partner_id'], context=request.context)
        sel_fol_ids = map(lambda d: d['partner_id'][0], sel_follower)

        res = []
        followers_data = {}
        for follower in fol_obj.browse(request.cr, SUPERUSER_ID, fol_ids):
            if not partner_id == follower.partner_id.id:
                if follower.partner_id.id in sel_fol_ids:
                    res.append({'followers_id': follower.partner_id.id, 'name': follower.partner_id.name, 'email': follower.partner_id.email, 'selected':'checked'})
                else:
                    res.append({'followers_id': follower.partner_id.id, 'name': follower.partner_id.name, 'email': follower.partner_id.email, 'selected': None})
        followers_data['signer_data'] = res

        #get title and comments of attachment
        doc_data = request.registry.get('ir.attachment').search_read(request.cr, SUPERUSER_ID,[('id','=', attachment_id)],['name','description'], context=request.context)
        followers_data['doc_data'] = doc_data

        return followers_data

    @http.route(['/website_sign/set_signer'], type='json', auth="public", website=True)
    def set_signer(self, attachment_id=None, signer_id=None, title=None, comments=None, **post):
        ir_attachment_signature = request.registry.get('ir.attachment.signature')
        vals, att_vals = {}, {}

        set_fol = ir_attachment_signature.search_read(request.cr, SUPERUSER_ID,[('document_id','=', attachment_id)],['partner_id'], context=request.context)
        set_fol_ids = map(lambda d: d['partner_id'][0], set_fol)

        attach_data = request.registry.get('ir.attachment').search_read(request.cr, SUPERUSER_ID,[('id','=', attachment_id)],['name','description'], context=request.context)[0]
        if attach_data['name'] != title:
            att_vals['name'] =  title
        if attach_data['description'] != comments:
            att_vals['description'] = comments

        if att_vals:
            request.registry.get('ir.attachment').write(request.cr, request.uid, attachment_id, att_vals, context=request.context)

        if not set(signer_id) == set(set_fol_ids):
            for partner in set_fol_ids:
                for doc_id in set_fol:
                    if doc_id['partner_id'][0] == partner:
                        ir_attachment_signature.unlink(request.cr, SUPERUSER_ID, [doc_id['id']], context=request.context)

            for signer in signer_id:
                vals['partner_id'] = signer
                vals['document_id'] = attachment_id
                vals['state'] = 'draft'
                vals['date'] = time.strftime(DEFAULT_SERVER_DATE_FORMAT)
                ir_attachment_signature.create(request.cr, request.uid, vals, context=request.context)

        return True

    @http.route(['/website_sign/get_signer'], type='json', auth="public", website=True)
    def get_signer(self, attachment_ids=None, **post):
        ir_attachment_signature = request.registry.get('ir.attachment.signature')
        signer_obj = ir_attachment_signature.search(request.cr, request.uid, [('document_id', 'in', attachment_ids)], context=request.context)
        signers = ir_attachment_signature.browse(request.cr, SUPERUSER_ID, signer_obj)
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
        record = request.registry.get('ir.attachment').search_read(request.cr, request.uid,[('id', '=', id)], ['res_id', 'res_model'], context=request.context)[0]
        message = post.get('comment')

        if message:
            self.__message_post(message, record['res_model'], record['res_id'], type='comment', subtype='mt_comment')
        return request.redirect("/sign/document/%s/%s?message=1" % (id, token))
