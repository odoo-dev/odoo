# Part of Odoo. See LICENSE file for full copyright and licensing details.
"""Restricted JSON HTTP requests for server actions."""

import logging
from urllib.parse import urlsplit

import requests

from odoo import api, models

_logger = logging.getLogger(__name__)


class RequestError(Exception):
    """Opaque failure raised to server action code for invalid or failed requests."""


class IrServerActionRequest(models.AbstractModel):
    _name = "ir.server.action.request"
    _description = "Server Action JSON HTTP Request"

    def _get_allowed_domains(self):
        """Return the list of allowed domains to use in server actions."""
        ICP = self.env["ir.config_parameter"].sudo()
        domains = ICP.get_str("server_action_request_domains", "")
        return {
            domain.strip().lower().rstrip(".")
            for domain in domains.split(",")
            if domain.strip()
        }

    @api.private
    def request(self, method: str, url: str, data=None, headers=None):
        """Send a JSON request and return its decoded JSON response.

        Hostnames must be explicitly listed in the
        ``server_action_request_domains`` system parameter. Redirects are
        disabled so a remote server cannot redirect to a host outside that list.
        """
        try:
            parsed = urlsplit(url)
            hostname = parsed.hostname
            allowed_domains = self._get_allowed_domains()
            allowed_methods = {"GET", "POST", "PUT", "DELETE"}
            if (
                parsed.scheme not in ("http", "https")
                or not hostname
                or hostname.lower().rstrip(".") not in allowed_domains
                or parsed.username is not None
                or parsed.password is not None
                or method.upper() not in allowed_methods
            ):
                raise RequestError

            # Accessing port also rejects malformed port numbers before any I/O.
            parsed.port
            request_headers = dict(headers or {})
            if any(
                key.lower() == "content-type" and value.lower() != "application/json"
                for key, value in request_headers.items()
            ):
                raise RequestError

            request_headers["Content-Type"] = "application/json"
            response = requests.request(
                method.upper(),
                url,
                json=data,
                headers=request_headers,
                timeout=10,
                allow_redirects=False,
            )
            return response.json()
        except (requests.RequestException, ValueError, TypeError, AttributeError):
            _logger.exception("Request failed")
            raise RequestError from None
