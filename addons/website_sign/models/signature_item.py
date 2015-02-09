# -*- coding: utf-8 -*-_
from openerp import models, api, fields

class signature_item(models.Model):
    _name = "signature.item"
    _description = "Signature Field For Document To Sign"

    signature_request = fields.Many2one('signature.request', required=True, ondelete='cascade')

    name = fields.Char(default="default_name")
    type = fields.Selection([
        ('signature', "Signature"),
        ('initial', "Initial"),
        ('text', "Text"),
        ('textarea', "Multiline Text"),
        ('date', "Date")
    ], required=True)

    required = fields.Boolean(required=True, default=True)
    responsible = fields.Many2one("signature.item.party")

    page = fields.Integer(string="Document Page", required=True, default=1)
    posX = fields.Float(digits=(4, 3), string="Position X", required=True)
    posY = fields.Float(digits=(4, 3), string="Position Y", required=True)
    width = fields.Float(digits=(4, 3), required=True)
    height = fields.Float(digits=(4, 3), required=True)

    value = fields.One2many('signature.item.value', 'signature_item', string="Signature Item Values") # Let's keep the possibility of multiple values

class signature_item_value(models.Model):
    _name = "signature.item.value"
    _description = "Signature Field Value For Document To Sign"
    
    signature_item = fields.Many2one('signature.item', required=True, ondelete='cascade')

    text_value = fields.Char()
    image_value = fields.Binary()

    @api.one
    def set(self, value):
        {
            'signature': self.setImage,
            'initial': self.setImage,
            'text': self.setText,
            'textarea' : self.setText,
            'date': self.setText,
        }[self.signature_item.type](value)

    @api.one
    def setText(self, value):
        self.text_value = value

    @api.one
    def setImage(self, value):
        self.image_value = value

class signature_item_party(models.Model):
    _name = "signature.item.party"
    _description = "Type of partner which can access a particular signature field"

    name = fields.Char(required=True)
