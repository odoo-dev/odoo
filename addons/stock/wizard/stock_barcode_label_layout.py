from odoo import api, models


class BarcodeLabelLayout(models.TransientModel):
    _name = 'stock.barcode.label.layout'
    _description = 'Prepare Barcode Labels'

    @api.model
    def _process_report_data(self, data, print_format):
        report_xml_id = 'product.report_product_template_label_zpl' if print_format == 'zpl' else 'product.action_report_product_label_pdf'
        action = self.env.ref(report_xml_id).report_action(None, data=data, config=False)
        action['close_on_report_download'] = True
        return action

    @api.model
    def _prepare_report_data(self, records, print_format):
        data = {
            'labels': [{
                'barcode_value': record.barcode or '',
                'barcode_text': record.barcode or '',
                'name': record.display_name,
            } for record in records],
            'label_template': f"stock.barcode_{'zpl' if print_format == 'zpl' else '4x7'}_label",
        }
        if print_format == '4x7':
            data['layout'] = {
                'rows': 7,
                'columns': 4,
            }
        return data

    @api.model
    def _process_barcode_labels(self, records, print_format):
        data = self._prepare_report_data(records, print_format)
        return self._process_report_data(data, print_format)
