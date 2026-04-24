# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo.http import request, route

from odoo.addons.product.controllers.catalog import ProductCatalogController


class ProductCatalogAccountController(ProductCatalogController):

    @route('/product/catalog/get_sections', auth='user', type='jsonrpc', readonly=True)
    def product_catalog_get_sections(self, res_model, order_id, child_field, **kwargs):
        """Return the sections which are in given order to be shown in the product catalog.

        :param string res_model: The order model.
        :param int order_id: The order id.
        :param string child_field: The field name of the lines in the order model.
        :rtype: list
        :return: A list of dictionaries containing section information with following structure:
            [
                {
                    'id': int,
                    'name': string,
                    'sequence': int,
                    'parent_id': int or False,
                    'line_count': int,
                    'display_type': string,
                    'subtotal': float,
                    'currency_id': int,
                    + any additional values given by inherited models
                },
            ]
        """
        order = request.env[res_model].browse(order_id)
        return order.with_company(order.company_id)._get_sections(child_field, **kwargs)

    @route('/product/catalog/create_section', auth='user', type='jsonrpc')
    def product_catalog_create_section(
        self, res_model, order_id, child_field, name, position, **kwargs,
    ):
        """Create a new section on the given order.

        :param string res_model: The order model.
        :param int order_id: The order id.
        :param string child_field: The field name of the lines in the order model.
        :param string name: The name of the section to create.
        :param str position: The position of the section where it should be created.
        :return: A dictionary with values of the created section.
        :rtype: dict
        """
        order = request.env[res_model].browse(order_id)
        return order.with_company(order.company_id)._create_section(
            child_field, name, position, **kwargs,
        )

    @route('/product/catalog/resequence_sections', auth='user', type='jsonrpc')
    def product_catalog_resequence_sections(
        self, res_model, order_id, child_field, moved_section_id, new_parent_section_id, **kwargs,
    ):
        """Reorder the sections of a given order.

        :param string res_model: The order model.
        :param int order_id: The order id.
        :param string child_field: The field name of the lines in the order model.
        :param int moved_section_id: The id of the section to move.
        :param int new_parent_section_id: The id of the new parent section.
        """
        order = request.env[res_model].browse(order_id)
        order.with_company(order.company_id)._resequence_sections(
            child_field, moved_section_id, new_parent_section_id, **kwargs,
        )

    @route('/product/catalog/delete_section', auth='user', type='jsonrpc')
    def product_catalog_delete_section(
        self, res_model, order_id, child_field, section_id, **kwargs
    ):
        """Delete the given section.

        :param string res_model: The order model.
        :param int order_id: The order id.
        :param string child_field: The field name of the lines in the order model.
        :param int section_id: The section id.
        """
        order = request.env[res_model].browse(order_id)
        order.with_company(order.company_id)._delete_section(
            child_field, section_id, **kwargs
        )

    @route('/product/catalog/duplicate_section', auth='user', type='jsonrpc')
    def product_catalog_duplicate_section(
        self, res_model, order_id, child_field, section_id, **kwargs
    ):
        """Duplicate the given section.

        :param string res_model: The order model.
        :param int order_id: The order id.
        :param string child_field: The field name of the lines in the order model.
        :param int section_id: The section id.
        :return: Duplicated section's id.
        :rtype: int
        """
        order = request.env[res_model].browse(order_id)
        return order.with_company(order.company_id)._duplicate_section(
            child_field, section_id, **kwargs
        )

    @route('/product/catalog/toggle_field_of_section', auth='user', type='jsonrpc')
    def product_catalog_toggle_field_of_section(
        self, res_model, order_id, child_field, section_id, field, **kwargs
    ):
        """Toggle the given field of the given section.

        :param string res_model: The order model.
        :param int order_id: The order id.
        :param string child_field: The field name of the lines in the order model.
        :param int section_id: The section id.
        :param string field: The field name to toggle.
        """
        order = request.env[res_model].browse(order_id)
        order.with_company(order.company_id)._toggle_field_of_section(
            child_field, section_id, field, **kwargs
        )
