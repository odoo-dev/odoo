import json
import logging
import time
import urllib.parse
import urllib3
import websocket

from threading import Thread

from odoo.addons.hw_drivers import main
from odoo.addons.hw_drivers.tools import helpers

_logger = logging.getLogger(__name__)
websocket.enableTrace(True, level=logging.getLevelName(_logger.getEffectiveLevel()))

<<<<<<< HEAD
def send_to_controller(device_type, params):
||||||| parent of 2796af294c36 (temp)

def send_to_controller(print_id, device_identifier, iot_mac):
=======

def send_to_controller(print_id, device_identifier):
>>>>>>> 2796af294c36 (temp)
    """
    Confirm the operation's completion by sending a response back to the Odoo server
    """
    routes = {
        "printer": "/iot/printer/status",
    }
    params['iot_mac'] = helpers.get_mac_address()
    server_url = helpers.get_odoo_server_url() + routes[device_type]
    try:
        urllib3.disable_warnings()
        http = urllib3.PoolManager(cert_reqs='CERT_NONE')
        http.request(
            'POST',
<<<<<<< HEAD
            server_url,
            body=json.dumps({'params': params}).encode('utf8'),
||||||| parent of 2796af294c36 (temp)
            server + "/iot/printer/status",
            body=json.dumps(
                {'params': {
                    'print_id': print_id,
                    'device_identifier': device_identifier,
                    'iot_mac': iot_mac,
                    }}).encode('utf8'),
=======
            server + "/iot/printer/status",
            body=json.dumps(
                {'params': {
                    'print_id': print_id,
                    'device_identifier': device_identifier,
                    'iot_mac': helpers.get_mac_address(),
                    }}).encode('utf8'),
>>>>>>> 2796af294c36 (temp)
            headers={
                'Content-type': 'application/json',
                'Accept': 'text/plain',
            },
        )
    except Exception:
        _logger.exception('Could not reach confirmation status URL: %s', server_url)


def on_message(ws, messages):
    """
        When a message is receive, this function is triggered
        The message is load and if its type is 'iot_action', is sent to the device
    """
    messages = json.loads(messages)
<<<<<<< HEAD
    for message in messages:
        if message['message']['type'] == 'iot_action':
            payload = message['message']['payload']
            if helpers.get_mac_address() in payload['iotDevice']['iotIdentifiers']:
||||||| parent of 2796af294c36 (temp)
    for document in messages:
        if (document['message']['type'] in ['print', 'iot_action']):
            payload = document['message']['payload']
            iot_mac = helpers.get_mac_address()
            if iot_mac in payload['iotDevice']['iotIdentifiers']:
                #send box confirmation
=======
    for document in messages:
        if (document['message']['type'] in ['print', 'iot_action']):
            payload = document['message']['payload']
            if helpers.get_mac_address() in payload['iotDevice']['iotIdentifiers']:
                #send box confirmation
>>>>>>> 2796af294c36 (temp)
                for device in payload['iotDevice']['identifiers']:
                    if device['identifier'] in main.iot_devices:
<<<<<<< HEAD
                        main.iot_devices[device["identifier"]].action(payload)
||||||| parent of 2796af294c36 (temp)
                        main.iot_devices[device["identifier"]]._action_default(payload)
                        send_to_controller(payload['print_id'], device['identifier'], iot_mac)
=======
                        main.iot_devices[device["identifier"]]._action_default(payload)
                        send_to_controller(payload['print_id'], device['identifier'])
>>>>>>> 2796af294c36 (temp)


def on_error(ws, error):
    _logger.error("websocket received an error: %s", error)


def on_close(ws, close_status_code, close_msg):
    _logger.debug("websocket closed with status: %s", close_status_code)


class WebsocketClient(Thread):
    iot_channel = ""

    def on_open(self, ws):
        """
            When the client is setup, this function send a message to subscribe to the iot websocket channel
        """
        ws.send(
            json.dumps({'event_name': 'subscribe', 'data': {'channels': [self.iot_channel], 'last': 0}})
        )

    def __init__(self, url):
        url_parsed = urllib.parse.urlsplit(url)
        scheme = url_parsed.scheme.replace("http", "ws", 1)
        self.url = urllib.parse.urlunsplit((scheme, url_parsed.netloc, 'websocket', '', ''))
        Thread.__init__(self)

    def run(self):
        self.ws = websocket.WebSocketApp(self.url,
            on_open=self.on_open, on_message=on_message,
            on_error=on_error, on_close=on_close)

        # The IoT synchronised servers can stop in 2 ways that we need to handle:
        #  A. Gracefully:
        #   In this case a disconnection signal is sent to the IoT-box
        #   The websocket is properly closed, but it needs to be established a new connection when
        #   the server will be back.
        #
        # B. Forced/killed:
        #   In this case there is no disconnection signal received
        #
        #   This will also happen with the graceful quit as `reconnect` will trigger if the server
        #   is offline while attempting the new connection
        while True:
            try:
                run_res = self.ws.run_forever(reconnect=10)
                _logger.debug("websocket run_forever return with %s", run_res)
            except Exception:
                _logger.exception("An unexpected exception happened when running the websocket")
            _logger.debug('websocket will try to restart in 10 seconds')
            time.sleep(10)
