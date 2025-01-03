import logging

import requests
from werkzeug.urls import url_join

from odoo import _, api, fields, models

from odoo.addons.hr_expense_stripe.utils import get_publishable_key, get_secret_key, API_VERSION
from odoo.exceptions import UserError, ValidationError

_logger = logging.getLogger(__name__)


class StripeIssuing(models.AbstractModel):
    _name = 'stripe.issuing'
    _description = 'Stripe Issuing object helper'

    stripe_id = fields.Char(string='Stripe ID', readonly=True, copy=False, index='trigram')
    requires_stripe_sync = fields.Boolean(compute='_compute_requires_stripe_sync', compute_sudo=True)

    def _compute_requires_stripe_sync(self):
        """
        Used to activate the synchronization to stripe of a model that may or may not require it.
        In order to disable sending stripe data if conditions or models do not require it
        """
        stripe_activated = self.env['ir.config_parameter'].get_param('hr_expense_stripe.stripe_issuing_activated', False)
        for record in self:
            record.requires_stripe_sync = stripe_activated

    @api.model
    def _get_stripe_mode(self):
        """ Helper to get the mode in which the database is set, it should always be live unless a test database is created"""
        return self.env['ir.config_parameter'].sudo().get_param('hr_expense_stripe.stripe_mode', 'live')

    @api.model
    def _get_publishable_key(self):
        """ Return the publishable key for Stripe.

        Note: This method serves as a hook for modules that would fully implement Stripe Connect.
        :return: The publishable key
        :rtype: str
        """
        mode = self._get_stripe_mode()
        return self.env['ir.config_parameter'].sudo().get_param(f'hr_expense_stripe.stripe_publishable_{mode}_key', get_publishable_key())

    @api.model
    def _get_secret_key(self):
        """ Return the secret key for Stripe.

        Note: This method serves as a hook for modules that would fully implement Stripe Connect.
        :return: The secret key
        :rtype: str
        """
        mode = self._get_stripe_mode()
        return self.env['ir.config_parameter'].sudo().get_param(f'hr_expense_stripe.stripe_secret_{mode}_key', get_secret_key())

    @api.model
    def _stripe_get_endpoint(self, extra_url=''):
        """
        Helper to be overridden by new models to access stripe endpoints
        :param str extra_url: Optional URL string to append to the stripe endpoint (usually a stripe id)
        :return: The stripe endpoint
        :rtype: str
        """
        if extra_url:
            if isinstance(extra_url, str):
                extra_url = [extra_url]
            return '/'.join(('issuing', *(part for part in extra_url if part)))
        return 'issuing'

    @api.model
    def _stripe_get_synchronized_fields(self):
        """
        Hook to extend, determines which field change should be sent to stripe to keep them synchronized
        :return: {odoo_field: stripe_field} matching pairs
        :rtype: dict
        """
        return {'id': 'metadata[odoo_id]'}

    @api.model
    def _stripe_required_fields(self):
        """
        Hook to override, used to determine which field is required by stripe,
        it takes the for of a dict with an application-form key and an error message to raise as a value if the key is missing.
        Example: {'name': _("The cardholder full name")}
        return: {stripe_field: UserError message}
        rtype: dict
        """
        return {}

    @api.model
    def _validate_stripe_object_requirements(self, stripe_object, create_fields=None):
        """
        Check that the model contains fields required by stripe and raises a warning early, to avoid useless requests and clearer messages
        :param dict[str, any] stripe_object: Stripe request returned  object
        :param dict[str, any] | None create_fields: In some cases, some fields are only required at the creation and cannot be updated later
        """
        required_fields = self._stripe_required_fields()
        if create_fields:
            required_fields.update(create_fields)
        missing_fields = {required_field for required_data, required_field in required_fields.items() if not stripe_object.get(required_data)}
        if missing_fields:
            missing_lines = ''.join((_("\n- %(missing_field)s", missing_field=missing_field) for missing_field in missing_fields))
            raise UserError(_("Stripe requires these informations, please update them: %(missing_fields)s", missing_fields=missing_lines))

    def _stripe_build_object(self, create=None):
        """
        Hook to extend, used to format the record fields into a payload dictionary understandable by stripe
        :param bool create: In some cases, some fields are only required at the creation and cannot be updated later.
        """
        return {'metadata[odoo_id]': self.id}

    @api.model
    def _stripe_send_data(self):
        """ Send the updated data to stripe. """
        return_data_per_record_id = {}
        for record in self.filtered('requires_stripe_sync'):
            record._stripe_fetch_id()
            if not record.stripe_id:
                return_data = record._stripe_make_request(
                    endpoint=record._stripe_get_endpoint(),
                    method='POST',
                    payload=record._stripe_build_object(create=True),
                )
                record.stripe_id = return_data.get('id', False)
            else:
                return_data = record._stripe_make_request(
                    endpoint=record._stripe_get_endpoint(record.stripe_id),
                    method='POST',
                    payload=record._stripe_build_object(),
                )
            return_data_per_record_id[record.id] = return_data
        return return_data_per_record_id

    @api.model
    def _stripe_make_request(self, endpoint, payload=None, method='POST', offline=False, idempotency_key=None):
        """
        Make a request to Stripe API at the specified endpoint.

        Note: self.ensure_one()

        :param str endpoint: The endpoint to be reached by the request
        :param dict payload: The payload of the request
        :param str method: The HTTP method of the request
        :param bool offline: Whether the operation of the transaction being processed is 'offline'
        :param str idempotency_key: The idempotency key to pass in the request.
        :return The JSON-formatted content of the response
        :rtype: dict
        :raise: ValidationError if an HTTP error occurs
        """

        url = url_join('https://api.stripe.com/v1/', endpoint)
        headers = {
            'AUTHORIZATION': f'Bearer {self._get_secret_key()}',
            'Stripe-Version': API_VERSION,  # SetupIntent requires a specific version.
        }
        if method == 'POST' and idempotency_key:
            headers['Idempotency-Key'] = idempotency_key
        try:
            response = requests.request(method, url, data=payload, headers=headers, timeout=60)
            # Stripe can send 4XX errors for payment failures (not only for badly-formed requests).
            # Check if an error code is present in the response content and raise only if not.
            # See https://stripe.com/docs/error-codes.
            # If the request originates from an offline operation, don't raise to avoid a cursor
            # rollback and return the response as-is for flow-specific handling.
            if not response.ok \
                    and not offline \
                    and 400 <= response.status_code < 500 \
                    and response.json().get('error'):  # The 'code' entry is sometimes missing
                try:
                    response.raise_for_status()
                except requests.exceptions.HTTPError:
                    _logger.exception("invalid API request at %s with data %s", url, payload)
                    error_msg = response.json().get('error', {}).get('message', '')
                    raise ValidationError(
                        "Stripe: " + _(
                            "The communication with the API failed.\n"
                            "Stripe gave us the following info about the problem:\n'%s'", error_msg
                        )
                    )
        except requests.exceptions.ConnectionError:
            _logger.exception("unable to reach endpoint at %s", url)
            raise ValidationError("Stripe: " + _("Could not establish the connection to the API."))
        return response.json()

    @api.model
    def _stripe_search_filters(self):
        """
        To be extended, used to define which fields can be used to filter the search of specific record on stripe.
        :return: {stripe_field: record_value} pairing dict
        :rtype: dict[str, any]
        """
        return {'status': 'active'}

    @api.model
    def _convert_stripe_data_to_odoo_vals(self, stripe_data):
        """
        Hook to extend, used to convert a stripe model response into an odoo write/create dictionary
        :param dict[str, any] stripe_data: Stripe data
        :return: {odoo_field: odoo_value} or an empty dict if the data is invalid (test data for example)
        rtype: dict[str, any]
        """
        stripe_id = stripe_data.pop('id')
        return {'stripe_id': stripe_id, 'company_id': self.env.company.id}

    def _stripe_search_object(self, filters=None):
        """
        Fetch the record data on stripe, trying with the stripe_id if present, else defaulting to a filtered fetch.
        Matching is made through the metadata
        :param dict[str, any] | None filters: Additional filters to fine-tune the search (unused if the record has a stripe_id)
        :return: Matching stripe record (empty dict if none was found).
        :rtype: dict[str, any]
        """
        self.ensure_one()
        endpoint = self._stripe_get_endpoint(extra_url=self.stripe_id or '')
        if self.stripe_id:
            return self._stripe_make_request(endpoint=endpoint, method='GET').get('data', {})

        payload = self._stripe_search_filters()
        payload.update(filters or {})
        responses = self._stripe_make_request(endpoint=endpoint, method='GET', payload=payload).get('data', {})
        if not responses:
            return {}
        for response in sorted(responses, key=lambda r: r['status'] != 'active'):
            odoo_id = response.get('metadata', {}).get('odoo_id')
            if odoo_id and int(odoo_id) == self.id:
                return response
        return {}

    def _stripe_fetch_id(self):
        """
        Returns the record stripe_id, whether it be already present on the record itself or through a search request to stripe
        :return: Stripe ID, if found
        :rtype: str | bool
        """
        self.ensure_one()
        if self.stripe_id:
            return self.stripe_id
        fetched_stripe_data = self._stripe_search_object()
        if fetched_stripe_data:
            self.stripe_id = fetched_stripe_data['id']
            return self.stripe_id
        return False

    def _create_from_stripe(self, vals):
        """
        Hook to override, to create a record from data fetched from stripe
        :param list[dict[str, any]] vals: List of dictionaries, all containing a "stripe_id" key and corresponding value
        :return: The created recordset
        :rtype: recordset
        """
        return []

    def _update_from_stripe(self, vals):
        """
        Hook to override, to update a record from data fetched from stripe
        Takes the form of a dict {stripe_id: dict}
        :param dict[str, dict] vals: {stripe_id: stripe_record} dictionary to update the recordset from
        """
        return None

    @api.model_create_multi
    def create(self, vals_list):
        res = super().create(vals_list)
        res._stripe_send_data()
        return res

    def write(self, vals):
        res = super().write(vals)
        fields_to_synchronize = set(self._stripe_get_synchronized_fields().keys())
        if 'stripe_id' not in vals and any(key in fields_to_synchronize for key in vals.keys()):  # Avoid the api call when we just set the stripe_id
            self._stripe_send_data()
        return res

    def unlink(self):
        for record in self.filtered('stripe_id'):
            record._stripe_make_request(self._stripe_get_endpoint(record.stripe_id), method='POST', payload={'status': 'inactive'})
        return super().unlink()

    @api.model
    def _fetch_stripe(self):
        """ Populate an odoo model from stripe data """
        self.check_access('create')
        self.check_access('write')
        check_active = self.env.context.get('stripe_active_test', True)
        payload = {'limit': 100}
        if check_active:
            payload['status'] = 'active'

        raw_fetched_data = self._stripe_make_request(self._stripe_get_endpoint(), method='GET', payload=payload).get('data', [])
        while raw_fetched_data:
            fetched_data = {row['id']: row for row in raw_fetched_data}
            payload.update({'starting_after': raw_fetched_data[-1]['id']})
            stripe_ids_in_process = set(fetched_data.keys())
            existing_records = self.env[self._name].search([('stripe_id', 'in', tuple(stripe_ids_in_process))])
            non_existing_record_ids = stripe_ids_in_process - set(existing_records)

            if existing_records:
                existing_records._update_from_stripe(fetched_data)

            if non_existing_record_ids:
                create_vals = [
                    {'stripe_id': non_existing_record_id, **fetched_data[non_existing_record_id]}
                    for non_existing_record_id in non_existing_record_ids
                ]
                self.env[self._name]._create_from_stripe(create_vals)

            # Continue to browse
            raw_fetched_data = self._stripe_make_request(self._stripe_get_endpoint(), method='GET', payload=payload).get('data', [])
