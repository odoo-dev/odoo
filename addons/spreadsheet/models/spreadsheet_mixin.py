# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.
import io
import zipfile
import base64
import json
import re
import os

from collections import defaultdict

from odoo import api, fields, models, _, tools
from odoo.tools.mimetypes import get_extension
from odoo.exceptions import ValidationError, MissingError, UserError

from odoo.addons.spreadsheet.utils.validate_data import fields_in_spreadsheet, menus_xml_ids_in_spreadsheet

XLSX_EXTENSIONS = ['.xls', '.xlsx', '.xlsm', '.xlsb', '.xlt', '.xltx', '.xltm']

SUPPORTED_PATHS = (
    "[Content_Types].xml",
    "xl/sharedStrings.xml",
    "xl/styles.xml",
    "xl/workbook.xml",
    "_rels/",
    "xl/_rels",
    "xl/charts/",
    "xl/drawings/",
    "xl/externalLinks/",
    "xl/pivotTables/",
    "xl/tables/",
    "xl/theme/",
    "xl/worksheets/",
    "xl/media",
)


class SpreadsheetMixin(models.AbstractModel):
    _name = 'spreadsheet.mixin'
    _description = "Spreadsheet mixin"
    _auto = False

    spreadsheet_binary_data = fields.Binary(
        string="Spreadsheet file",
        default=lambda self: self._empty_spreadsheet_data_base64(),
    )
    spreadsheet_data = fields.Text(compute='_compute_spreadsheet_data', inverse='_inverse_spreadsheet_data')
    spreadsheet_file_name = fields.Char(compute='_compute_spreadsheet_file_name')
    thumbnail = fields.Binary()

    def is_excel_file(self, filename: str) -> bool:
        extenstion = get_extension(filename)
        return extenstion.lower() in XLSX_EXTENSIONS

    def _get_spreadsheet_vals(self, vals):
        if "spreadsheet_binary_data" in vals:
            if self.is_excel_file(vals.get("spreadsheet_file_name")):
                unzipped, _ = self._unzip_xlsx(base64.b64decode(vals["spreadsheet_binary_data"]))
                vals["spreadsheet_data"] = json.dumps(unzipped)
                vals["spreadsheet_binary_data"] = False
        if vals.get("name") and not vals.get("spreadsheet_file_name"):
            vals["spreadsheet_file_name"] = f"{vals['name']}.osheet.json"
        return vals

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            vals = self._get_spreadsheet_vals(vals)
        return super().create(vals_list)

    def write(self, vals):
        vals = self._get_spreadsheet_vals(vals)
        return super().write(vals)

    @api.constrains("spreadsheet_binary_data")
    def _check_spreadsheet_data(self):
        for spreadsheet in self.filtered("spreadsheet_binary_data"):
            try:
                data = json.loads(base64.b64decode(spreadsheet.spreadsheet_binary_data).decode())
            except (json.JSONDecodeError, UnicodeDecodeError):
                raise ValidationError(_("Uh-oh! Looks like the spreadsheet file contains invalid data."))
            if not (tools.config['test_enable'] or tools.config['test_file']):
                continue
            if data.get("[Content_Types].xml"):
                # this is a xlsx file
                continue
            display_name = spreadsheet.display_name
            errors = []
            for model, field_chains in fields_in_spreadsheet(data).items():
                if model not in self.env:
                    errors.append(f"- model '{model}' used in '{display_name}' does not exist")
                    continue
                for field_chain in field_chains:
                    field_model = model
                    for fname in field_chain.split("."):  # field chain 'product_id.channel_ids'
                        if fname not in self.env[field_model]._fields:
                            errors.append(f"- field '{fname}' used in spreadsheet '{display_name}' does not exist on model '{field_model}'")
                            continue
                        field = self.env[field_model]._fields[fname]
                        if field.relational:
                            field_model = field.comodel_name

            for xml_id in menus_xml_ids_in_spreadsheet(data):
                record = self.env.ref(xml_id, raise_if_not_found=False)
                if not record:
                    errors.append(f"- xml id '{xml_id}' used in spreadsheet '{display_name}' does not exist")
                    continue
                # check that the menu has an action. Root menus always have an action.
                if not record.action and record.parent_id.id:
                    errors.append(f"- menu with xml id '{xml_id}' used in spreadsheet '{display_name}' does not have an action")

            if errors:
                raise ValidationError(
                    _(
                        "Uh-oh! Looks like the spreadsheet file contains invalid data.\n\n%(errors)s",
                        errors="\n".join(errors),
                    ),
                )

    def _unzip_xlsx(self, raw_file):
        file = io.BytesIO(raw_file)
        if not zipfile.is_zipfile(file):
            raise UserError(_("The file is not a xlsx file"))

        unzipped_size = 0
        with zipfile.ZipFile(file) as input_zip:
            if len(input_zip.infolist()) > 1000:
                raise UserError(_("The xlsx file is too big"))

            if "[Content_Types].xml" not in input_zip.namelist() or \
                    not any(name.startswith("xl/") for name in input_zip.namelist()):
                raise UserError(_("The xlsx file is corrupted"))

            unzipped = {}
            attachments = []
            for info in input_zip.infolist():
                if not (info.filename.endswith((".xml", ".xml.rels")) or "media/image" in info.filename) or\
                        not info.filename.startswith(SUPPORTED_PATHS):
                    # Don't extract files others than xmls or unsupported xmls
                    continue

                unzipped_size += info.file_size
                if unzipped_size > 50 * 1000 * 1000:  # 50MB
                    raise UserError(_("The xlsx file is too big"))

                if info.filename.endswith((".xml", ".xml.rels")):
                    unzipped[info.filename] = input_zip.read(info.filename).decode()
                elif "media/image" in info.filename:
                    image_file = input_zip.read(info.filename)
                    attachment = self._upload_image_file(image_file, info.filename)
                    attachments.append(attachment)
                    unzipped[info.filename] = {
                        "imageSrc": "/web/image/" + str(attachment.id),
                    }
        return unzipped, attachments

    def _upload_image_file(self, image_file, filename):
        attachment_model = self.env['ir.attachment']
        attachment = attachment_model.create({
            'name': filename,
            'datas': base64.encodebytes(image_file),
            'res_model': "documents.document",
        })
        attachment._post_add_create()
        return attachment

    @api.depends("spreadsheet_binary_data")
    def _compute_spreadsheet_data(self):
        attachments = self.env['ir.attachment'].with_context(bin_size=False).search([
            ('res_model', '=', self._name),
            ('res_field', '=', 'spreadsheet_binary_data'),
            ('res_id', 'in', self.ids),
        ])
        data = {
            attachment.res_id: attachment.raw
            for attachment in attachments
        }
        for spreadsheet in self:
            spreadsheet.spreadsheet_data = data.get(spreadsheet.id, False)

    def _inverse_spreadsheet_data(self):
        for spreadsheet in self:
            if not spreadsheet.spreadsheet_data:
                spreadsheet.spreadsheet_binary_data = False
            else:
                spreadsheet.spreadsheet_binary_data = base64.b64encode(spreadsheet.spreadsheet_data.encode())

    @api.depends('display_name')
    def _compute_spreadsheet_file_name(self):
        for spreadsheet in self:
            spreadsheet.spreadsheet_file_name = f"{spreadsheet.display_name}.osheet.json"

    @api.readonly
    @api.model
    def get_display_names_for_spreadsheet(self, args):
        ids_per_model = defaultdict(list)
        for arg in args:
            ids_per_model[arg["model"]].append(arg["id"])
        display_names = defaultdict(dict)
        for model, ids in ids_per_model.items():
            records = self.env[model].with_context(active_test=False).search([("id", "in", ids)])
            for record in records:
                display_names[model][record.id] = record.display_name

        # return the display names in the same order as the input
        return [
            display_names[arg["model"]].get(arg["id"])
            for arg in args
        ]

    def _empty_spreadsheet_data_base64(self):
        """Create an empty spreadsheet workbook.
        Encoded as base64
        """
        data = json.dumps(self._empty_spreadsheet_data())
        return base64.b64encode(data.encode())

    def _empty_spreadsheet_data(self):
        """Create an empty spreadsheet workbook.
        The sheet name should be the same for all users to allow consistent references
        in formulas. It is translated for the user creating the spreadsheet.
        """
        lang = self.env["res.lang"]._lang_get(self.env.user.lang)
        locale = lang._odoo_lang_to_spreadsheet_locale()
        return {
            "sheets": [
                {
                    "id": "sheet1",
                    "name": _("Sheet1"),
                }
            ],
            "settings": {
                "locale": locale,
            },
            "revisionId": "START_REVISION",
        }

    def _zip_xslx_files(self, files):
        stream = io.BytesIO()
        with zipfile.ZipFile(stream, 'w', compression=zipfile.ZIP_DEFLATED) as doc_zip:
            for f in files:
                # to reduce networking load, only the image path is sent.
                # It's replaced by the image content here.
                if 'imageSrc' in f:
                    try:
                        content = self._get_file_content(f['imageSrc'])
                        doc_zip.writestr(f['path'], content)
                    except MissingError:
                        pass
                else:
                    doc_zip.writestr(f['path'], f['content'])

        return stream.getvalue()

    def _get_file_content(self, file_path):
        if file_path.startswith('data:image/png;base64,'):
            return base64.b64decode(file_path.split(',')[1])
        match = re.match(r'/web/image/(\d+)', file_path)
        file_record = self.env['ir.binary']._find_record(
            res_model='ir.attachment',
            res_id=int(match.group(1)),
        )
        return self.env['ir.binary']._get_stream_from(file_record).read()
