"""Throwaway sampler attributing slow test windows to CPU, cgroup, memory or PostgreSQL waits."""
import collections
import logging
import os
import re
import resource
import sys
import sysconfig
import threading
import time
import traceback

import psycopg2

import odoo
from odoo import sql_db
from odoo.tools import config
from odoo.tools.misc import real_time

_logger = logging.getLogger(__name__)

SAMPLE_EVERY = 2
SUMMARY_EVERY = 5
PG_STALL = 5
STACK_STALL = 10
_LIB_PATHS = tuple({sysconfig.get_paths()[k] for k in ('stdlib', 'purelib', 'platlib')})
_probe = None

ACTIVITY_QUERY = """
    SELECT datname = current_database() AS is_mine, pid, state, wait_event_type, wait_event, query_start,
           extract(epoch FROM now() - query_start)::float AS query_age,
           extract(epoch FROM now() - xact_start)::float AS xact_age,
           left(regexp_replace(query, '\\s+', ' ', 'g'), 300) AS query
      FROM pg_stat_activity
     WHERE pid <> pg_backend_pid() AND backend_type = 'client backend'
"""
DATABASE_QUERY = """
    SELECT blks_read, blks_hit, blk_read_time, temp_bytes,
           (SELECT sum(blks_read) FROM pg_stat_database) AS srv_blks_read,
           (SELECT max(age(backend_xmin)) FROM pg_stat_activity) AS xmin_age,
           (SELECT max(age(backend_xid)) FROM pg_stat_activity) AS xid_age,
           pg_snapshot_xmax(pg_current_snapshot())::text::bigint AS xid_next
      FROM pg_stat_database WHERE datname = current_database()
"""
SLRU_QUERY = """
    SELECT lower(name) AS name, blks_hit, blks_read FROM pg_stat_slru
     WHERE lower(name) IN ('subtrans', 'multixactoffset', 'multixactmember', 'xact', 'committs', 'subtransaction',
                           'multixact_offset', 'multixact_member', 'transaction', 'commit_timestamp')
"""
SUBXACT_QUERY = """
    SELECT count(*) FILTER (WHERE s.subxact_overflowed) AS overflowed, max(s.subxact_count) AS max_count,
           string_agg(pg_stat_get_backend_pid(b.id) || ':' || s.subxact_count
                      || CASE WHEN s.subxact_overflowed THEN ':ovf' ELSE '' END, ',')
               FILTER (WHERE pg_stat_get_backend_dbid(b.id) = (SELECT oid FROM pg_database WHERE datname = current_database())
                       AND pg_stat_get_backend_pid(b.id) <> pg_backend_pid()) AS own
      FROM pg_stat_get_backend_idset() AS b(id) CROSS JOIN LATERAL pg_stat_get_backend_subxact(b.id) AS s
"""
TABLES_QUERY = """
    SELECT relname, n_live_tup, n_dead_tup, n_mod_since_analyze, autovacuum_count, autoanalyze_count,
           extract(epoch FROM now() - last_autovacuum)::int AS vacuum_ago
      FROM pg_stat_user_tables
     WHERE relname IN ('account_account', 'account_tax', 'account_tax_repartition_line', 'account_account_res_company_rel')
"""
AUTOVACUUM_QUERY = """
    SELECT a.datname = current_database() AS is_mine, a.datname, p.relid, p.phase,
           left(regexp_replace(a.query, '\\s+', ' ', 'g'), 80) AS query
      FROM pg_stat_activity a LEFT JOIN pg_stat_progress_vacuum p ON p.pid = a.pid
     WHERE a.backend_type = 'autovacuum worker'
"""


def start():
    """Start the process-wide sampler once, never raising."""
    global _probe  # noqa: PLW0603
    if _probe is None:
        try:
            _probe = Probe()
            _probe.start()
        except Exception:  # noqa: BLE001
            _logger.warning("perf probe disabled", exc_info=True)
            _probe = False


def snapshot():
    """Return the counters used to attribute one class or test, or None when disabled."""
    try:
        return _probe and _probe.snapshot()
    except Exception:  # noqa: BLE001
        return None


def report(kind, name, before, min_wall=0.0):
    """Log the counter deltas since ``before`` when the wall time reaches ``min_wall``."""
    try:
        after = before and snapshot()
        if after and after['wall'] - before['wall'] >= min_wall:
            deltas = ' '.join(
                f'{key}={after[key] - before[key]:.2f}' if isinstance(after[key], float) else
                f'{key}={after[key] - before[key] if before[key] is not None else "na"}'
                for key in after if after[key] is not None
            )
            _logger.info("%s=%s %s", kind, name, deltas)
    except Exception:  # noqa: BLE001
        _logger.warning("perf probe report failed", exc_info=True)


def _read(path):
    try:
        with open(path, encoding='ascii') as f:
            return f.read()
    except OSError:
        return None


def _kv(text):
    return {k: int(v) for k, v in (line.split() for line in (text or '').splitlines() if len(line.split()) == 2)}


def _psi_some(path):
    match = re.search(r'^some avg10=([\d.]+)', _read(path) or '', re.M)
    return match and match[1]


def _cgroup():
    """Return the cgroup counters of this process, trying v2 then v1, empty when unreadable."""
    rel = next((line[3:] for line in (_read('/proc/self/cgroup') or '').splitlines() if line.startswith('0::')), None)
    base = next((d for d in (f'/sys/fs/cgroup{rel}' if rel else None, '/sys/fs/cgroup') if d and os.path.exists(f'{d}/cpu.stat')), None)
    if base:
        cpu, mem = _kv(_read(f'{base}/cpu.stat')), _kv(_read(f'{base}/memory.stat'))
        return {
            'thr': cpu.get('nr_throttled'), 'thr_ms': cpu.get('throttled_usec', 0) // 1000,
            'mem_mb': int(_read(f'{base}/memory.current') or 0) >> 20,
            'max_mb': (_read(f'{base}/memory.max') or 'na').strip(), 'pgmajfault': mem.get('pgmajfault'),
            'psi_cpu': _psi_some(f'{base}/cpu.pressure'), 'psi_io': _psi_some(f'{base}/io.pressure'),
        }
    cpu = _kv(_read('/sys/fs/cgroup/cpu,cpuacct/cpu.stat') or _read('/sys/fs/cgroup/cpu/cpu.stat'))
    mem = _kv(_read('/sys/fs/cgroup/memory/memory.stat'))
    return {
        'thr': cpu.get('nr_throttled'), 'thr_ms': cpu.get('throttled_time', 0) // 1000000,
        'mem_mb': int(_read('/sys/fs/cgroup/memory/memory.usage_in_bytes') or 0) >> 20,
        'max_mb': int(_read('/sys/fs/cgroup/memory/memory.limit_in_bytes') or 0) >> 20,
        'pgmajfault': mem.get('total_pgmajfault'),
    } if cpu or mem else {}


def _delta(new, old, keys):
    return ' '.join(f'{k}={new[k] - old[k]}' for k in keys if new.get(k) is not None and old.get(k) is not None)


class Probe(threading.Thread):
    def __init__(self):
        super().__init__(name='perf_probe', daemon=True)
        self.dbname = config['db_name'][0]
        self.main = threading.main_thread()
        self.lock = threading.Lock()
        self.cnx = None
        self.ash_db = collections.Counter()
        self.ash_srv = collections.Counter()
        self.samples = 0
        self.reported_queries = set()
        self.unsupported = set()
        self.subxact = {'overflowed': 0, 'max_count': 0, 'own': None}
        self.stack_sig, self.stack_since, self.stack_reported = None, real_time(), False
        views = self.query("SELECT relname FROM pg_class WHERE relname IN ('pg_stat_bgwriter', 'pg_stat_checkpointer')")
        self.pg_views = [row['relname'] for row in views]
        self.prev = self.counters()

    def run(self):
        failures = 0
        while True:
            time.sleep(SAMPLE_EVERY)
            try:
                self.sample()
                failures = 0
            except psycopg2.Error as e:
                # a stalled server is exactly what we want to observe, so keep sampling through it
                failures += 1
                _logger.warning("perf_probe sample failed (%s consecutive): %s", failures, str(e).strip()[:200])
                self.reset()
                if failures >= 30:
                    _logger.warning("perf probe disabled after %s consecutive failures", failures)
                    return
            except Exception:  # noqa: BLE001
                _logger.warning("perf probe disabled", exc_info=True)
                return

    def reset(self):
        with self.lock:
            try:
                if self.cnx is not None:
                    self.cnx.close()
            except psycopg2.Error:
                pass
            self.cnx = None

    def query(self, sql, timeout=None):
        if not self.lock.acquire(timeout=-1 if timeout is None else timeout):
            return None
        try:
            if self.cnx is None:
                params = sql_db.connection_info_for(self.dbname)[1]
                self.cnx = psycopg2.connect(**{**params, 'application_name': 'odoo_perf_probe'})
                self.cnx.autocommit = True
                with self.cnx.cursor() as cr:
                    cr.execute("SET statement_timeout = '5s'")
            with self.cnx.cursor() as cr:
                cr.execute(sql)
                return [dict(zip([c.name for c in cr.description], row)) for row in cr.fetchall()]
        finally:
            self.lock.release()

    def optional(self, sql):
        """Run a query that older servers or restricted roles may reject, remembering the failure."""
        if sql in self.unsupported:
            return []
        try:
            return self.query(sql)
        except psycopg2.Error:
            self.unsupported.add(sql)
            return []

    def snapshot(self):
        usage = resource.getrusage(resource.RUSAGE_SELF)
        rows = self.query("SELECT blks_read FROM pg_stat_database WHERE datname = current_database()", 0.2)
        return {
            'wall': real_time(), 'cpu': usage.ru_utime + usage.ru_stime, 'queries': sql_db.sql_counter,
            'majflt': usage.ru_majflt, 'blks_read': rows[0]['blks_read'] if rows else None,
        }

    def counters(self):
        usage = resource.getrusage(resource.RUSAGE_SELF)
        stat = (_read(f'/proc/self/task/{self.main.native_id}/stat') or '').rsplit(')', 1)[-1].split()
        counters = {
            'wall': real_time(), 'cpu': usage.ru_utime + usage.ru_stime,
            'main_cpu': (int(stat[11]) + int(stat[12])) / os.sysconf('SC_CLK_TCK') if stat else None,
            'majflt': usage.ru_majflt, 'minflt': usage.ru_minflt, 'vcsw': usage.ru_nvcsw, 'ivcsw': usage.ru_nivcsw,
            **_cgroup(), **self.query(DATABASE_QUERY)[0],
        }
        for row in self.optional(SLRU_QUERY):
            counters.update({f"slru_{row['name']}_hit": row['blks_hit'], f"slru_{row['name']}_read": row['blks_read']})
        for view in self.pg_views:
            for row in self.query(f"SELECT * FROM {view}"):
                counters.update({f'{view[8:]}.{k}': v for k, v in row.items() if isinstance(v, int)})
        return counters

    def frames(self, limit):
        frame = sys._current_frames().get(self.main.ident)
        stack = traceback.extract_stack(frame) if frame else []
        ours = [f for f in stack if not f.filename.startswith(_LIB_PATHS) and 'packages/' not in f.filename]
        return stack, '<'.join(f"{'/'.join(f.filename.split('/')[-3:])}:{f.lineno}:{f.name}" for f in ours[::-1][:limit])

    def sample(self):
        now = real_time()
        activity = self.query(ACTIVITY_QUERY)
        for row in activity:
            wait = f"{row['wait_event_type']}:{row['wait_event']}" if row['wait_event_type'] else 'CPU'
            if row['is_mine']:
                self.ash_db[wait if row['state'] == 'active' else row['state'] or 'hidden'] += 1
            if row['state'] == 'active' or row['state'] is None:
                self.ash_srv[wait if row['state'] else 'hidden'] += 1
        for row in self.optional(SUBXACT_QUERY):
            self.subxact['overflowed'] = max(self.subxact['overflowed'], row['overflowed'] or 0)
            self.subxact['max_count'] = max(self.subxact['max_count'], row['max_count'] or 0)
            self.subxact['own'] = row['own']
        stack, frames = self.frames(3)
        sig = tuple((f.filename, f.lineno) for f in stack)
        if sig != self.stack_sig:
            self.stack_sig, self.stack_since, self.stack_reported = sig, now, False
        mine = [row for row in activity if row['is_mine'] and row['state'] == 'active']
        stalled = [row for row in mine if row['query_age'] > PG_STALL and (row['pid'], row['query_start']) not in self.reported_queries]
        if stalled or (now - self.stack_since > STACK_STALL and not self.stack_reported):
            self.reported_queries.update((row['pid'], row['query_start']) for row in stalled)
            self.stack_reported = self.stack_reported or now - self.stack_since > STACK_STALL
            _logger.warning(
                "perf_probe stall stack_age=%.0fs test=%s srv_waits=%s backends=%s frames=%s", now - self.stack_since,
                odoo.modules.module.current_test, ','.join(f'{k}:{v}' for k, v in collections.Counter(
                    f"{row['wait_event_type']}:{row['wait_event']}" if row['wait_event_type'] else 'CPU'
                    for row in activity if row['state'] == 'active'
                ).most_common()) or '-', [
                    (row['pid'], row['state'], row['wait_event_type'], row['wait_event'],
                     round(row['query_age'] or 0, 1), round(row['xact_age'] or 0, 1), row['query']) for row in mine
                ], self.frames(12)[1],
            )
        self.samples += 1
        if self.samples % SUMMARY_EVERY == 0:
            self.summary(mine, frames)

    def vacuum_summary(self):
        """Log dead rows of the accounting tables and what the autovacuum workers are doing server-wide."""
        tables = ' '.join(
            f"{row['relname']}=live:{row['n_live_tup']},dead:{row['n_dead_tup']},mod:{row['n_mod_since_analyze']},"
            f"vac:{row['autovacuum_count']},anl:{row['autoanalyze_count']},vac_ago:{row['vacuum_ago']}"
            for row in self.optional(TABLES_QUERY)
        )
        workers = self.optional(AUTOVACUUM_QUERY)
        on = ','.join(
            f"{'OURS' if row['is_mine'] else row['datname']}:{row['phase'] or row['query']}" for row in workers
        )
        _logger.info("perf_probe vacuum %s av_workers=%s av_on=%s", tables or 'tables=-', len(workers), on or '-')

    def summary(self, mine, frames):
        new, old = self.counters(), self.prev
        wall = new['wall'] - old['wall']
        pg_cols = [k for k in new if '.' in k and new[k] != old.get(k)]
        slru_cols = [k for k in new if k.startswith('slru_')]
        longest = max(mine, key=lambda row: row['query_age'], default=None)
        _logger.info(
            "perf_probe cpu=%.0f%% main_cpu=%.0f%% %s rss_mb=%d load=%s psi_host=cpu:%s,io:%s,mem:%s "
            "cg_%s cg_mem_mb=%s cg_max_mb=%s cg_psi=cpu:%s,io:%s db_ash=%s srv_ash=%s longest=%s %s %s "
            "%s subxact_overflowed_backends=%s subxact_max=%s subxact_own=%s xmin_age=%s xid_age=%s xid_churn=%s "
            "test=%s frames=%s",
            100 * (new['cpu'] - old['cpu']) / wall,
            100 * ((new['main_cpu'] or 0) - (old['main_cpu'] or 0)) / wall,
            _delta(new, old, ('majflt', 'minflt', 'vcsw', 'ivcsw')),
            int((_read('/proc/self/statm') or '0 0').split()[1]) * os.sysconf('SC_PAGE_SIZE') >> 20,
            ','.join(f'{x:.1f}' for x in os.getloadavg()),
            *(_psi_some(f'/proc/pressure/{r}') for r in ('cpu', 'io', 'memory')),
            _delta(new, old, ('thr', 'thr_ms', 'pgmajfault')).replace(' ', ' cg_') or 'na',
            new.get('mem_mb'), new.get('max_mb'), new.get('psi_cpu'), new.get('psi_io'),
            ','.join(f'{k}:{v}' for k, v in self.ash_db.most_common()) or '-',
            ','.join(f'{k}:{v}' for k, v in self.ash_srv.most_common(5)) or '-',
            f"{longest['query_age']:.1f}s:{longest['query'][:120]!r}" if longest else '-',
            _delta(new, old, ('blks_read', 'blks_hit', 'blk_read_time', 'temp_bytes', 'srv_blks_read')),
            _delta(new, old, pg_cols) or 'ckpt=-', _delta(new, old, slru_cols) or 'slru=-',
            self.subxact['overflowed'], self.subxact['max_count'], self.subxact['own'] or '-',
            new['xmin_age'], new['xid_age'], new['xid_next'] - old['xid_next'],
            odoo.modules.module.current_test, frames,
        )
        self.vacuum_summary()
        self.prev = new
        self.ash_db.clear()
        self.ash_srv.clear()
        self.subxact = {'overflowed': 0, 'max_count': 0, 'own': None}
