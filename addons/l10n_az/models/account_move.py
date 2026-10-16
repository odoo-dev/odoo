import re
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

from lxml import etree

from odoo import api, models
from odoo.exceptions import UserError, ValidationError
from odoo.tools import file_open
from odoo.tools.xml_utils import _check_with_xsd

EQF_VERSION = '304'
EQF_KOD = 'QAIME_1'
EQF_XSD_PATH = 'l10n_az/data/xsd/QAIME_1.xsd'
EQF_STYLESHEET_PATH = 'l10n_az/data/qaime_1_stylesheet.xsl'
EQF_PROLOG = (
    b'<?xml version="1.0" encoding="UTF-8"?>\n'
    b'<?xml-stylesheet type="text/xsl" href="#stylesheet"?>\n'
    b'<!DOCTYPE root [\n<!ATTLIST xsl:stylesheet\nid ID #REQUIRED>\n]>\n'
)
XSI_NS = 'http://www.w3.org/2001/XMLSchema-instance'

ROW_TOLERANCE = Decimal('0.0001')
TOTAL_TOLERANCE = Decimal('0.01')
ZERO = Decimal(0)


def _to_decimal(value):
    # repr() gives the shortest string that round-trips the float, so no binary noise ends up in the Decimal.
    return Decimal(repr(value))


def _quantize(value, digits):
    return value.quantize(Decimal(1).scaleb(-digits), rounding=ROUND_HALF_UP)


def _format(value, digits):
    return f'{_quantize(value, digits):.{digits}f}'


class AccountMove(models.Model):
    _inherit = 'account.move'

    # -------------------------------------------------------------------------
    # ACTIONS
    # -------------------------------------------------------------------------

    def action_l10n_az_eqf_generate(self):
        """ Generate the EQF (QAIME_1) XML of each invoice in self, attach it to the invoice with a chatter message
        and download it (as a zip when there are several invoices).
        Nothing is generated if any invoice is not ready.
        """
        if errors := self._l10n_az_eqf_check_errors():
            raise ValidationError('\n - '.join([self.env._("Unable to generate EQF for the following reason(s):"), *errors]))

        xml_per_move = {}
        for move in self:
            xml_content = move._l10n_az_eqf_generate_xml()
            if xml_errors := self._l10n_az_eqf_validate_xml(xml_content):
                raise UserError(self.env._(
                    "The EQF generated for %(move)s does not comply with the QAIME_1 schema:\n%(errors)s",
                    move=move.name,
                    errors='\n'.join(xml_errors),
                ))
            xml_per_move[move] = xml_content

        attachments = self.env['ir.attachment']
        for move, xml_content in xml_per_move.items():
            attachment = self.env['ir.attachment'].create({
                'name': f"EQF_{move.name.replace('/', '_')}.xml",
                'res_model': move._name,
                'res_id': move.id,
                'raw': xml_content,
                'mimetype': 'application/xml',
            })
            move.message_post(
                body=self.env._("E-Qaimə Faktura (EQF) XML generated."),
                attachment_ids=attachment.ids,
            )
            attachments |= attachment

        if len(attachments) == 1:
            url = f'/web/content/{attachments.id}?download=true'
        else:
            url = f"/account/download_invoice_attachments/{','.join(str(attachment_id) for attachment_id in attachments.ids)}"
        return {
            'type': 'ir.actions.act_url',
            'url': url,
            'target': 'download',
        }

    # -------------------------------------------------------------------------
    # CHECKS
    # -------------------------------------------------------------------------

    def _l10n_az_eqf_check_errors(self):
        """ Collect every reason preventing the EQF generation of the invoices in self.

        :return: a list of user-facing messages, without duplicates; empty when all invoices are ready.
        """
        _ = self.env._
        errors = []

        for company in self.company_id:
            if company.account_fiscal_country_id.code != 'AZ':
                errors.append(_("The company %s must have Azerbaijan as fiscal country.", company.name))
            if not re.fullmatch(r'[0-9]{10}', company.vat or ''):
                errors.append(_("The VÖEN of the company %s must be made of exactly 10 digits.", company.name))

        for customer in self.commercial_partner_id:
            if not re.fullmatch(r'[0-9]{10}', customer.vat or ''):
                errors.append(_("The VÖEN of the customer %s must be made of exactly 10 digits.", customer.name))
            if customer.country_id.code != 'AZ' or not customer.street or not customer.city:
                errors.append(_(
                    "The customer %s must have an address in Azerbaijan, with a street and a city.",
                    customer.name,
                ))

        for move in self:
            move_name = move.name if move.name and move.name != '/' else move.display_name
            if move.state != 'posted' or move.move_type != 'out_invoice':
                errors.append(_("%s is not a posted customer invoice.", move_name))
            if move.currency_id.name != 'AZN':
                errors.append(_("%s: the invoice currency must be AZN.", move_name))

            for line in move.invoice_line_ids.filtered(lambda line: line.display_type == 'product'):
                line_name = line.name or line.product_id.display_name or ''
                product = line.product_id
                if not product:
                    errors.append(_("%(move)s: the line \"%(line)s\" has no product.", move=move_name, line=line_name))
                else:
                    if not product.l10n_az_eqf_product_code:
                        errors.append(_(
                            "%(move)s: the product %(product)s has no National Goods/Services Code.",
                            move=move_name,
                            product=product.display_name,
                        ))
                    if product.barcode and len(product.barcode) > 20:
                        errors.append(_(
                            "%(move)s: the barcode of the product %(product)s exceeds 20 characters.",
                            move=move_name,
                            product=product.display_name,
                        ))
                if taxes_without_type := line.tax_ids.filtered(lambda tax: not tax.l10n_az_eqf_vat_type):
                    errors.append(_(
                        "%(move)s: the tax %(tax)s of the line \"%(line)s\" has no EQF VAT Treatment.",
                        move=move_name,
                        tax=', '.join(taxes_without_type.mapped('name')),
                        line=line_name,
                    ))
                elif len(set(line.tax_ids.mapped('l10n_az_eqf_vat_type'))) > 1:
                    errors.append(_(
                        "%(move)s: the taxes %(taxes)s of the line \"%(line)s\" have different EQF VAT Treatments; an EQF line accepts a single treatment.",
                        move=move_name,
                        taxes=', '.join(line.tax_ids.mapped('name')),
                        line=line_name,
                    ))
                if line.quantity <= 0 or line.price_subtotal < 0:
                    errors.append(_(
                        "%(move)s: the quantity and the amount of the line \"%(line)s\" must be positive.",
                        move=move_name,
                        line=line_name,
                    ))

            # The unit price has at most 9 decimals, so c4 * c5 can miss c6 by more than the XSD tolerance on large quantities.
            for values in move._l10n_az_eqf_get_line_values():
                if values['quantity'] > 0 and abs(values['quantity'] * values['price_unit'] - values['subtotal']) > ROW_TOLERANCE:
                    errors.append(_(
                        "%(move)s: the quantity of the line \"%(line)s\" is too large for the precision of the EQF unit price; "
                        "split it into several invoice lines or use a larger unit of measure.",
                        move=move_name,
                        line=values['line'].name or values['line'].product_id.display_name or '',
                    ))

        return list(dict.fromkeys(errors))

    # -------------------------------------------------------------------------
    # XML GENERATION
    # -------------------------------------------------------------------------

    def _l10n_az_eqf_get_line_values(self):
        """ Compute the qaimeTable rows (as Decimal) from the move's rounded tax details.

        :return: a list of dicts, one per product line, in sequence order.
        """
        self.ensure_one()
        base_lines, _tax_lines = self._get_rounded_base_and_tax_lines()
        base_line_per_record = {
            base_line['record']: base_line
            for base_line in base_lines
            if base_line['record'] and base_line['record'].display_type == 'product'
        }
        product_lines = self.invoice_line_ids \
            .filtered(lambda line: line.display_type == 'product') \
            .sorted(lambda line: (line.sequence, line.id))

        lines_values = []
        for line in product_lines:
            tax_details = base_line_per_record[line]['tax_details']
            quantity = _quantize(_to_decimal(line.quantity), 4)
            subtotal = _quantize(_to_decimal(tax_details['total_excluded_currency']), 4)
            # The checks ensure all the taxes of the line share the same treatment.
            vat_type = line.tax_ids[:1].l10n_az_eqf_vat_type or 'non_vat'
            if vat_type == 'taxable':
                vat_amount = _quantize(sum(
                    (_to_decimal(tax_data['tax_amount_currency']) for tax_data in tax_details['taxes_data']),
                    ZERO,
                ), 4)
            else:
                vat_amount = ZERO
            excise_rate = excise_amount = road_tax = ZERO
            total = subtotal + excise_amount
            lines_values.append({
                'line': line,
                'quantity': quantity,
                'price_unit': _quantize(subtotal / quantity, 9) if quantity else ZERO,
                'subtotal': subtotal,
                'excise_rate': excise_rate,
                'excise_amount': excise_amount,
                'total': total,
                'taxable': total if vat_type == 'taxable' else ZERO,
                'non_vat': total if vat_type == 'non_vat' else ZERO,
                'exempt': total if vat_type == 'exempt' else ZERO,
                'zero_rated': total if vat_type == 'zero_rated' else ZERO,
                'vat_amount': vat_amount,
                'road_tax': road_tax,
                'grand_total': total + vat_amount + road_tax,
            })
        return lines_values

    def _l10n_az_eqf_generate_xml(self):
        """ Build the EQF (QAIME_1) XML document of the invoice, without side effects.

        :return: the XML content as bytes.
        """
        self.ensure_one()
        customer = self.commercial_partner_id
        move = self.with_context(lang=customer.lang)
        company = move.company_id

        root = etree.Element('root', nsmap={'xsi': XSI_NS})
        root.set('version', EQF_VERSION)
        root.set('kod', EQF_KOD)
        root.set(f'{{{XSI_NS}}}noNamespaceSchemaLocation', 'QAIME_1.xsd')

        with file_open(EQF_STYLESHEET_PATH, 'rb') as stylesheet_file:
            root.append(etree.fromstring(stylesheet_file.read()))

        def add(parent, tag, text=None):
            node = etree.SubElement(parent, tag)
            if text is not None:
                node.text = text
            return node

        add(root, 'qaimeKime', customer.vat)
        add(root, 'qaimeKimden', company.vat)
        add(root, 'ds', '')
        add(root, 'dn', '')
        add(root, 'des', (move.name or '')[:150])
        add(root, 'des2', (move.ref or '')[:150])
        if location_address := company._l10n_az_eqf_get_location_address():
            add(root, 'ma', location_address)
        if company.l10n_az_eqf_location_code:
            add(root, 'mk', company.l10n_az_eqf_location_code)

        product_node = add(root, 'product')
        table_node = add(product_node, 'qaimeTable')
        lines_values = move._l10n_az_eqf_get_line_values()
        for index, values in enumerate(lines_values):
            line = values['line']
            row = add(table_node, 'row')
            row.set('no', str(index))
            add(row, 'c1', line.product_id.l10n_az_eqf_product_code)
            add(row, 'c2', line.product_id.name[:300])
            add(row, 'c3', line.product_uom_id.name[:150])
            add(row, 'c4', _format(values['quantity'], 4))
            add(row, 'c5', _format(values['price_unit'], 9))
            for tag, key in (
                ('c6', 'subtotal'),
                ('c7', 'excise_rate'),
                ('c8', 'excise_amount'),
                ('c9', 'total'),
                ('c10', 'taxable'),
                ('c11', 'non_vat'),
                ('c12', 'exempt'),
                ('c13', 'zero_rated'),
                ('c14', 'vat_amount'),
                ('c15', 'road_tax'),
                ('c16', 'grand_total'),
            ):
                add(row, tag, _format(values[key], 4))
            add(row, 'c17', line.product_id.barcode or '0')
            add(row, 'productId', '0')

        def total(key):
            return sum((values[key] for values in lines_values), ZERO)

        totals_row = add(add(product_node, 'qaimeYekunTable'), 'row')
        for tag, amount in (
            ('c1', total('subtotal')),
            ('c2', total('excise_amount')),
            ('c3', total('subtotal') + total('excise_amount')),
            ('c4', total('taxable')),
            ('c5', total('non_vat')),
            ('c6', total('exempt')),
            ('c7', total('zero_rated')),
            ('c8', total('vat_amount')),
            ('c9', total('grand_total')),
            ('c10', total('road_tax')),
        ):
            add(totals_row, tag, _format(amount, 2))

        add(root, 'qaimeKimeAd', customer.name)

        return EQF_PROLOG + etree.tostring(root, encoding='UTF-8', pretty_print=True)

    # -------------------------------------------------------------------------
    # XML VALIDATION
    # -------------------------------------------------------------------------

    @api.model
    def _l10n_az_eqf_validate_xml(self, xml_content):
        """ Validate an EQF (QAIME_1) document: XSD 1.0 structure, then the XSD 1.1 assertions of the official schema
        (lxml only implements XSD 1.0, so they are re-implemented here).

        :param xml_content: the XML document as bytes.
        :return: a list of error messages; empty when the document is valid.
        """
        try:
            tree = etree.fromstring(xml_content, parser=etree.XMLParser(resolve_entities=False))
        except etree.XMLSyntaxError as error:
            return [str(error)]

        errors = []
        try:
            with file_open(EQF_XSD_PATH, 'rb') as xsd:
                _check_with_xsd(tree, xsd)
        except UserError as error:
            errors += str(error.args[0]).splitlines()
        return errors + self._l10n_az_eqf_check_xml_asserts(tree)

    @api.model
    def _l10n_az_eqf_check_xml_asserts(self, tree):
        """ Python re-implementation of every active xs:assert of the official EQF_MT.xsd, with Decimal arithmetic
        and the same tolerances. An assert is skipped when the @old attribute of its element is 1, as in the XSD.
        """
        _ = self.env._
        errors = []

        def value(node, tag):
            """ Decimal value of the child 'tag' of node, or None when it is missing or not a number. """
            child = node.find(tag) if node is not None else None
            if child is None or child.text is None:
                return None
            try:
                return Decimal(child.text.strip())
            except InvalidOperation:
                return None

        def is_within(left, right, tolerance):
            return left is not None and right is not None and abs(left - right) <= tolerance

        def add_sums(*values):
            return None if any(val is None for val in values) else sum(values, ZERO)

        rows = tree.findall('product/qaimeTable/row')
        for row in rows:
            if row.get('old') == '1':
                continue
            row_no = row.get('no')
            c = {f'c{i}': value(row, f'c{i}') for i in range(4, 17)}
            row_product = None if c['c4'] is None or c['c5'] is None else c['c4'] * c['c5']
            if not is_within(c['c6'], row_product, ROW_TOLERANCE):
                errors.append(_("qaimeTable row %s: c6 must be equal to c4 * c5.", row_no))
            if not is_within(c['c9'], add_sums(c['c6'], c['c8']), ROW_TOLERANCE):
                errors.append(_("qaimeTable row %s: c9 must be equal to c6 + c8.", row_no))
            vat_columns = [c['c10'], c['c11'], c['c12'], c['c13']]
            if not (
                all(column is not None and column == 0 for column in vat_columns)
                or is_within(c['c9'], add_sums(*vat_columns), ROW_TOLERANCE)
            ):
                errors.append(_("qaimeTable row %s: c9 must be equal to c10 + c11 + c12 + c13.", row_no))
            if not is_within(c['c16'], add_sums(c['c9'], c['c14'], c['c15']), ROW_TOLERANCE):
                errors.append(_("qaimeTable row %s: c16 must be equal to c9 + c14 + c15.", row_no))

        version = tree.get('version')
        try:
            version_ok = version is not None and Decimal(version.strip()) >= 301
        except InvalidOperation:
            version_ok = False
        if not version_ok:
            errors.append(_("The version attribute of the root must be at least 301."))

        if tree.get('old') == '1':
            return errors

        def rows_sum(tag):
            # sum() of an XPath node set: missing nodes are skipped, non-numeric ones make the assert fail.
            total = ZERO
            for row in rows:
                if row.find(tag) is not None:
                    row_value = value(row, tag)
                    if row_value is None:
                        return None
                    total += row_value
            return total

        def rows_products_sum(with_excise):
            total = ZERO
            for row in rows:
                factors = [value(row, 'c4'), value(row, 'c5')] + ([value(row, 'c8')] if with_excise else [])
                if any(factor is None for factor in factors):
                    return None
                total += factors[0] * factors[1] + (factors[2] if with_excise else ZERO)
            return total

        totals_row = tree.find('product/qaimeYekunTable/row')
        for tag, expected, formula in (
            ('c1', rows_products_sum(False), "sum(c4 * c5)"),
            ('c2', rows_sum('c8'), "sum(c8)"),
            ('c3', rows_products_sum(True), "sum(c4 * c5 + c8)"),
            ('c4', rows_sum('c10'), "sum(c10)"),
            ('c5', rows_sum('c11'), "sum(c11)"),
            ('c6', rows_sum('c12'), "sum(c12)"),
            ('c7', rows_sum('c13'), "sum(c13)"),
            ('c8', rows_sum('c14'), "sum(c14)"),
            ('c9', rows_sum('c16'), "sum(c16)"),
            ('c10', rows_sum('c15'), "sum(c15)"),
        ):
            if not is_within(value(totals_row, tag), expected, TOTAL_TOLERANCE):
                errors.append(_(
                    "qaimeYekunTable %(column)s must be equal to %(formula)s of the qaimeTable rows.",
                    column=tag,
                    formula=formula,
                ))
        return errors
