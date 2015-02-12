# -*- coding: utf-8 -*-_
from openerp import models, fields, api, _

class signature_item(models.Model):
    _name = "signature.item"
    _description = "Signature Field For Document To Sign"

    signature_request = fields.Many2one('signature.request', required=True, readonly=True, ondelete='cascade')

    name = fields.Char(default="default_name")
    type = fields.Many2one('signature.item.type', required=True)

    required = fields.Boolean(default=True)
    responsible = fields.Many2one("signature.item.party")

    page = fields.Integer(string="Document Page", required=True, default=1)
    posX = fields.Float(digits=(4, 3), string="Position X", required=True)
    posY = fields.Float(digits=(4, 3), string="Position Y", required=True)
    width = fields.Float(digits=(4, 3), required=True)
    height = fields.Float(digits=(4, 3), required=True)

    value = fields.One2many('signature.item.value', 'signature_item', string="Signature Item Values")

    @api.multi
    def getByPage(self):
        items = {};
        for item in self:
            if item.page not in items:
                items[item.page] = []
            items[item.page].append(item)
        return items

class signature_item_type(models.Model):
    _name = "signature.item.type"
    _description = "Specialized type for signature fields"

    name = fields.Char(required=True)
    tip = fields.Char(required=True, default="Fill")
    type = fields.Selection([
        ('signature', "Signature"),
        ('initial', "Initial"),
        ('text', "Text"),
        ('textarea', "Multiline Text"),
    ], required=True)

    default_width = fields.Float(digits=(4, 3), required=True, default=0.200)
    default_height = fields.Float(digits=(4, 3), required=True, default=0.020)
    auto_field = fields.Char()

class signature_item_value(models.Model):
    _name = "signature.item.value"
    _description = "Signature Field Value For Document To Sign"
    
    signature_item = fields.Many2one('signature.item', required=True, ondelete='cascade')
    value = fields.Text()

class signature_item_party(models.Model):
    _name = "signature.item.party"
    _description = "Type of partner which can access a particular signature field"

    name = fields.Char(required=True)
