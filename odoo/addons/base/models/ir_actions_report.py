# Part of Odoo. See LICENSE file for full copyright and licensing details.
import io
import json
import logging
from ast import literal_eval
from collections import OrderedDict

from PIL import Image, ImageFile

from odoo import api, fields, models, modules, _
from odoo.exceptions import UserError, AccessError, RedirectWarning, ValidationError
from odoo.fields import Domain
from odoo.tools import config, is_html_empty
from odoo.tools.barcode import check_barcode_encoding, createBarcodeDrawing, get_barcode_font
from odoo.tools.safe_eval import safe_eval, time

# Allow truncated images
ImageFile.LOAD_TRUNCATED_IMAGES = True

_logger = logging.getLogger(__name__)


class IrActionsReport(models.Model):
    _name = 'ir.actions.report'
    _description = 'Report Action'
    _inherit = ['ir.actions.actions']
    _table = 'ir_act_report_xml'
    _order = 'name, id'
    _allow_sudo_commands = False

    type = fields.Char(default='ir.actions.report')
    binding_type = fields.Selection(default='report')
    model = fields.Char(required=True, string='Model Name')
    model_id = fields.Many2one('ir.model', string='Model', compute='_compute_model_id', search='_search_model_id')

    report_type = fields.Selection([
        ('qweb-html', 'HTML'),
        ('qweb-text', 'Text'),
    ], required=True, default='qweb-html',
    help='The type of the report that will be rendered, each one having its own'
        ' rendering method. HTML means the report will be opened directly in your'
        ' browser and Text means the report will be downloaded as a text file.')
    report_name = fields.Char(string='Template Name', required=True)
    report_file = fields.Char(string='Report File', required=False, readonly=False, store=True,
                              help="The path to the main report file (depending on Report Type) or empty if the content is in another field")
    group_ids = fields.Many2many('res.groups', 'res_groups_report_rel', 'uid', 'gid', string='Groups')
    multi = fields.Boolean(string='On Multiple Doc.', help="If set to true, the action will not be displayed on the right toolbar of a form view.")

    paperformat_id = fields.Many2one('report.paperformat', 'Paper Format', index='btree_not_null')
    print_report_name = fields.Char('Printed Report Name', translate=True,
                                    help="This is the filename of the report going to download. Keep empty to not change the report filename. You can use a python expression with the 'object' and 'time' variables.")
    attachment_use = fields.Boolean(string='Reload from Attachment',
                                    help='If enabled, then the second time the user prints with same attachment name, it returns the previous report.')
    attachment = fields.Char(string='Save as Attachment Prefix',
                             help='This is the filename of the attachment used to store the printing result. Keep empty to not save the printed reports. You can use a python expression with the object and time variables.')
    domain = fields.Char(string='Filter domain', help='If set, the action will only appear on records that matches the domain.')

    @api.depends('model')
    def _compute_model_id(self):
        for action in self:
            action.model_id = self.env['ir.model']._get(action.model).id

    def _search_model_id(self, operator, value):
        if Domain.is_negative_operator(operator):
            return NotImplemented
        models = self.env['ir.model']
        if isinstance(value, str):
            models = models.search(Domain('display_name', operator, value))
        elif isinstance(value, Domain):
            models = models.search(value)
        elif operator == 'any!':
            models = models.sudo().search(Domain('id', operator, value))
        elif operator == 'any' or isinstance(value, int):
            models = models.search(Domain('id', operator, value))
        elif operator == 'in':
            models = models.search(Domain.OR(
                Domain('id' if isinstance(v, int) else 'display_name', operator, v)
                for v in value
                if v
            ))
        return Domain('model', 'in', models.mapped('model'))

    def _get_readable_fields(self):
        return super()._get_readable_fields() | {
            "report_name", "report_type", "target",
            # these two are not real fields of ir.actions.report but are
            # expected in the route /report/<converter>/<reportname> and must
            # not be removed by clean_action
            "context", "data",
            # and this one is used by the frontend later on.
            "close_on_report_download",
            "domain",
        }

    def associated_view(self):
        """Used in the ir.actions.report form view in order to search naively after the view(s)
        used in the rendering.
        """
        self.ensure_one()
        action_ref = self.env.ref('base.action_ui_view')
        if not action_ref or len(self.report_name.split('.')) < 2:
            return False
        action_data = action_ref.read()[0]
        action_data['domain'] = [('name', 'ilike', self.report_name.split('.')[1]), ('type', '=', 'qweb')]
        return action_data

    def create_action(self):
        """ Create a contextual action for each report. """
        for report in self:
            model = self.env['ir.model']._get(report.model)
            report.write({'binding_model_id': model.id, 'binding_type': 'report'})
        return True

    def unlink_action(self):
        """ Remove the contextual actions created for the reports. """
        self.check_access('write')
        self.filtered('binding_model_id').write({'binding_model_id': False})
        return True

    #--------------------------------------------------------------------------
    # Main report methods
    #--------------------------------------------------------------------------

    def retrieve_attachment(self, record):
        '''Retrieve an attachment for a specific record.

        :param record: The record owning of the attachment.
        :return: A recordset of length <=1 or None
        '''
        attachment_name = safe_eval(self.attachment, {'object': record, 'time': time}) if self.attachment else ''
        if not attachment_name:
            return None
        return self.env['ir.attachment'].search([
                ('name', '=', attachment_name),
                ('res_model', '=', self.model),
                ('res_id', '=', record.id)
        ], limit=1)

    def get_paperformat(self):
        return self.paperformat_id or self.env.company.paperformat_id

    def get_paperformat_by_xmlid(self, xml_id):
        return self.env.ref(xml_id).get_paperformat() if xml_id else self.env.company.paperformat_id

    def _get_layout(self):
        return self.env.ref('web.minimal_layout', raise_if_not_found=False)

    def _get_report_url(self, layout=None):
        report_url = self.env['ir.config_parameter'].sudo().get_param('report.url')
        return report_url or (layout or self._get_layout() or self).get_base_url()

    @api.model
    def _get_report_from_name(self, report_name):
        """Get the first record of ir.actions.report having the ``report_name`` as value for
        the field report_name.
        """
        report_obj = self.env['ir.actions.report']
        conditions = [('report_name', '=', report_name)]
        context = self.env['res.users'].context_get()
        return report_obj.with_context(context).sudo().search(conditions, limit=1)

    @api.model
    def _get_report(self, report_ref):
        """Get the report (with sudo) from a reference

        :param report_ref: can be one of

            - ir.actions.report id
            - ir.actions.report record
            - ir.model.data reference to ir.actions.report
            - ir.actions.report report_name
        """
        ReportSudo = self.env['ir.actions.report'].sudo()
        if isinstance(report_ref, int):
            return ReportSudo.browse(report_ref)
        if isinstance(report_ref, models.Model):
            if report_ref._name != self._name:
                raise ValueError("Expected report of type %s, got %s" % (self._name, report_ref._name))
            return report_ref.sudo()
        report = ReportSudo.search([('report_name', '=', report_ref)], limit=1)
        if report:
            return report
        report = self.env.ref(report_ref)
        if report:
            if report._name != "ir.actions.report":
                raise ValueError("Fetching report %r: type %s, expected ir.actions.report" % (report_ref, report._name))
            return report.sudo()
        raise ValueError("Fetching report %r: report not found" % report_ref)

    @api.model
    def barcode(self, barcode_type, value, **kwargs):
        defaults = {
            'width': (600, int),
            'height': (100, int),
            'humanreadable': (False, lambda x: bool(int(x))),
            'quiet': (True, lambda x: bool(int(x))),
            'mask': (None, lambda x: x),
            'barBorder': (4, int),
            # The QR code can have different layouts depending on the Error Correction Level
            # See: https://en.wikipedia.org/wiki/QR_code#Error_correction
            # Level 'L' – up to 7% damage   (default)
            # Level 'M' – up to 15% damage  (i.e. required by l10n_ch QR bill)
            # Level 'Q' – up to 25% damage
            # Level 'H' – up to 30% damage
            'barLevel': ('L', lambda x: x in ('L', 'M', 'Q', 'H') and x or 'L'),
        }
        kwargs = {k: validator(kwargs.get(k, v)) for k, (v, validator) in defaults.items()}
        kwargs['humanReadable'] = kwargs.pop('humanreadable')
        if kwargs['humanReadable']:
            kwargs['fontName'] = get_barcode_font()

        if kwargs['width'] * kwargs['height'] > 1200000 or max(kwargs['width'], kwargs['height']) > 10000:
            raise ValueError("Barcode too large")

        if barcode_type == 'UPCA' and len(value) in (11, 12, 13):
            barcode_type = 'EAN13'
            if len(value) in (11, 12):
                value = '0%s' % value
        elif barcode_type == 'auto':
            symbology_guess = {8: 'EAN8', 13: 'EAN13'}
            barcode_type = symbology_guess.get(len(value), 'Code128')
        elif barcode_type == 'QR':
            # for `QR` type, `quiet` is not supported. And is simply ignored.
            # But we can use `barBorder` to get a similar behaviour.
            # quiet=True & barBorder=4 by default cf above, remove border only if quiet=False
            if not kwargs['quiet']:
                kwargs['barBorder'] = 0

        if barcode_type in ('EAN8', 'EAN13') and not check_barcode_encoding(value, barcode_type):
            # If the barcode does not respect the encoding specifications, convert its type into Code128.
            # Otherwise, the report-lab method may return a barcode different from its value. For instance,
            # if the barcode type is EAN-8 and the value 11111111, the report-lab method will take the first
            # seven digits and will compute the check digit, which gives: 11111115 -> the barcode does not
            # match the expected value.
            barcode_type = 'Code128'

        try:
            barcode = createBarcodeDrawing(barcode_type, value=value, format='png', **kwargs)

            # If a mask is asked and it is available, call its function to
            # post-process the generated QR-code image
            if kwargs['mask']:
                available_masks = self.get_available_barcode_masks()
                mask_to_apply = available_masks.get(kwargs['mask'])
                if mask_to_apply:
                    mask_to_apply(kwargs['width'], kwargs['height'], barcode)

            return barcode.asString('png')
        except (ValueError, AttributeError):
            if barcode_type == 'Code128':
                raise ValueError("Cannot convert into barcode.")
            elif barcode_type == 'QR':
                raise ValueError("Cannot convert into QR code.")
            else:
                return self.barcode('Code128', value, **kwargs)

    @api.model
    def get_available_barcode_masks(self):
        """ Hook for extension.

        This function returns the available QR-code masks, in the form of a
        list of (code, mask_function) elements, where code is a string identifying
        the mask uniquely, and mask_function is a function returning a reportlab
        Drawing object with the result of the mask, and taking as parameters:

            - width of the QR-code, in pixels
            - height of the QR-code, in pixels
            - reportlab Drawing object containing the barcode to apply the mask on
        """
        return {}

    def _render_template(self, template, values=None):
        """Allow to render a QWeb template python-side. This function returns the 'ir.ui.view'
        render but embellish it with some variables/methods used in reports.
        :param values: additional methods/variables used in the rendering
        :returns: html representation of the template
        :rtype: bytes
        """
        if values is None:
            values = {}

        # Browse the user instead of using the sudo self.env.user
        user = self.env['res.users'].browse(self.env.uid)
        view_obj = self.env['ir.ui.view'].with_context(inherit_branding=False)
        values.update(
            time=time,
            context_timestamp=lambda t: fields.Datetime.context_timestamp(self.with_context(tz=user.tz), t),
            user=user,
            res_company=self.env.company,
            web_base_url=self.env['ir.config_parameter'].sudo().get_param('web.base.url', default=''),
        )
        return view_obj._render_template(template, values).encode()

    @api.model
    def _render_qweb_text(self, report_ref, docids, data=None):
        if not data:
            data = {}
        data.setdefault('report_type', 'text')
        report = self._get_report(report_ref)
        data = self._get_rendering_context(report, docids, data)
        return self._render_template(report.report_name, data), 'text'

    @api.model
    def _render_qweb_html(self, report_ref, docids, data=None):
        if not data:
            data = {}
        data.setdefault('report_type', 'html')
        report = self._get_report(report_ref)
        data = self._get_rendering_context(report, docids, data)
        return self._render_template(report.report_name, data), 'html'

    def _get_rendering_context_model(self, report):
        report_model_name = 'report.%s' % report.report_name
        return self.env.get(report_model_name)

    def _get_rendering_context(self, report, docids, data):
        # If the report is using a custom model to render its html, we must use it.
        # Otherwise, fallback on the generic html rendering.
        report_model = self._get_rendering_context_model(report)

        data = data and dict(data) or {}

        if report_model is not None:
            data.update(report_model._get_report_values(docids, data=data))
        else:
            docs = self.env[report.model].browse(docids)
            data.update({
                'doc_ids': docids,
                'doc_model': report.model,
                'docs': docs,
            })
        data['is_html_empty'] = is_html_empty
        return data

    @api.model
    def _render(self, report_ref, res_ids, data=None):
        report = self._get_report(report_ref)
        report_type = report.report_type.lower().replace('-', '_')
        render_func = getattr(self, '_render_' + report_type, None)
        if not render_func:
            return None
        return render_func(report_ref, res_ids, data=data)

    def report_action(self, docids, data=None, config=True):
        """Return an action of type ir.actions.report.

        :param docids: id/ids/browse record of the records to print (if not used, pass an empty list)
        :param data:
        :param bool config:
        :rtype: bytes
        """
        context = self.env.context
        if docids:
            if isinstance(docids, models.Model):
                active_ids = docids.ids
            elif isinstance(docids, int):
                active_ids = [docids]
            elif isinstance(docids, list):
                active_ids = docids
            context = dict(self.env.context, active_ids=active_ids)

        report_action = {
            'context': context,
            'data': data,
            'type': 'ir.actions.report',
            'report_name': self.report_name,
            'report_type': self.report_type,
            'report_file': self.report_file,
            'name': self.name,
        }

        discard_logo_check = self.env.context.get('discard_logo_check')
        if self.env.is_admin() and not self.env.company.external_report_layout_id and config and not discard_logo_check:
            return self._action_configure_external_report_layout(report_action)

        return report_action

    def _action_configure_external_report_layout(self, report_action, xml_id="web.action_base_document_layout_configurator"):
        action = self.env["ir.actions.actions"]._for_xml_id(xml_id)
        py_ctx = json.loads(action.get('context', {}))
        report_action['close_on_report_download'] = True
        py_ctx['report_action'] = report_action
        action['context'] = py_ctx
        return action

    def get_valid_action_reports(self, model, record_ids):
        """ Return the list of ids of actions for which the domain is
        satisfied by at least one record in record_ids.
        :param model: the model of the records to validate
        :param record_ids: list of ids of records to validate
        """
        records = self.env[model].browse(record_ids)
        actions_with_domain = self.filtered('domain')
        valid_action_report_ids = (self - actions_with_domain).ids  # actions without domain are always valid
        for action in actions_with_domain:
            if records.filtered_domain(literal_eval(action.domain)):
                valid_action_report_ids.append(action.id)
        return valid_action_report_ids
