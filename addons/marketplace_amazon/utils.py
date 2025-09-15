# Part of Odoo. See LICENSE file for full copyright and licensing details.

import json
import logging
import requests
from datetime import datetime, timedelta
from werkzeug.urls import url_parse
from xml.etree import ElementTree

from odoo import fields
from odoo.exceptions import ValidationError, UserError
from odoo.tools.urls import urljoin as url_join

from odoo.addons.marketplace_amazon import const


_logger = logging.getLogger(__name__)


#=== ONBOARDING ===#

def make_authentication_request(payload={}):
    """ Make an authentication request to Amazon.

    This method is used in two scenarios:

    1. **Authorization Code Exchange** – When exchanging an authorization code for a refresh token.
       Example payload:
       {
           'grant_type': 'authorization_code',
           'code': authorization_code,
           'client_id': '<client_id>',
           'client_secret': '<client_secret>',
       }

    2. **Token Refresh** – When using a refresh token to obtain a new access token.
       Example payload:
       {
           'grant_type': 'refresh_token',
           'refresh_token': amazon_refresh_token,
           'client_id': '<client_id>',
           'client_secret': '<client_secret>',
       }

    :params dict payload: The payload of the request.
    :rtype dict: JSON-formatted response content from Amazon.
    """
    url = 'https://api.amazon.com/auth/o2/token'
    headers = {
        'Accept': 'application/json',
        'Content-Type': 'application/json; charset=utf-8',
    }
    try:
        response = requests.request(
            method='POST',
            url=url,
            headers=headers,
            timeout=60,
            json=payload,
        )
        try:
            response.raise_for_status()
        except requests.exceptions.HTTPError:
            _logger.error("Unexpected error, during authentication")
            return {
                "error": "Unexpected error, during authentication"
            }
    except (requests.exceptions.ConnectionError, requests.exceptions.Timeout):
        _logger.error("Could not establish the connection to the authentication endpoint.")
        return {
            "error": "Could not establish the connection to the authentication endpoint."
        }
    data = response.json()
    return data

#=== API COMMUNICATIONS ===#

def make_sp_api_request(account, operation, path_parameter='', payload=None, method='GET'):
    """ Make a request to the SP-API for the specified operation.

    See https://developer-docs.amazon.com/sp-api/docs/connecting-to-the-selling-partner-api.

    Note: account.ensure_one()

    :param recordset account: The Marketplace account on behalf of which the request is made.
    :param str operation: The SP-API operation to be called by the request.
    :param str path_parameter: The variable that SP-API paths are interpolated with.
    :param dict payload: The payload of the request.
    :param string method: The HTTP method of the request ('GET' or 'POST').
    :return: The JSON-formatted content of the response.
    :rtype: dict
    :raise ValidationError: If an HTTP error occurs.
    :raise AmazonRateLimitError: If the rate limit was reached.
    """
    account.ensure_one()

    # Build the request URL based on the API path and domain.
    path = const.API_OPERATIONS_MAPPING[operation]['url_path'].format(param=path_parameter)
    domain = const.API_DOMAINS_MAPPING[account.amazon_base_marketplace_id.region]
    url = url_join(domain, path)

    payload = payload or {}

    # Refresh the credentials used to sign the request.
    if const.API_OPERATIONS_MAPPING[operation]['restricted_resource_path'] is None:  # No RDT is required
        # refresh_access_token(account)
        access_token = account.amazon_access_token
    else:  # The operation requires an RDT to access restricted data.
        refresh_restricted_data_token(account)
        access_token = account.amazon_restricted_data_token

    # Build the request headers
    host = url_parse(domain).netloc
    now = datetime.utcnow()
    headers = {
        'Accept': 'application/json',
        'Content-Type': 'application/json; charset=utf-8',
        'host': host,
        'x-amz-access-token': access_token,
        'x-amz-date': now.strftime('%Y%m%dT%H%M%SZ'),
    }
    try:
        if method == 'GET':
            response = requests.request(
                method=method,
                url=url,
                params=payload,
                headers=headers,
                timeout=60,
            )
        else:  # 'POST'
            response = requests.request(
                method=method,
                url=url,
                json=payload,
                headers=headers,
                timeout=60,
            )
        try:
            response.raise_for_status()
        except requests.exceptions.HTTPError:
            if response.status_code == 429:
                return {"error": "Amazon rate limit error."}
            else:
                errors = response.json().get('errors')
                error_code = errors and errors[0].get('code')
                error_message = errors and errors[0].get('message')
                _logger.exception(
                    f"Invalid API request\n error code: {error_code},\n description: {error_message}",
                )
                return {"error": f"The communication with the API failed.\nError code: {error_code}; description: {error_message}"}
    except (requests.exceptions.ConnectionError, requests.exceptions.Timeout):
        _logger.exception("Unable to reach endpoint at %s", url)
        return {'error': "Could not establish the connection to the API."}
    json_response = response.json()
    _logger.info(f"Successfully fetched response from SPAPI for {operation} operation")
    return json_response

#=== Credentials ===#

def refresh_access_token(account):
    """ Request a new LWA access token if it is expired and save it on the account.

    :params account: record of marketplace.account
    :return: None
    """
    account.ensure_one()
    if datetime.utcnow() > account.amazon_access_token_expiry - timedelta(minutes=5):
        payload = {
            'grant_type': 'refresh_token',
            'refresh_token': account.amazon_refresh_token,
            'client_id': account.amazon_client_id,
            'client_secret': account.amazon_client_secret,
        }
        response_content = make_authentication_request(payload=payload)
        if response_content.get('error'):
            raise ValidationError(
                "Could not retrieve the access token from Amazon. "
                "Please ensure your Amazon credentials are correct and try again.\n\n"
                "Error details: %s" % response_content.get('error')
            )
        account.write({
            'amazon_access_token': response_content['access_token'],
            'amazon_access_token_expiry': datetime.utcnow() + timedelta(
                seconds=response_content['expires_in']
            ),
        })

def refresh_restricted_data_token(account):
    """ Request a new Restricted Data Token (RDT) if it is expired and save it on the account.

    The request includes the restricted path of all restricted operation to avoid refreshing the RDT
    for each new operation.

    :params account: record of marketplace.account
    :return: None
    """
    if datetime.utcnow() > account.amazon_restricted_data_token_expiry - timedelta(minutes=5):
        all_restricted_operations = [
            k for k, map in const.API_OPERATIONS_MAPPING.items() if map['restricted_resource_path']
        ]
        OPERATIONS_MAPPING = const.API_OPERATIONS_MAPPING
        payload = {
            'restrictedResources': [{
                'method': 'GET',
                'path': OPERATIONS_MAPPING[operation]['restricted_resource_path'],
                'dataElements': OPERATIONS_MAPPING[operation]['restricted_resource_data_elements'],
            } for operation in all_restricted_operations]
        }
        response_content = make_sp_api_request(
            account, 'createRestrictedDataToken', payload=payload, method='POST'
        )
        if response_content.get('error'):
            raise ValidationError(
                "Could not retrieve the restricted data token from Amazon. "
                "Please ensure your Amazon credentials are correct and try again.\n\n"
                "Error details: %s" % response_content.get('error')
            )
        account.write({
            'amazon_restricted_data_token': response_content['restrictedDataToken'],
            'amazon_restricted_data_token_expiry': datetime.utcnow() + timedelta(
                seconds=response_content['expiresIn']
            ),
        })

def exchange_authorization_code(account, authorization_code):
    """ Exchange the LWA authorization code for the LWA refresh token and save it on the account.

    :params account: record of marketplace.account
    :param str authorization_code: The authorization code to exchange with the LWA refresh token.
    :return: None
    """
    payload = {
        'grant_type': 'authorization_code',
        'code': authorization_code,
        'client_id': account.amazon_client_id,
        'client_secret': account.amazon_client_secret,
    }
    response_content = make_authentication_request(payload=payload)
    if response_content.get('error'):
        raise ValidationError(
            "Could not retrieve the refresh token from Amazon. "
            "Please ensure your Amazon credentials are correct and try again.\n\n"
            "Error : %s" % response_content.get('error')
        )
    account.amazon_refresh_token = response_content['refresh_token']
    account.state = 'connected'

#=== FEEDS MANAGEMENT ===#

def build_feed_messages(inventory_data):
    """ Build a feed message based on provided inventory data

    :params inventory_data(list of dict): [{'offer': recordset of marketplace.offer, 'quantity': quantity of matched product of particular offer}, ...]
    :return: list of feed messages.
    :rtype: list of dict.
    """
    return [
        {
            'messageId': fields.Datetime.now(),
            'sku': data['offer'].sku,
            'operationType': 'PARTIAL_UPDATE',
            'productType': data['offer'].amazon_product_type,
            'attributes': {
                'fulfillment_availability': [{
                    'fulfillment_channel_code': 'DEFAULT',
                    'quantity': data['quantity'],
                }]
            }
        }
        for data in inventory_data
    ]

def build_json_feed(account, messages):
    """ Build JSON feed data to be sent to the SP-API.

    https://github.com/amzn/selling-partner-api-models/blob/main/schemas/feeds/listings-feed-schema-v2.json

    param account: record of marketplace.account
    :param list[dict] messages: The list of messages to include in the feed. See the reference for
        message format.
    :return: The JSON encoded feed.
    :rtype: str
    """
    return json.dumps(
        {
            'header': {
                'sellerId': account.seller_key,
                'version': '2.0',
                'issueLocale': account.env.lang,
            },
            'messages': [
                {
                    **message,  # Allow message to override `messageId`
                    'messageId': int(datetime.utcnow().timestamp() + i) % 2147483647 + 1,
                }
                for i, message in enumerate(messages)
            ],
        },
        separators=(',', ':'),
    )

def submit_feed(account, feed, feed_type, feed_content_type=None):
    """ Submit the provided feed to the SP-API.

    :param account: recordset of marketplace.account
    :param str feed: The feed to submit.
    :param str feed_type: The type of the feed to submit. E.g., 'JSON_LISTINGS_FEED'.
    :param str feed_content_type: The mimetype of the content. E.g., 'application/json'.
    :return: The feed id returned by the SP-API.
    :rtype: str
    """

    feed_content_type = feed_content_type or 'text/xml; charset=UTF-8'

    def _create_feed_document():
        """ Create a feed document.

        :return: The feed document id and the pre-signed URL to upload the feed to.
        :rtype: tuple[str, str]
        """
        _payload = {'contentType': feed_content_type}
        _response_content = make_sp_api_request(
            account, 'createFeedDocument', payload=_payload, method='POST'
        )
        if _response_content.get('error'):
            raise ValidationError(account.env._(
                "Could not create the feed document on Amazon. "
                "Please ensure your Amazon credentials are correct and try again.\n\n"
                "Error details: %s" % _response_content.get('error')
            ))
        return _response_content['feedDocumentId'], _response_content['url']

    def _upload_feed_data():
        """ Upload the feed to the URL returned by Amazon.

        :return: None
        """
        headers = {'content-Type': feed_content_type}
        try:
            response = requests.request(method='PUT', url=upload_url, data=feed, headers=headers, timeout=60)
            try:
                response.raise_for_status()
            except requests.exceptions.HTTPError:
                _logger.exception("Invalid API request with data:\n%s", feed)
                raise ValidationError(account.env._("The communication with the API failed."))
        except (requests.exceptions.ConnectionError, requests.exceptions.Timeout):
            _logger.exception("Could not establish the connection to the feed URL.")
            raise ValidationError(account.env._("Could not establish the connection to the feed URL."))

    def _create_feed():
        """ Create the feed and return its id.

        :return: The feed id.
        :rtype: str
        """
        _payload = {
            'feedType': feed_type,
            'marketplaceIds': account.amazon_base_marketplace_id.api_ref,
            'inputFeedDocumentId': feed_document_id,
        }
        _response_content = make_sp_api_request(
            account, 'createFeed', payload=_payload, method='POST'
        )
        if _response_content.get('error'):
            raise ValidationError(account.env._(
                "Could not create the feed on Amazon. "
                "Please ensure your Amazon credentials are correct and try again.\n\n"
                "Error details: %s" % _response_content.get('error')
            ))
        return _response_content['feedId']

    feed_document_id, upload_url = _create_feed_document()
    _upload_feed_data()
    feed_id = _create_feed()
    return feed_id

def confirm_shipment(account, deliveries):
    """ Send a confirmation request for each of the current deliveries to Amazon.

    :param account: record of marketplace.account
    :param record deliveries: The recordset of `stock.picking`  deliveries to confirm on Amazon.
    :return: None
    """
    def build_feed_messages(root_):
        """ Build the 'Message' elements to add to the feed(shipping feed).

        :param Element root_: The root XML element to which messages should be added.
        :return: None
        """
        for picking_ in deliveries:
            # Build the message base.
            message_ = ElementTree.SubElement(root_, 'Message')
            order_fulfillment_ = ElementTree.SubElement(message_, 'OrderFulfillment')
            amazon_order_ref_ = picking_.sale_id.marketplace_order_identifier
            ElementTree.SubElement(order_fulfillment_, 'AmazonOrderID').text = amazon_order_ref_
            shipping_date_ = fields.Datetime.now().isoformat()
            ElementTree.SubElement(order_fulfillment_, 'FulfillmentDate').text = shipping_date_

            # Add the fulfillment data.
            fulfillment_data_ = ElementTree.SubElement(order_fulfillment_, 'FulfillmentData')
            ElementTree.SubElement(
                fulfillment_data_, 'CarrierName'
            ).text = get_formatted_carrier_name(picking_)
            ElementTree.SubElement(
                fulfillment_data_, 'ShippingMethod'
            ).text = picking_.carrier_id.name
            ElementTree.SubElement(
                fulfillment_data_, 'ShipperTrackingNumber'
            ).text = picking_.carrier_tracking_ref

            # confirmed_order_lines_ = get_confirmed_order_lines(picking_)
            # items_data_ = confirmed_order_lines_.mapped(
                # lambda l_: (l_.amazon_item_ref, l_.product_uom_qty)
            # )  # Take the quantity from the sales order line in case the picking contains a BoM.
            # Add the items.
            items_data_ = {
                move_id.sale_line_id.marketplace_line_identifier: move_id.quantity
                for move_id in picking_.move_ids
                if move_id.sale_line_id and
                move_id.sale_line_id.marketplace_line_identifier
            }
            for amazon_item_ref_, item_quantity_ in items_data_.values():
                item_ = ElementTree.SubElement(order_fulfillment_, 'Item')
                ElementTree.SubElement(item_, 'AmazonOrderItemCode').text = amazon_item_ref_
                ElementTree.SubElement(item_, 'Quantity').text = str(int(item_quantity_))

            # Add the shipping location.
            location_ = picking_.partner_id
            if  not (location_ and location_.street and location_.country_id.code):
                raise UserError(
                    ("Amazon require certain information for the shipping location. Please make"
                     " sure the following information are set on '%(location_name)s' (%(location)s): street, country and"
                     " country code."),
                      location_name=location_.display_name, location=location_
                )
            ship_from_ = ElementTree.SubElement(order_fulfillment_, 'ShipFromAddress')
            ElementTree.SubElement(ship_from_, 'Name').text = location_.name[:30]
            ElementTree.SubElement(ship_from_, 'AddressFieldOne').text = location_.street[:180]
            ElementTree.SubElement(ship_from_, 'CountryCode').text = location_.country_id.code

    xml_feed = build_feed(account, 'OrderFulfillment', build_feed_messages)
    try:
        feed_ref = submit_feed(
            account,
            xml_feed,
            'POST_ORDER_FULFILLMENT_DATA',
        )
    except ValidationError as error:
        raise ValidationError(str(error))

def build_feed(account, message_type, messages_builder, *args, **kwargs):
    """ Build XML feed data to be sent to the SP-API.

    :param recordset account: The Marketplace account on behalf of which the feed should be built, as an
                              `marketplace.account` record.
    :param str message_type: The category of the feed to be built.
    :param function messages_builder: The function to build the 'Message' elements.
    :param list args: The arguments to pass to the `messages_builder` function.
    :param dict kwargs: The keyword arguments to pass to the `messages_builder` function.
    :return: The XML feed.
    :rtype: str
    """
    XSI = 'http://www.w3.org/2001/XMLSchema-instance'
    root = ElementTree.Element(
        'AmazonEnvelope', {f'{"{" + XSI + "}"}noNamespaceSchemaLocation': 'amzn-envelope.xsd'}
    ) 
    header = ElementTree.SubElement(root, 'Header')
    ElementTree.SubElement(header, 'DocumentVersion').text = '1.01'
    ElementTree.SubElement(header, 'MerchantIdentifier').text = account.amazon_seller_key
    ElementTree.SubElement(root, 'MessageType').text = message_type
    messages_builder(root, *args, **kwargs)
    for i, message in enumerate(root.findall('Message')):
        message_id = ElementTree.Element('MessageID')
        message_id.text = f'{int(datetime.utcnow().timestamp())}{i}'
        message.insert(0, message_id)  # Insert the message ID before the other elements.
    return ElementTree.tostring(root, encoding='UTF-8', method='xml')

def get_formatted_carrier_name(picking):
    """ Return the formatted carrier name.

    If a carrier is set and it is not a custom carrier, search for its Amazon-formatted name. If
    it is a custom carrier or if it is not supported by Amazon, fallback on the carrier name.
    """
    picking.ensure_one()

    shipper_name = None
    if picking.carrier_id:
        carrier_key = picking.carrier_id._get_delivery_type()  # Get the final delivery type
        if carrier_key in ('fixed', 'base_on_rule'):  # The delivery carrier is a custom one
            carrier_key = picking.carrier_id.name  # Fallback on the carrier name
        carrier_key = ''.join(filter(str.isalnum, carrier_key)).lower()  # Normalize the key
        shipper_name = const.AMAZON_CARRIER_NAMES_MAPPING.get(carrier_key, picking.carrier_id.name)
    return shipper_name

# #=== CUSTOM EXCEPTION CLASSES ===#

# class AmazonRateLimitError(Exception):
#     """ When the API rate limit of Amazon is reached. """

#     def __init__(self, operation):
#         self.operation = operation
#         super().__init__()

# def get_feed_document(account, document_ref):
#     """ Return the document corresponding to the provided document reference.

#     The document reference is first used to fetch the URL of the document; the document is then read
#     directly from that URL.

#     :param amazon.account account: The Amazon account on behalf of which the document is fetched.
#     :param str document_ref: The reference of the document.
#     :return: The document content as a `dict` or `ElementTree.Element` depending on the feed type
#              this document originates from.
#     :raise ValidationError: If an HTTP error occurs.
#     """
#     document_infos = make_sp_api_request(account, 'getFeedDocument', path_parameter=document_ref)
#     document_url = document_infos['url']
#     try:
#         response = requests.get(document_url, timeout=60)
#         response.raise_for_status()
#         document = response.content
#         if document_infos.get('compressionAlgorithm') == 'GZIP':
#             document = gzip.decompress(document)
#         if 'application/json' in response.headers.get('Content-Type', ''):
#             document = json.loads(document)
#         else:
#             document = ElementTree.fromstring(document)
#     except (requests.exceptions.ConnectionError, requests.exceptions.Timeout):
#         _logger.exception(
#             "Could not establish the connection to download the feed document at %s", document_url
#         )
#         raise ValidationError(account.env._("Could not establish the connection to the API."))
#     except requests.exceptions.HTTPError:
#         _logger.exception(
#             "Invalid API request while downloading the feed document at %s", document_url
#         )
#         raise ValidationError(account.env._("The communication with the API failed."))
#     except (ElementTree.ParseError, json.JSONDecodeError):
#         _logger.exception("Could not parse the feed document at %s", document_url)
#         raise ValidationError(account.env._("Could not process the feed document send by Amazon."))
#     return document

# #=== HELPERS ====#

# @contextmanager
# def preserve_credentials(account):
#     """ Context manager to load credentials from the account and save them again when exiting.

#     Use this in situations where the cache is invalidated and you need to re-use the credentials.

#     :param recordset account: The Amazon account whose credentials must be preserved, as a
#                               `amazon.account` record.
#     :return: None
#     """
#     fields_to_preserve = [
#         'amazon_access_token',
#         'amazon_access_token_expiry',
#         'amazon_restricted_data_token',
#         'amazon_restricted_data_token_expiry',
#     ]
#     credentials = {field: account[field] for field in fields_to_preserve}  # Load credentials.
#     yield  # Execute the code in the context.
#     account.write(credentials)  # Restore credentials.
