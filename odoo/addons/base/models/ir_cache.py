import hashlib
import hmac
import importlib.util
import json
import logging
import secrets
import sys

from odoo import api, fields, models
from odoo.tools import SQL, config

_logger = logging.getLogger(__name__)

# Secret of the signatures when `cache_secret` is not configured. It is
# generated when this module is imported, i.e. by the server before forking
# the workers (base is a server-wide module), so that all the workers share
# it. It is lost on restart: the entries of the previous run are ignored.
_RANDOM_SECRET = secrets.token_bytes(32)
_random_secret_warned = False


def _get_database_key(dbname: str) -> tuple[bytes, bytes]:
    """ Return ``(key_id, key)``: the HMAC key signing the entries of the
    database, and its public identifier. The key never leaves the process:
    it is neither stored, nor sent to the database, nor logged. """
    global _random_secret_warned  # noqa: PLW0603
    if secret := config['cache_secret']:
        secret = secret.encode()
    else:
        secret = _RANDOM_SECRET
        if not _random_secret_warned:
            _random_secret_warned = True
            _logger.warning("No cache_secret configured: the persistent cache (ir.cache) does not survive a restart")
    # A key per database: a valid entry can not be replayed in another
    # database. A key per python version: the marshalled code objects are
    # not portable, the entries of another version are simply not read.
    message = '\0'.join([dbname, sys.version, importlib.util.MAGIC_NUMBER.hex()])
    key = hmac.new(secret, message.encode(), hashlib.sha256).digest()
    return hashlib.sha256(key).digest()[:8], key


def _sign(key: bytes, key_id: bytes, kind: str, cache_key: str, control, hash_: str, data: bytes) -> bytes:
    """ Return the HMAC of everything used when reading an entry. """
    mac = hmac.new(key, digestmod=hashlib.sha256)
    control = json.dumps(control, sort_keys=True)  # canonical, jsonb does not keep the formatting
    for part in (key_id, kind.encode(), cache_key.encode(), control.encode(), hash_.encode(), data):
        mac.update(len(part).to_bytes(8, 'big'))
        mac.update(part)
    return mac.digest()


class IrCache(models.Model):
    """ Persistent cache of data derived from the database, like the compiled
    code of the QWeb templates, shared by the workers and the restarts.

    The entries may be executable (marshalled code objects), and anybody
    may write in the table (ORM, server action, SQL injection, psql...): an
    entry is used only if its signature is valid, see `_get`. The signature
    is computed with a key that only lives in the memory of the server (see
    `_get_database_key`), so a valid entry can only be produced by `_set`.

    The entries are never updated nor invalidated: a new entry is added for
    the same ``(kind, key)`` and the last one is used if it still matches
    its source: its ``hash`` is computed from its ``control`` by an SQL
    expression given by the caller (specific to the ``kind``), when the
    entry is created and when it is read. The old entries are deleted by
    `_gc_cache`.
    """
    _name = 'ir.cache'
    _description = 'Persistent cache'
    _log_access = False
    _allow_sudo_commands = False

    create_date = fields.Datetime(string="Create Date", readonly=True)
    kind = fields.Char(string="Type of the entry", required=True, help="Type of the entry, e.g. 'qweb'")
    key = fields.Char(required=True)
    key = fields.Char(string="Cache Key", required=True, help="Cache Key, e.g. 'website.layout'")
    key_id = fields.Binary(string="Identifier of the key signing the entry", attachment=False, required=True)
    control = fields.Json(string="Validation data identifying", required=True, help="Data identifying the source of the entry, e.g. view ids")
    hash = fields.Char(string="Validation Hash", required=True, help="Hash of the source (computed from the control) when the entry was created")
    data = fields.Binary(attachment=False, required=True)
    signature = fields.Binary(attachment=False, required=True)

    _kind_key_idx = models.Index('(kind, key, key_id, id DESC)')

    @api.model
    def _get(self, kind: str, keys, hash_sql: SQL) -> dict[str, tuple[str, bytes]]:
        """ Return ``{key: (hash, data)}`` for the last entry of each
        key if its signature is valid and its source did not change:
        ``hash_sql`` computed from its ``control`` gives its ``hash``.
        Nothing else is trustworthy: an entry with an invalid signature is
        ignored. """
        key_id, secret = _get_database_key(self.env.cr.dbname)
        rows = self.env.execute_query(SQL("""
            SELECT key, control, hash, data, signature, %s
              FROM (
                SELECT DISTINCT ON (key) * FROM ir_cache
                 WHERE kind = %s AND key = ANY(%s) AND key_id = %s
              ORDER BY key, id DESC
            ) entry
        """, hash_sql, kind, list(keys), key_id))
        result = {}
        for key, control, hash_, data, signature, current_hash in rows:
            data = bytes(data)
            if not hmac.compare_digest(bytes(signature), _sign(secret, key_id, kind, key, control, hash_, data)):
                _logger.warning("ir.cache: invalid signature of the %s entry %r, ignored", kind, key)
            elif hash_ == current_hash:
                result[key] = (hash_, data)
        return result

    @api.model
    def _set(self, kind: str, key: str, control, hash_sql: SQL, data: bytes):
        """ Add a signed entry, with the hash of ``hash_sql`` computed from
        ``control``. This must be done in the transaction that produced
        ``data``: when the transaction is rolled back, the entry is either
        rolled back too, or does not match its source anymore. Nothing is
        stored with a read-only cursor. """
        if self.env.cr.readonly:
            return
        key_id, secret = _get_database_key(self.env.cr.dbname)
        control_json = json.dumps(control)
        [[hash_]] = self.env.execute_query(SQL("SELECT %s FROM (SELECT %s::jsonb AS control) entry", hash_sql, control_json))
        if hash_ is None:
            return
        query = SQL("""
            INSERT INTO ir_cache (create_date, kind, key, key_id, control, hash, data, signature)
            VALUES (NOW() AT TIME ZONE 'UTC', %s, %s, %s, %s, %s, %s, %s)
        """, kind, key, key_id, control_json, hash_, data, _sign(secret, key_id, kind, key, control, hash_, data))
        self.env.cr.execute(query)

    @api.autovacuum
    def _gc_cache(self):
        """ Delete the entries replaced by a newer one, and the entries older
        than `cache_max_age` days (a deleted entry is simply produced again). """
        self.env.cr.execute(SQL("""
            DELETE FROM ir_cache c
             WHERE c.create_date < NOW() AT TIME ZONE 'UTC' - make_interval(days => %s)
                OR EXISTS (
                    SELECT 1 FROM ir_cache n
                     WHERE n.kind = c.kind AND n.key = c.key AND n.key_id = c.key_id AND n.id > c.id
                )
        """, config['cache_max_age']))
        _logger.info("ir.cache: %s entries deleted", self.env.cr.rowcount)
