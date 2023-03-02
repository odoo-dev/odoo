# -*- coding: utf-8 -*-
import werkzeug
from odoo import fields, http, _
from odoo.http import request
from odoo.osv.expression import AND
from odoo.tools import format_amount


from itertools import groupby


class PosSelfOrder(http.Controller):
    """
    This is the controller for the POS Self Order App
    """
    
    @http.route([
        '/pos-self-order/',
        '/pos-self-order/products',
        '/pos-self-order/products/<int:product_id>',
    ], auth='public', website=True)
    def pos_self_order_start(self, pos_id=None, product_id=None):
        """
        The user gets this route from the QR code that they scan at the table
        This START ROUTE will render the LANDING PAGE of the POS Self Order App
        And it will pass some generic variabiles to the template: pos_id, table_id, pos_name, currency

        We get some details about this POS from the model "pos.config"

        If the POS is not open, we display a message to the user, saying the restaurant is closed
        the user will still be able to see the menu and even add items to the cart,
        but they will not be able to send the order
        """
        if not pos_id:
            raise werkzeug.exceptions.NotFound()
        pos_sudo = request.env['pos.config'].sudo().search(
            [('id', '=', pos_id)])

        if not pos_sudo.self_order_allow_view_menu():
            raise werkzeug.exceptions.NotFound()

        # On the landing page of the app we can have a number of custom links
        # they are defined by the restaurant employee in the backend
        custom_links_sudo = request.env['pos_self_order.custom_link'].sudo().search([
        ], order='sequence')
        custom_links_list = custom_links_sudo.filtered(lambda link: int(pos_id) in [
                                                       pos.id for pos in link.pos_config_id] or not link.pos_config_id).read(['name', 'url', 'style'])
        context = {
            'pos_id': pos_id,
            'pos_name': pos_sudo.name,
            'currency_id': pos_sudo.currency_id.id,
            'show_prices_with_tax_included': True,
            'custom_links': custom_links_list,
            'attributes_by_ptal_id': request.env['pos.session'].sudo()._get_attributes_by_ptal_id(),
        }
        # TODO: make sure it is ok to send session_info to frontend
        session_info = request.env['ir.http'].session_info()
        session_info['pos_self_order'] = context
        response = request.render(
            'pos_self_order.pos_self_order_index', {
                'session_info': session_info,
            })
        return response

    @http.route('/pos-self-order/get-menu', auth='public', type="json", website=True)
    def pos_self_order_get_menu(self, pos_id=None):
        """
        This is the route that the POS Self Order App uses to GET THE MENU
        :param pos_id: the id of the POS
        :type pos_id: int

        :return: the menu
        :rtype: list of dict
        """
        if not pos_id:
            raise werkzeug.exceptions.NotFound()
        pos_sudo = request.env['pos.config'].sudo().search(
            [('id', '=', pos_id)])
        if not pos_sudo.self_order_allow_view_menu():
            raise werkzeug.exceptions.NotFound()
        # we only get the products that are available in THIS POS
        products_sudo = request.env['product.product'].sudo().search(
                            [('available_in_pos', '=', True)], 
                            order='pos_categ_id').filtered(
                                    lambda product: 
                                            product.pos_categ_id.id in [category['id'] for category in 
                                                            pos_sudo.iface_available_categ_ids.read(['id'])]
                                            or not pos_sudo.iface_available_categ_ids
                            )
        print(products_sudo[0].pos_categ_id.id)
        print( pos_sudo.iface_available_categ_ids.read(['id']))

        # for each of the items in products_sudo, we get the price info and the attribute line ids
        menu= [{
            **{
                'price_info': product.get_product_info_pos(product.list_price, 1, int(pos_id))['all_prices'],
                'attribute_line_ids': product.read(['attribute_line_ids'])[0].get('attribute_line_ids'),
            },
            **product.read(['id', 'name', 'description_sale', 'pos_categ_id'])[0],
        } for product in products_sudo]
        return menu

    # FIXME: crop the images to be square -- maybe we want to do this in the frontend?
    # TODO: right now this route will return the image to whoever calls it; is there any reason to not make it public?
    @ http.route('/pos-self-order/get-images/<int:product_id>', methods=['GET'], type='http', auth='public')
    def pos_self_order_get_images(self, product_id):
        """
        This is the route that the POS Self Order App uses to GET THE PRODUCT IMAGES

        :param product_id: the id of the product
        :type product_id: int

        """
        # We get the product with the specific id from the database
        product_sudo= request.env['product.product'].sudo().browse(product_id)
        # We return the image of the product in binary format
        # 'image_1920' is the name of the field that contains the image
        # If the product does not have an image, the function _get_image_stream_from will return the default image
        return request.env['ir.binary']._get_image_stream_from(product_sudo, field_name='image_1920').get_response()


# TODO: this is a function from"pos.session" <-- use the one from there instead of this one
def get_attributes_by_ptal_id():
        product_attributes= request.env['product.attribute'].sudo().search([('create_variant', '=', 'no_variant')])
        product_attributes_by_id= {product_attribute.id: product_attribute for product_attribute in product_attributes}
        domain= [('attribute_id', 'in', product_attributes.mapped('id'))]
        product_template_attribute_values= request.env['product.template.attribute.value'].sudo().search(domain)
        key= lambda ptav: (ptav.attribute_line_id.id, ptav.attribute_id.id)
        res={}
        for key, group in groupby(sorted(product_template_attribute_values, key=key), key=key):
            attribute_line_id, attribute_id=key
            values=[{**ptav.product_attribute_value_id.read(['name', 'is_custom', 'html_color'])[0],
                       'price_extra': ptav.price_extra} for ptav in list(group)]
            res[attribute_line_id]= {
                'id': attribute_line_id,
                'name': product_attributes_by_id[attribute_id].name,
                'display_type': product_attributes_by_id[attribute_id].display_type,
                'values': values
            }
        return res
