import itertools
import json
import logging
import os
import time

from odoo import SUPERUSER_ID, api, modules
from odoo.cli.command import Command
from odoo.exceptions import ValidationError
from odoo.modules.registry import Registry
from odoo.tools import config

_logger = logging.getLogger(__name__)
_logger.setLevel(logging.INFO)


class DomainObj:
    def __init__(
        self,
        domain: list,
        fields: list[str],
        model_name: str,
        domain_for: str,
        groupby: list[str] = None,
        having: list[str] = None,
        user_id: int = None,
    ):
        self.domain = domain
        self.fields = fields
        self.model_name = model_name
        self.domain_for = domain_for
        self.groupby = groupby or []
        self.having = having or []
        if user_id is None:
            self.user_id = SUPERUSER_ID
        else:
            self.user_id = user_id


class IrFilterDomain(DomainObj):
    @classmethod
    def _create_ir_filter_domain(cls, record) -> "IrFilterDomain":
        user_id = SUPERUSER_ID if not record.user_ids else record.user_ids.ids[0]
        return cls(
            domain=record._get_eval_domain(),
            fields=[],
            model_name=record.model_id,
            domain_for=record.name,
            groupby=[],
            having=[],
            user_id=user_id,
        )

    def __repr__(self):
        return f"{self.__class__.__name__}(domain={self.domain!r}, model_name={self.model_name!r}, domain_for={self.domain_for!r}, user_id={self.user_id})"


class SpreadsheetDomain(DomainObj):
    def __init__(
        self,
        domain: list,
        fields: list[str],
        model_name: str,
        domain_for: str,
        spreadsheet_id: int,
        spreadsheet_name: str,
        groupby: list[str] = None,
        having: list[str] = None,
        user_id: int = None,
    ):
        super().__init__(
            domain=domain,
            fields=fields,
            model_name=model_name,
            domain_for=domain_for,
            groupby=groupby,
            having=having,
            user_id=user_id,
        )
        self.spreadsheet_id = spreadsheet_id
        self.spreadsheet_name = spreadsheet_name

    @classmethod
    def _create_spreadsheet_domain(cls, data: dict, spreadsheet) -> "SpreadsheetDomain":
        res_model = data.get("model")
        domain = data.get("domain", [])
        having = data.get("having", [])
        data_name = data.get("name", "Unknown")

        fields = set()
        groupby = []
        for measure in data.get("measures", []):
            if "fieldName" in measure and measure["fieldName"] not in ["Ratio", "__count"]:
                aggregator = measure.get("aggregator", "sum")
                fields.add(f"{measure['fieldName']}:{aggregator}")

        for direction in data.get("rows", []) + data.get("columns", []):
            if "fieldName" in direction:
                groupby.append(direction["fieldName"])

        user_id = SUPERUSER_ID

        return cls(
            domain=domain,
            fields=list(fields),
            model_name=res_model,
            domain_for=data_name,
            spreadsheet_id=spreadsheet.id,
            spreadsheet_name=spreadsheet.name,
            groupby=groupby,
            having=having,
            user_id=user_id,
        )

    def __repr__(self):
        return f"{self.__class__.__name__}(model_name={self.model_name!r}, spreadsheet_id={self.spreadsheet_id!r}, spreadsheet_name={self.spreadsheet_name!r}, filter_name={self.domain_for})"


def _get_spreadsheet_domain_for_model(
    env, model_name, domain_list, batch_size=2000, limit_offset=float("inf"),
):
    if model_name not in env:
        return []

    offset = 0
    records = env[model_name].search(domain_list, limit=batch_size, offset=offset)

    def _process_batch(spreadsheet_batch):
        domains = []
        for spreadsheet in spreadsheet_batch:
            try:
                body = json.loads(spreadsheet._get_serialized_spreadsheet_data_body())
            except (ValidationError, AttributeError):
                _logger.error(f"ERROR: Error Validating spreadsheet ID {spreadsheet.id}")
                continue

            data = body.get("data", {})
            revisions = body.get("revisions", [])

            for pivot in data.get("pivots", {}).values():
                domains.append(
                    SpreadsheetDomain._create_spreadsheet_domain(pivot, spreadsheet),
                )

            for list_ in data.get("lists", {}).values():
                domains.append(
                    SpreadsheetDomain._create_spreadsheet_domain(list_, spreadsheet),
                )

            for revision in revisions:
                for command in revision.get("commands", []):
                    if command["type"] in ("UPDATE_PIVOT", "ADD_PIVOT"):
                        domains.append(
                            SpreadsheetDomain._create_spreadsheet_domain(
                                command["pivot"], spreadsheet,
                            ),
                        )
                    elif command["type"] in ("UPDATE_ODOO_LIST", "INSERT_ODOO_LIST"):
                        list_ = command.get("list", command.get("definition", {}))
                        if list_:
                            res_model = list_.get("metaData", {}).get("resModel")
                            domain = list_.get("searchParams", {}).get("domain", [])
                            domains.append(
                                SpreadsheetDomain(
                                    domain,
                                    [],
                                    res_model,
                                    spreadsheet.id,
                                    spreadsheet.name,
                                    "List View",
                                ),
                            )

        spreadsheet_batch.invalidate_recordset()
        return domains

    while records and offset < limit_offset:
        yield _process_batch(records)
        offset += 1
        records = env[model_name].search(
            domain_list, limit=batch_size, offset=offset * batch_size,
        )


def _get_ir_model_filters(env, domain, batch_size=2000, limit_offset=float("inf")):
    offset = 0
    records = env["ir.filters"].search(domain, limit=batch_size, offset=offset)

    while records and offset < limit_offset:
        yield [IrFilterDomain._create_ir_filter_domain(rec) for rec in records]
        offset += 1
        records.invalidate_recordset()
        records = env["ir.filters"].search(
            [], limit=batch_size, offset=offset * batch_size,
        )


def _execute_domain(env, domain: DomainObj):
    new_cr = env.registry.cursor()
    try:
        new_env = api.Environment(new_cr, domain.user_id, env.context)
        Model = new_env.get(domain.model_name)

        if Model is None:
            _logger.error(f"ERROR: Model {domain.model_name} does not exist.")
            return 1

        if domain.groupby:
            Model.read_group(domain.domain, domain.groupby, domain.fields)
        else:
            Model.search(domain.domain)
        return 0

    except Exception as e:
        _logger.error(f"ERROR: Exception processing domain {domain.model_name}: {str(e)}")
        return 1
    finally:
        new_cr.close()


domains_with_time = []


def _execute(env, domain):
    process_pid = os.fork()
    if process_pid == 0:
        status = _execute_domain(env, domain)
        os._exit(status)
    else:
        start_time = time.time()
        timeout = 300
        while True:
            child_pid, status = os.waitpid(process_pid, os.WNOHANG)
            total_time = time.time() - start_time
            if child_pid != 0:
                exit_code = os.WEXITSTATUS(status)
                if exit_code != 0:
                    _logger.error(f"ERROR: {domain} failed during execution")
                else:
                    _logger.error(f"INFO: {domain} executed successfully")
                domains_with_time.append((domain, total_time))
                break

            if total_time >= timeout:
                _logger.error(f"ERROR: {domain} exceeded 5 minutes. Terminating...")
                os.kill(process_pid, signal.SIGKILL)
                os.waitpid(process_pid, 0)
                domains_with_time.append((domain, total_time))
                break

            time.sleep(0.5)


def _test_domains(env, domains):
    for domain in domains:
        _execute(env, domain)


def test_domains(env, domains):
    for i, domains in enumerate(domains):
        _logger.error(f"INFO: Testing batch {i + 1} size of {len(domains)}")
        _test_domains(env, domains)

    domains_with_time.sort(key=lambda x: -x[1])
    top_twenty_domains = domains_with_time[:20]

    _logger.error(f"INFO: PRINTING TOP {len(top_twenty_domains)} SLOWEST DOMAINS")
    _logger.error("=" * 70)
    for domain, time in top_twenty_domains:
        _logger.error(f"INFO: {domain} executed in {time} seconds")


class ExecutorCommand(Command):
    name = "slow_domains"
    description = "Command-line tool to test and list the slowest domains in the database"

    def run(self, cmdargs):
        parser = self.parser

        parser.add_argument(
            "-d",
            "--database",
            dest="db_name",
            required=True,
            help="REQUIRED: The name of the PostgreSQL database to connect to and test.",
        )
        parser.add_argument(
            "-f",
            "--ir_filters",
            action="store_true",
            help="FLAG: Include and test domains extracted from 'ir.filters' records.",
        )
        parser.add_argument(
            "-s",
            "--spreadsheet_domains",
            action="store_true",
            help="FLAG: Include and test domains extracted from spreadsheet dashboards and documents.",
        )
        parser.add_argument(
            "-l",
            "--limit_offset",
            type=int,
            default=1,
            metavar="N",
            help="INTEGER: Limiting the number of batches to be tested for each category. "
                 "The number passed multiplies the batch size (2000). "
                 "e.g., Passing 1 will test up to 2000 records, passing 2 will test up to 4000.",
        )
        parser.add_argument(
            "--addons-path",
            dest="addons_path",
            help="OPTIONAL: Comma-separated list of directories to load Odoo addons from.",
        )

        args = parser.parse_args(args=cmdargs)
        self.batch_size = 2000
        self.init(args)

    def init(self, args):
        if args.addons_path:
            config['addons_path'] = args.addons_path
            modules.initialize_sys_path()
        db_name = args.db_name
        registry = Registry(db_name)
        self.limit_offset = args.limit_offset or 1
        _logger.error(f"INFO: Connecting to database: {db_name}")

        with registry.cursor() as cr:
            env = api.Environment(cr, SUPERUSER_ID, {})
            domains = self.get_domains(env, args)
            test_domains(env, domains)

    def get_domains(self, env, args):
        search_domain = [("handler", "=", "spreadsheet")]

        if args.ir_filters:
            yield from _get_ir_model_filters(env, [], batch_size=self.batch_size, limit_offset=self.limit_offset)

        if args.spreadsheet_domains:
            yield from itertools.chain(
                _get_spreadsheet_domain_for_model(
                    env,
                    "documents.document",
                    search_domain,
                    batch_size=self.batch_size,
                    limit_offset=self.limit_offset,
                ),
                _get_spreadsheet_domain_for_model(
                    env,
                    "spreadsheet.dashboard",
                    [],
                    batch_size=self.batch_size,
                    limit_offset=self.limit_offset,
                ),
            )
