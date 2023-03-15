# -*- coding: utf-8 -*-
import werkzeug
from odoo import http, _
from odoo.http import request

class PosSelfOrder(http.Controller):
    """
    This is the controller for the POS Self Order App
    There is one main route that the client will use to access the POS Self Order App: /menu
    This route will render the LANDING PAGE of the POS Self Order App
    And it will pass some generic variabiles to the template: pos_id, table_id, pos_name, currency...
    After that the client will be able to navigate to the /products route w/o aditional requests
    to the server, using client side routing.
    """
    @http.route([
        '/menu/',
        '/menu/products',
        '/menu/products/<int:product_id>',
    ], auth='public', website=True)
    def pos_self_order_start(self, pos_id=None, product_id=None):
        """
        The user gets this route from the QR code that they scan at the table
        This START ROUTE will render the LANDING PAGE of the POS Self Order App
        And it will pass some generic variabiles to the template: pos_id, table_id, pos_name, currency, 

        We get some details about this POS from the model "pos.config"
        """
        # TODO: make sure it is ok to send session_info to frontend
        session_info = request.env['ir.http'].session_info()
        session_info['pos_self_order'] = get_self_order_config(pos_id)
        response = request.render(
            'pos_self_order.pos_self_order_index', {
                'session_info': session_info,
            })
        return response

    @http.route('/menu/get-menu', auth='public', type="json", website=True)
    def pos_self_order_get_menu(self, pos_id=None):
        """
        This is the route that the POS Self Order App uses to GET THE MENU
        :param pos_id: the id of the POS
        :type pos_id: int
        :return: the menu
        :rtype: list of dict
        """
        products_sudo = get_products_that_are_available_in_this_pos_sudo(pos_id)
        return get_necessary_data_from_products_list(products_sudo, pos_id)

    # TODO: right now this route will return the image to whoever calls it; is there any reason to not make it public?
    @http.route('/menu/get-images/<int:product_id>', methods=['GET'], type='http', auth='public')
    def pos_self_order_get_images(self, product_id):
        """
        This is the route that the POS Self Order App uses to GET THE PRODUCT IMAGES
        If the product does not have an image, the function _get_image_stream_from will return the default image
        :param product_id: the id of the product
        :type product_id: int
        :return: the image of the product
        :rtype: binary
        """
        product_sudo= request.env['product.product'].sudo().browse(product_id)
        return request.env['ir.binary']._get_image_stream_from(product_sudo, field_name='image_1920').get_response()

def find_pos_config_sudo(pos_id):
    """ 
    This function checks that the pos_id exists, and that the pos is configured to allow the menu to be viewed online

    :param pos_id: the id of the POS
    :type pos_id: int
    :return: the pos config object, if the pos_id is valid
    """
    if not pos_id:
        raise werkzeug.exceptions.NotFound()
    pos_sudo = request.env['pos.config'].sudo().search(
        [('id', '=', pos_id)])
    if not pos_sudo or not pos_sudo.self_order_allow_view_menu():
        raise werkzeug.exceptions.NotFound()
    return pos_sudo

def get_self_order_config(pos_id):
    """
    Returns the necessary information for the POS Self Order App
    :param int pos_id: the id of the POS
    :return: dictionary 
    """
    pos_sudo = find_pos_config_sudo(pos_id)
    return {
        'pos_id': pos_id,
        'pos_name': pos_sudo.name,
        'currency_id': pos_sudo.currency_id.id,
        'show_prices_with_tax_included': True,
        'custom_links': get_custom_links_list(pos_id),
        'attributes_by_ptal_id': request.env['pos.session'].sudo()._get_attributes_by_ptal_id(),
    }

def get_custom_links_list(pos_id):
    """
    On the landing page of the app we can have a number of custom links
    that are defined by the restaurant employee in the backend.
    This function returns a list of dictionaries with the name, url and style of each link
    that is available for the POS with id pos_id.
    :param pos_id: the id of the POS
    :type pos_id: int
    :return: a list of dictionaries with the name, url and style of each link
    :rtype: list of dict
    """
    custom_links_sudo = request.env['pos_self_order.custom_link'].sudo().search([
    ], order='sequence')
    return custom_links_sudo.filtered(lambda link: 
                            int(pos_id) in [pos.id for pos in link.pos_config_id] 
                            or not link.pos_config_id).read(['name', 'url', 'style']
                            )


def get_products_that_are_available_in_this_pos_sudo(pos_id):
    """
    This function returns the products that are available in the POS with id pos_id
    :param pos_sudo: the POS config object
    :type pos_sudo: pos.config object
    :return: the products that are available in the POS with id pos_id
    :rtype: list of product.product objects
    """
    pos_sudo = find_pos_config_sudo(pos_id)
    return request.env['product.product'].sudo().search(
                        [('available_in_pos', '=', True)], 
                        order='pos_categ_id').filtered(
                                lambda product: 
                                        product.pos_categ_id.id in [category['id'] for category in 
                                                        pos_sudo.iface_available_categ_ids.read(['id'])]
                                        or not pos_sudo.iface_available_categ_ids
                        )


def get_necessary_data_from_products_list(products_sudo, pos_id):
    """
    This function adds the price info to each product in the list products_sudo
    and returns the list of products with the necessary info
    :param products_sudo: the list of products
    :type products_sudo: list of product.product objects
    :param pos_id: the id of the POS
    :type pos_id: int
    :return: the list of products with the price info and the attribute line ids
    :rtype: list of dict
    """
    return [{
        **{
            'price_info': product.get_product_info_pos(product.lst_price, 1, int(pos_id))['all_prices'],
        },
        **product.read(['id', 'display_name', 'description_sale', 'pos_categ_id', 'attribute_line_ids'])[0],
    } for product in products_sudo]