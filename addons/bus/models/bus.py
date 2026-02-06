import bisect
import datetime
import json
import logging
import math
import os
import queue
import selectors
import threading
import time

from psycopg2 import InterfaceError

import odoo
from odoo import api, fields, models
from odoo.modules.registry import Registry
from odoo.service.server import CommonServer
from odoo.tools import SQL, config, json_default
from odoo.tools.misc import OrderedSet

_logger = logging.getLogger(__name__)

# longpolling timeout connection
TIMEOUT = 50
DEFAULT_GC_RETENTION_SECONDS = 60 * 60 * 24  # 24 hours

# custom function to call instead of default PostgreSQL's `pg_notify`
ODOO_NOTIFY_FUNCTION = os.getenv('ODOO_NOTIFY_FUNCTION', 'pg_notify')


def get_notify_payload_max_length(default=8000):
    try:
        length = int(os.environ.get('ODOO_NOTIFY_PAYLOAD_MAX_LENGTH', default))
    except ValueError:
        _logger.warning("ODOO_NOTIFY_PAYLOAD_MAX_LENGTH has to be an integer, "
                        "defaulting to %d bytes", default)
        length = default
    return length


# max length in bytes for the NOTIFY query payload
NOTIFY_PAYLOAD_MAX_LENGTH = get_notify_payload_max_length()


def fetch_bus_notifications(cr, channels, last=0, ignore_ids=None):
    """Fetch notifications from the bus table.

    :param cr: Database cursor.
    :param channels: List of channels for which notifications should be fetched.
        May contain channel names, model instances, or (model, string) tuples.
    :param last: The ID of the last fetched notification. Defaults to 0.
    :param ignore_ids: IDs to exclude.
    :return: List of notifications.

    """
    conditions = [
        SQL("channel IN %s", tuple(json_dump(channel_with_db(cr.dbname, c)) for c in channels)),
        SQL("create_date > %s", fields.Datetime.now() - datetime.timedelta(seconds=TIMEOUT))
        if last == 0
        else SQL("id > %s", last),
    ]
    if ignore_ids:
        conditions.append(SQL("id NOT IN %s", tuple(ignore_ids)))
    where = SQL(" AND ").join(conditions)
    cr.execute(SQL("SELECT id, message FROM bus_bus WHERE %s ORDER BY id", where))
    return [{"id": r[0], "message": json.loads(r[1])} for r in cr.fetchall()]


# ---------------------------------------------------------
# Bus
# ---------------------------------------------------------
def json_dump(v):
    return json.dumps(v, separators=(',', ':'), default=json_default)


def hashable(key):
    if isinstance(key, list):
        key = tuple(key)
    return key


def channel_with_db(dbname, channel):
    if isinstance(channel, models.Model):
        return (dbname, channel._name, channel.id)
    if isinstance(channel, tuple) and len(channel) == 2 and isinstance(channel[0], models.Model):
        return (dbname, channel[0]._name, channel[0].id, channel[1])
    if isinstance(channel, str):
        return (dbname, channel)
    return channel


def get_notify_payloads(channels):
    """
    Generates the json payloads for the imbus NOTIFY.
    Splits recursively payloads that are too large.

    :param list channels:
    :return: list of payloads of json dumps
    :rtype: list[str]
    """
    if not channels:
        return []
    payload = json_dump(channels)
    if len(channels) == 1 or len(payload.encode()) < NOTIFY_PAYLOAD_MAX_LENGTH:
        return [payload]
    else:
        pivot = math.ceil(len(channels) / 2)
        return (get_notify_payloads(channels[:pivot]) +
                get_notify_payloads(channels[pivot:]))


class BusBus(models.Model):
    _name = "bus.bus"

    _description = "Communication Bus"

    channel = fields.Char("Channel")
    message = fields.Char("Message")

    @api.autovacuum
    def _gc_messages(self):
        gc_retention_seconds = self.env["ir.config_parameter"].sudo().get_int(
            "bus.gc_retention_seconds", DEFAULT_GC_RETENTION_SECONDS
        )
        timeout_ago = fields.Datetime.now() - datetime.timedelta(seconds=gc_retention_seconds)
        # Direct SQL to avoid ORM overhead; this way we can delete millions of rows quickly.
        # This is a low-level table with no expected references, and doing this avoids
        # the need to split or reschedule this GC job.
        self.env.cr.execute("DELETE FROM bus_bus WHERE create_date < %s", (timeout_ago,))

    @api.model
    def _sendone(self, target, notification_type, message):
        """Low-level method to send ``notification_type`` and ``message`` to ``target``.

        Using ``_bus_send()`` from ``bus.listener.mixin`` is recommended for simplicity and
        security.

        When using ``_sendone`` directly, ``target`` (if str) should not be guessable by an
        attacker.
        """
        self._ensure_hooks()
        channel = channel_with_db(self.env.cr.dbname, target)
        self.env.cr.precommit.data["bus.bus.values"].append(
            {
                "channel": json_dump(channel),
                "message": json_dump(
                    {
                        "type": notification_type,
                        "payload": message,
                    }
                ),
            }
        )
        self.env.cr.postcommit.data["bus.bus.channels"].add(channel)

    def _ensure_hooks(self):
        if "bus.bus.values" not in self.env.cr.precommit.data:
            self.env.cr.precommit.data["bus.bus.values"] = []

            @self.env.cr.precommit.add
            def create_bus():
                self.sudo().create(self.env.cr.precommit.data.pop("bus.bus.values"))

        if "bus.bus.channels" not in self.env.cr.postcommit.data:
            self.env.cr.postcommit.data["bus.bus.channels"] = OrderedSet()

            # We have to wait until the notifications are commited in database.
            # When calling `NOTIFY imbus`, notifications will be fetched in the
            # bus table. If the transaction is not commited yet, there will be
            # nothing to fetch, and the websocket will return no notification.
            @self.env.cr.postcommit.add
            def notify():
                payloads = get_notify_payloads(
                    list(self.env.cr.postcommit.data.pop("bus.bus.channels"))
                )
                if len(payloads) > 1:
                    _logger.info(
                        "The imbus notification payload was too large, it's been split into %d payloads.",
                        len(payloads),
                    )
                with odoo.sql_db.db_connect(config['db_system']).cursor() as cr:
                    for payload in payloads:
                        cr.execute(
                            SQL(
                                "SELECT %s('imbus', %s)",
                                SQL.identifier(ODOO_NOTIFY_FUNCTION),
                                payload,
                            )
                        )

    @api.model
    def _poll(self, channels, last=0, ignore_ids=None):
        return fetch_bus_notifications(self.env.cr, channels, last, ignore_ids)

    def _bus_last_id(self):
        last = self.env['bus.bus'].search([], order='id desc', limit=1)
        return last.id if last else 0


stop_event = threading.Event()
CommonServer.on_stop(stop_event.set)

_logger = logging.getLogger(__name__)


class Topic:
    # How much time (in second) the history of last dispatched notifications is
    # kept in memory for each topic.
    # To avoid duplicate notifications, we fetch them based on their ids.
    # However during parallel transactions, ids are assigned immediately (when
    # they are requested), but the notifications are dispatched at the time of
    # the commit. This means lower id notifications might be dispatched after
    # higher id notifications.
    # Simply incrementing the last id is sufficient to guarantee no duplicates,
    # but it is not sufficient to guarantee all notifications are dispatched,
    # and in particular not sufficient for those with a lower id coming after a
    # higher id was dispatched.
    # To solve the issue of missed notifications, the lowest id, stored in
    # ``_last_fetched_id``, is held back by a few seconds to give time for
    # concurrent transactions to finish. To avoid dispatching duplicate
    # notifications, the history of already dispatched notifications during this
    # period is kept in memory in ``history`` and the corresponding
    # notifications are discarded from subsequent dispatching even if their id
    # is higher than ``_last_fetched_id``.
    # In practice, what is important functionally is the time between the create
    # of the notification and the commit of the transaction in business code.
    # If this time exceeds this threshold, the notification will never be
    # dispatched if the target user receive any other notification in the
    # meantime.
    MAX_NOTIFICATION_HISTORY_SEC = 10

    def __init__(self, key, initial_id=0):
        self.key = key
        self.dbname = key[0]
        self._subscribers = set()
        self.state_lock = threading.Lock()
        # Whether a worker is currently processing this topic. Used to
        # prevent concurrent DB fetches for the same channel.
        self.busy = False
        # Whether publish request arrives while busy. Signals the
        # current worker to re-enqueue the topic once done to avoid
        # missed messages.
        self.dirty = False
        # For ``_last_fetched_id and ``_notification_history``, see
        # ``MAX_NOTIFICATION_HISTORY_SEC`` for more details.
        self._last_fetched_id = initial_id
        self._notification_history = []

    def get_fetch_params(self):
        return {
            "channels": [self.key],
            "last": self._last_fetched_id,
            "ignore_ids": [h[0] for h in self._notification_history],
        }

    def subscribe(self, websocket):
        self._subscribers.add(websocket)

    def unsubscribe(self, websocket):
        self._subscribers.discard(websocket)
        return len(self._subscribers) == 0

    def broadcast(self, notifications):
        self._update_history(notifications)
        targets = list(self._subscribers)
        for websocket in targets:
            websocket.send(notifications)

    def _update_history(self, notifications):
        now = time.monotonic()
        for notif in notifications:
            bisect.insort(self._notification_history, (notif["id"], now), key=lambda x: x[0])
        cutoff = now - self.MAX_NOTIFICATION_HISTORY_SEC
        idx = bisect.bisect_left(self._notification_history, cutoff, key=lambda x: x[1])
        if idx > 0:
            self._last_fetched_id = self._notification_history[idx - 1][0]
            self._notification_history = self._notification_history[idx:]


class MessageBroker:
    def __init__(self, pool_size=200):
        self._is_alive = False
        self._pending_topics = queue.Queue()
        self._start_lock = threading.Lock()
        self._topic_by_key = {}
        self.pool_size = pool_size

    def _ensure_started(self):
        # Short path, already initialized: don't bother with the lock.
        if self._is_alive:
            return
        # Get the lock to prevent double thread spawn.
        with self._start_lock:
            if self._is_alive:
                return
            self._is_alive = True
        _logger.info("Bus broker started, pools_size=%d", self.pool_size)
        for i in range(self.pool_size):
            name = f"Bus dispatcher {i}"
            threading.Thread(target=self._dispatcher_loop, name=name, daemon=True).start()
        threading.Thread(
            target=self._database_listener_loop, name="Bus postgres listener", daemon=True
        ).start()

    # ----------------------------------------------------
    # PUB/SUB INTERFACE
    # ----------------------------------------------------

    def subscribe(self, topic_keys, last_id, dbname, websocket):
        self._ensure_started()
        formatted_topic_keys = [hashable(channel_with_db(dbname, c)) for c in topic_keys]
        for name in formatted_topic_keys:
            topic = self._topic_by_key.setdefault(name, Topic(name, last_id))
            topic.subscribe(websocket)

    def unsubscribe(self, websocket):
        topics_snapshot = list(self._topic_by_key.values())
        for topic in topics_snapshot:
            if topic.unsubscribe(websocket):
                self._topic_by_key.pop(topic.key, None)

    def publish(self, topic_keys):
        topics = [self._topic_by_key[k] for k in topic_keys if k in self._topic_by_key]
        for topic in topics:
            with topic.state_lock:
                if not topic.busy:
                    topic.busy = True
                    self._pending_topics.put(topic.key)
                    continue
                topic.dirty = True

    def _dispatcher_loop(self):
        while not stop_event.is_set():
            topic_name = self._pending_topics.get()
            topic = self._topic_by_key.get(topic_name)
            if not topic:
                continue
            try:
                with Registry(topic.dbname).cursor() as cr:
                    notifications = fetch_bus_notifications(cr, **topic.get_fetch_params())
                if notifications:
                    topic.broadcast(notifications)
            finally:
                with topic.state_lock:
                    if topic.dirty:
                        topic.dirty = False
                        self._pending_topics.put(topic_name)  # Still busy as we are re-enqueuing.
                    else:
                        topic.busy = False

    # ----------------------------------------------------
    # DATABASE SIGNALING
    # ----------------------------------------------------

    def _database_listener_loop(self):
        db_system = config["db_system"]
        _logger.info("Bus broker listening on %s", db_system)
        while not stop_event.is_set():
            try:
                with (
                    odoo.sql_db.db_connect(db_system).cursor() as cr,
                    selectors.DefaultSelector() as sel,
                ):
                    cr.execute("listen imbus")
                    cr.commit()
                    conn = cr._cnx
                    sel.register(conn, selectors.EVENT_READ)
                    while not stop_event.is_set():
                        if sel.select(TIMEOUT):
                            conn.poll()
                            to_publish = set()
                            while conn.notifies:
                                notify = conn.notifies.pop()
                                payload = json.loads(notify.payload)
                                for c in payload:
                                    to_publish.add(hashable(c))
                            if to_publish:
                                self.publish(to_publish)
            except Exception:
                _logger.exception("Bus broker listener error, retrying...")
                time.sleep(TIMEOUT)


is_evented = hasattr(odoo, "evented") and odoo.evented
pool_size = (config["db_maxconn_gevent"] or config["db_maxconn"]) if is_evented else 10
broker = MessageBroker(pool_size)
