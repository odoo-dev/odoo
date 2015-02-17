# -*- coding: utf-8 -*-_
from openerp import models, fields, api, _

# FP: lots of fields are missing string="label of field"
# FP: I would reorganize models in two .py files: template & document

# FP: do we need this?
class signature_item_type(models.Model):
    _name = "signature.item.type"
    _description = "Specialized type for signature fields"

    name = fields.Char(required=True)
    type = fields.Selection([
        ('signature', "Signature"),
        ('initial', "Initial"),
        ('text', "Text"),
        ('textarea', "Multiline Text"),
    ], required=True, default='text')

    @api.onchange('name')
    def _default_tip(self):
        self.tip = (str(self.name) + " ?")

    @api.onchange('name', 'auto_field')
    def _default_placeholder(self):
        self.placeholder = ("Your " + str(self.name) if self.auto_field else "")

    tip = fields.Char(required=True, default="Fill")
    placeholder = fields.Char()

    default_width = fields.Float(digits=(4, 3), required=True, default=0.200)
    default_height = fields.Float(digits=(4, 3), required=True, default=0.020)
    auto_field = fields.Char()

class signature_item_party(models.Model):
    _name = "signature.item.party"
    _description = "Signature Role"
    name = fields.Char(required=True)

class signature_item(models.Model):
    _name = "signature.item"
    _description = "Signature Field For Document To Sign"

    # FP: Why is this readonly? I would rename to template_id
    signature_request_template = fields.Many2one('signature.request.template', string="Document Template", required=True, readonly=True, ondelete='cascade')

    # FP: why such a name, do we need it? --> _rec_name = 'type'
    name = fields.Char(default="default_name")

    # FP: Why not a selection directly? See above remark.
    type = fields.Many2one('signature.item.type', required=True, ondelete='cascade')

    required = fields.Boolean(default=True)
    responsible = fields.Many2one("signature.item.party")

    page = fields.Integer(string="Document Page", required=True, default=1)
    posX = fields.Float(digits=(4, 3), string="Position X", required=True)
    posY = fields.Float(digits=(4, 3), string="Position Y", required=True)

    # FP: Do we need this? Isn't it defined by the signature.item.type?
    width = fields.Float(digits=(4, 3), required=True)
    height = fields.Float(digits=(4, 3), required=True)

    # FP: I don't think we need this: as it mixes several documents, its strange
    # FP: But we do need a Many2one on signature.item.value to this object per document to sign
    values = fields.One2many('signature.item.value', 'signature_item', string="Signature Item Values")

    @api.multi
    def getByPage(self):
        # FP: the same in one line: return map(lambda x: (x.page, x), self)
        items = {};
        for item in self:
            if item.page not in items:
                items[item.page] = []
            items[item.page].append(item)
        return items

    # FP: this method should probably be removed (and fields from a document
    # FP: should be accessed from the document, not the templaet.
    @api.multi
    def valueFor(self, signature_request_id):
        value = self[0].values.filtered(lambda v: v.signature_request.id == signature_request_id)
        if len(value) <= 0:
            return ""
        else:
            return value[0].value

class signature_item_value(models.Model):
    _name = "signature.item.value"
    _description = "Signature Field Value For Document To Sign"
    
    signature_item = fields.Many2one('signature.item', required=True, ondelete='cascade')
    signature_request = fields.Many2one('signature.request', required=True, ondelete='cascade')

    value = fields.Text()

    # FP: can we remove this? It's probably better to call sucha  method from
    # FP: the document, and not this object
    @api.multi
    def resetFor(self, signature_request_id):
        self.filtered(lambda v: v.signature_request.id == signature_request_id).write({'value': None})

