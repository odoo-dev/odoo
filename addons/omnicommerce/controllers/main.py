import uuid

from odoo import http, Command
from odoo.http import request
from odoo.exceptions import AccessDenied, UserError

class OmniCompanyController(http.Controller):

    @http.route('/create_omni_company_user', type='jsonrpc', auth='public', methods=['POST'])
    def create_company_user(self, **kwargs):
        name = kwargs.get('name')
        username = kwargs.get('username')
        company_name = kwargs.get('company_name')
        selected_channels = kwargs.get('selected_channels', [])
        country_id = kwargs.get('country_id')

        # generate a random 8 character password
        # FIXME: for testing purpose only, we are setting password = username
        password = username
        
        # get id, name, code from marketplace channels where id in selected_channels
        selected_channels = request.env['marketplace.channel'].sudo().search_read(
            [('id', 'in', selected_channels)],
            ['id', 'name', 'code']
        )

        codes_list = [m['code'] for m in selected_channels]

        channel_groups_map = {
            'shopify': 'omnicommerce.group_marketplace_shopify_user',
            'wc': 'omnicommerce.group_marketplace_woocommerce_user',
            'magento': 'omnicommerce.group_marketplace_magento_user',
            'amazon': 'omnicommerce.group_marketplace_amazon_user',
            'prestashop': 'omnicommerce.group_marketplace_prestashop_user',
            'bigcommerce': 'omnicommerce.group_marketplace_bigcommerce_user',
        }

        channel_groups = []
        for code in codes_list:
            if code in channel_groups_map:
                group = request.env.ref(channel_groups_map[code])
                channel_groups.append(group)
        
        if not all([name, username, password, company_name]):
            return {'error': 'Missing required parameters'}
        
        # check if username already exists
        existing_user = request.env['res.users'].sudo().search([('login', '=', username)], limit=1)
        if existing_user:
            return {'status': 'error', 'message': f"Email '{username}' already exists. Try logging in or choose a different Email."}
            
        # if username does not exist, create company and user
        company = request.env['res.company'].sudo().create({
            'name': company_name,
            'country_id': country_id,
        })

        company_partner = company.partner_id
        company_partner.sudo().write({
            'company_id': company.id,
            'is_company': True,
        })

        request.env['stock.warehouse'].sudo().with_company(company.id).create({
            'name': f"{company_name} Warehouse",
            'code': f"{company_name[:3].upper()}WH",
            'company_id': company.id,
            'partner_id': company_partner.id,
        })

        internal_group = request.env.ref('base.group_user')
        omni_group = request.env.ref('omnicommerce.group_omni_company_admin')
        admin_group = request.env.ref('base.group_system')
        inventory_admin = request.env.ref('stock.group_stock_manager')
        sales_admin = request.env.ref('sales_team.group_sale_manager')
        products_admin = request.env.ref('product.group_product_manager')
        account_admin = request.env.ref('account.group_account_manager')
        contact_admin = request.env.ref('base.group_partner_manager')

        base_group_ids = [
            Command.link(omni_group.id),
            Command.link(internal_group.id),
            Command.link(inventory_admin.id),
            Command.link(sales_admin.id), 
            Command.link(products_admin.id), 
            Command.link(account_admin.id),
            Command.link(contact_admin.id),
        ]

        channel_group_ids = [Command.link(group.id) for group in channel_groups]

        user = request.env['res.users'].sudo().create({
            'name': name,
            'email': username,
            'login': username,
            'password': password,
            'company_id': company.id,
            'company_ids': [Command.link(company.id)],
            'group_ids': base_group_ids + channel_group_ids,
            'country_id': country_id,
        })

        # we will allow admin_group to manage the new company
        admins = request.env['res.users'].sudo().search([('group_ids', 'in', admin_group.ids)])
        for admin in admins:
            admin.write({
                'company_ids': [Command.link(company.id)],
            })

        # login the user
        credentials = {
            'login': username,
            'password': password,
            'type': 'password',
        }
        try:
            request.session.authenticate(request.env, credentials)
        except AccessDenied:
            res = {
                'status': 'error',
                'message': 'Unable to redirect to Home page, try logging in manually.'
            }
            # If for some reasons direct login fails, user can set their own password using the reset link and login manually
            user.sudo().with_context(create_user = False).action_reset_password()
            return res
        
        # Call `action_reset_password` to send password reset email (Same method is called by admin from UI to send reset password email)
        # without outgoing mail server configured, email will not be sent!!
        user.sudo().with_context(create_user = False).action_reset_password()
        res = {
            'status': 'success',
            'company_id': company.id,
            'user_id': user.id,
            'message': f"Company '{company_name}' and user '{username}' created successfully. Admin assigned to new company."
        }

        return res
    