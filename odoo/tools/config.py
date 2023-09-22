# Part of Odoo. See LICENSE file for full copyright and licensing details.

import collections
import configparser as ConfigParser
import errno
import logging
import optparse
import glob
import os
import sys
import tempfile
import warnings
import odoo
from os.path import expandvars, expanduser, abspath, realpath, normcase
from .. import release
from . import appdirs

from passlib.context import CryptContext
crypt_context = CryptContext(schemes=['pbkdf2_sha512', 'plaintext'],
                             deprecated=['plaintext'])

_dangerous_logger = logging.getLogger(__name__)  # use config._log() instead


def _deduplicate_loggers(loggers):
    """ Avoid saving multiple logging levels for the same loggers to a save
    file, that just takes space and the list can potentially grow unbounded
    if for some odd reason people use :option`--save`` all the time.
    """
    # dict(iterable) -> the last item of iterable for any given key wins,
    # which is what we want and expect. Output order should not matter as
    # there are no duplicates within the output sequence
    return (
        '{}:{}'.format(logger, level)
        for logger, level in dict(it.split(':') for it in loggers).items()
    )

class configmanager:
    def __init__(self):
        self._default_options = {}
        self._file_options = {}
        self._cli_options = {}
        self._runtime_options = {}
        self.options = collections.ChainMap(
            self._runtime_options,
            self._cli_options,
            self._file_options,
            self._default_options,
        )

        # dictionary mapping option destination (keys in self.options) to OdooOptions.
        self.options_index = {}

        self.misc = {}  # deprecated since 17.0

        self.parser = None

    @property
    def rcfile(self):
        self._warn("Since 17.0, use odoo.tools.config['config'] instead", DeprecationWarning, stacklevel=2)
        return self['config']

    @rcfile.setter
    def rcfile(self, rcfile):
        self._warn(f"Since 17.0, use odoo.tools.config['config'] = {rcfile!r} instead", DeprecationWarning, stacklevel=2)
        self._runtime_options['config'] = rcfile

    def _build_cli(self):
        version = "%s %s" % (release.description, release.version)
        self.parser = parser = optparse.OptionParser(version=version, option_class=OdooOption)

        parser.add_option(FileOnlyOption(dest='admin_passwd', my_default='admin'))
        parser.add_option(FileOnlyOption(dest='csv_internal_sep', my_default=','))
        parser.add_option(FileOnlyOption(dest='publisher_warranty_url', my_default='http://services.openerp.com/publisher-warranty/', file_exportable=False))
        parser.add_option(FileOnlyOption(dest='reportgz', action='store_true', my_default=False))
        parser.add_option(FileOnlyOption(dest='websocket_keep_alive_timeout', type='int', my_default=3600))
        parser.add_option(FileOnlyOption(dest='websocket_rate_limit_burst', type='int', my_default=10))
        parser.add_option(FileOnlyOption(dest='websocket_rate_limit_delay', type='float', my_default=0.2))

        # Server startup config
        group = optparse.OptionGroup(parser, "Common options")
        group.add_option("-c", "--config", dest="config", type='path', file_loadable=False,
                         help="specify alternate config file")
        group.add_option("-s", "--save", action="store_true", dest="save", default=False, file_loadable=False,
                         help="save configuration to ~/.odoorc (or to ~/.openerp_serverrc if it exists)")
        group.add_option("-i", "--init", dest="init", type='comma', my_default=[], file_loadable=False,
                         help="install one or more modules (comma-separated list, use \"all\" for all modules), requires -d")
        group.add_option("-u", "--update", dest="update", type='comma', my_default=[], file_loadable=False,
                         help="update one or more modules (comma-separated list, use \"all\" for all modules). Requires -d.")
        group.add_option("--without-demo", dest="without_demo", type='comma', my_default=[],
                         help="disable loading demo data for modules to be installed (comma-separated, use \"all\" for all modules). Requires -d and -i. Default is %default")
        group.add_option("-P", "--import-partial", dest="import_partial", type='path', my_default='',
                         help="Use this for big data importation, if it crashes you will be able to continue at the current state. Provide a filename to store intermediate importation states.")
        group.add_option("--pidfile", dest="pidfile", type='path', help="file where the server pid will be stored")
        group.add_option("--addons-path", dest="addons_path", type='addons_path',  # sensitive default set in _load_default_options
                         help="specify additional addons paths (separated by commas).")
        group.add_option("--upgrade-path", dest="upgrade_path", type='upgrade_path', my_default=[],
                         help="specify an additional upgrade path.")
        group.add_option("--load", dest="server_wide_modules", type='comma', my_default=['base', 'web'],
                         help="Comma-separated list of server-wide modules.")
        group.add_option("-D", "--data-dir", dest="data_dir", type='path',  # sensitive default set in _load_default_options
                         help="Directory where to store Odoo data")
        parser.add_option_group(group)

        # HTTP
        group = optparse.OptionGroup(parser, "HTTP Service Configuration")
        group.add_option("--http-interface", dest="http_interface", my_default='',
                         help="Listen interface address for HTTP services. "
                              "Keep empty to listen on all interfaces (0.0.0.0)")
        group.add_option("-p", "--http-port", dest="http_port", my_default=8069,
                         help="Listen port for the main HTTP service", type="int", metavar="PORT")
        group.add_option("--longpolling-port", dest="longpolling_port", my_default=0, file_exportable=False,
                         help="Deprecated alias to the gevent-port option", type="int", metavar="PORT")
        group.add_option("--gevent-port", dest="gevent_port", my_default=8072,
                         help="Listen port for the gevent worker", type="int", metavar="PORT")
        group.add_option("--no-http", dest="http_enable", action="store_false", my_default=True,
                         help="Disable the HTTP and Longpolling services entirely")
        group.add_option("--proxy-mode", dest="proxy_mode", action="store_true", my_default=False,
                         help="Activate reverse proxy WSGI wrappers (headers rewriting) "
                              "Only enable this when running behind a trusted web proxy!")
        group.add_option("--x-sendfile", dest="x_sendfile", action="store_true", my_default=False,
                         help="Activate X-Sendfile (apache) and X-Accel-Redirect (nginx) "
                              "HTTP response header to delegate the delivery of large "
                              "files (assets/attachments) to the web server.")
        # HTTP: hidden backwards-compatibility for "*xmlrpc*" options
        hidden = optparse.SUPPRESS_HELP
        group.add_option("--xmlrpc-interface", dest="http_interface", help=hidden)
        group.add_option("--xmlrpc-port", dest="http_port", type="int", help=hidden)
        group.add_option("--no-xmlrpc", dest="http_enable", action="store_false", help=hidden)

        parser.add_option_group(group)

        # WEB
        group = optparse.OptionGroup(parser, "Web interface Configuration")
        group.add_option("--db-filter", dest="dbfilter", my_default='', metavar="REGEXP",
                         help="Regular expressions for filtering available databases for Web UI. "
                              "The expression can use %d (domain) and %h (host) placeholders.")
        parser.add_option_group(group)

        # Testing Group
        group = optparse.OptionGroup(parser, "Testing Configuration")
        group.add_option("--test-file", dest="test_file", type='path',
                         help="Launch a python test file.")
        group.add_option("--test-enable", dest='test_enable', action="store_true",
                         help="Enable unit tests.")
        group.add_option("--test-tags", dest="test_tags",
                         help="Comma-separated list of specs to filter which tests to execute. Enable unit tests if set. "
                         "A filter spec has the format: [-][tag][/module][:class][.method] "
                         "The '-' specifies if we want to include or exclude tests matching this spec. "
                         "The tag will match tags added on a class with a @tagged decorator "
                         "(all Test classes have 'standard' and 'at_install' tags "
                         "until explicitly removed, see the decorator documentation). "
                         "'*' will match all tags. "
                         "If tag is omitted on include mode, its value is 'standard'. "
                         "If tag is omitted on exclude mode, its value is '*'. "
                         "The module, class, and method will respectively match the module name, test class name and test method name. "
                         "Example: --test-tags :TestClass.test_func,/test_module,external "

                         "Filtering and executing the tests happens twice: right "
                         "after each module installation/update and at the end "
                         "of the modules loading. At each stage tests are filtered "
                         "by --test-tags specs and additionally by dynamic specs "
                         "'at_install' and 'post_install' correspondingly.")

        group.add_option("--screencasts", dest="screencasts", type='path', my_default=None,
                         metavar='DIR',
                         help="Screencasts will go in DIR/{db_name}/screencasts.")
        temp_tests_dir = os.path.join(tempfile.gettempdir(), 'odoo_tests')
        group.add_option("--screenshots", dest="screenshots", type='path', my_default=temp_tests_dir,
                         metavar='DIR',
                         help="Screenshots will go in DIR/{db_name}/screenshots. Defaults to %s." % temp_tests_dir)
        parser.add_option_group(group)

        # Logging Group
        group = optparse.OptionGroup(parser, "Logging Configuration")
        group.add_option("--logfile", dest="logfile", type='path', help="file where the server log will be stored")
        group.add_option("--syslog", action="store_true", dest="syslog", my_default=False, help="Send the log to the syslog server")
        group.add_option('--log-handler', action="append", type='comma', default=[], my_default=[':INFO'], metavar="PREFIX:LEVEL",
                         help='setup a handler at LEVEL for a given PREFIX. '
                              'An empty PREFIX indicates the root logger. '
                              'This option can be repeated. '
                              'Example: "odoo.orm:DEBUG" or "werkzeug:CRITICAL" (default: ":INFO")')
        group.add_option('--log-web', action="append_const", dest="log_handler", const="odoo.http:DEBUG", help='shortcut for --log-handler=odoo.http:DEBUG')
        group.add_option('--log-sql', action="append_const", dest="log_handler", const="odoo.sql_db:DEBUG", help='shortcut for --log-handler=odoo.sql_db:DEBUG')
        group.add_option('--log-db', dest='log_db', help="Logging database name")
        group.add_option('--log-db-level', dest='log_db_level', my_default='warning', help="Logging database level")
        # For backward-compatibility, map the old log levels to something
        # quite close.
        levels = [
            'info', 'debug_rpc', 'warn', 'test', 'critical', 'runbot',
            'debug_sql', 'error', 'debug', 'debug_rpc_answer', 'notset'
        ]
        group.add_option('--log-level', dest='log_level', type='choice',
                         choices=levels, my_default='info',
                         help='specify the level of the logging. Accepted values: %s.' % (levels,))

        parser.add_option_group(group)

        # SMTP Group
        group = optparse.OptionGroup(parser, "SMTP Configuration")
        group.add_option('--email-from', dest='email_from',
                         help='specify the SMTP email address for sending email')
        group.add_option('--from-filter', dest='from_filter',
                         help='specify for which email address the SMTP configuration can be used')
        group.add_option('--smtp', dest='smtp_server', my_default='localhost',
                         help='specify the SMTP server for sending email')
        group.add_option('--smtp-port', dest='smtp_port', my_default=25,
                         help='specify the SMTP port', type="int")
        group.add_option('--smtp-ssl', dest='smtp_ssl', action='store_true',
                         help='if passed, SMTP connections will be encrypted with SSL (STARTTLS)')
        group.add_option('--smtp-user', dest='smtp_user',
                         help='specify the SMTP username for sending email')
        group.add_option('--smtp-password', dest='smtp_password',
                         help='specify the SMTP password for sending email')
        group.add_option('--smtp-ssl-certificate-filename', dest='smtp_ssl_certificate_filename', type='path',
                         help='specify the SSL certificate used for authentication')
        group.add_option('--smtp-ssl-private-key-filename', dest='smtp_ssl_private_key_filename', type='path',
                         help='specify the SSL private key used for authentication')
        parser.add_option_group(group)

        # Database Group
        group = optparse.OptionGroup(parser, "Database related options")
        group.add_option("-d", "--database", dest="db_name", type='comma',  my_default=[],
                         help="database(s) used when installing or updating modules. Providing a comma-separated list restrict access to databases provided in list.")
        group.add_option("-r", "--db_user", dest="db_user",
                         help="specify the database user name")
        group.add_option("-w", "--db_password", dest="db_password",
                         help="specify the database password")
        group.add_option("--pg_path", dest="pg_path", type='path',
                         help="specify the pg executable path")
        group.add_option("--db_host", dest="db_host",
                         help="specify the database host")
        group.add_option("--db_port", dest="db_port",
                         help="specify the database port", type="int")
        group.add_option("--db_sslmode", dest="db_sslmode", type="choice", my_default='prefer',
                         choices=['disable', 'allow', 'prefer', 'require', 'verify-ca', 'verify-full'],
                         help="specify the database ssl connection mode (see PostgreSQL documentation)")
        group.add_option("--db_maxconn", dest="db_maxconn", type='int', my_default=64,
                         help="specify the maximum number of physical connections to PostgreSQL")
        group.add_option("--db_maxconn_gevent", dest="db_maxconn_gevent", type='int',
                         help="specify the maximum number of physical connections to PostgreSQL specifically for the gevent worker")
        group.add_option("--db-template", dest="db_template", my_default="template0",
                         help="specify a custom database template to create a new database")
        parser.add_option_group(group)

        # i18n Group
        group = optparse.OptionGroup(parser, "Internationalisation options",
            "Use these options to translate Odoo to another language. "
            "See i18n section of the user manual. Option '-d' is mandatory. "
            "Option '-l' is mandatory in case of importation"
            )
        group.add_option('--load-language', dest="load_language", file_loadable=False,
                         help="specifies the languages for the translations you want to be loaded")
        group.add_option('-l', "--language", dest="language", file_loadable=False,
                         help="specify the language of the translation file. Use it with --i18n-export or --i18n-import")
        group.add_option("--i18n-export", dest="translate_out", type='path', file_loadable=False,
                         help="export all sentences to be translated to a CSV file, a PO file or a TGZ archive and exit")
        group.add_option("--i18n-import", dest="translate_in", type='path', file_loadable=False,
                         help="import a CSV or a PO file with translations and exit. The '-l' option is required.")
        group.add_option("--i18n-overwrite", dest="overwrite_existing_translations", action="store_true", my_default=False, file_loadable=False,
                         help="overwrites existing translation terms on updating a module or importing a CSV or a PO file.")
        group.add_option("--modules", dest="translate_modules", type='comma', my_default=['all'], file_loadable=False,
                         help="specify modules to export. Use in combination with --i18n-export")
        parser.add_option_group(group)

        # Security Group
        security = optparse.OptionGroup(parser, 'Security-related options')
        security.add_option('--no-database-list', action="store_false", dest='list_db', my_default=True,
                            help="Disable the ability to obtain or view the list of databases. "
                                 "Also disable access to the database manager and selector, "
                                 "so be sure to set a proper --database parameter first")
        parser.add_option_group(security)

        # Advanced options
        group = optparse.OptionGroup(parser, "Advanced options")
        group.add_option('--dev', dest='dev_mode', type='comma', my_default=[], file_exportable=False,
                         help="Enable developer mode. Param: List of options separated by comma. "
                              "Options : all, reload, qweb, xml")
        group.add_option('--shell-interface', dest='shell_interface', type='comma', my_default=[], file_exportable=False,
                         help="Specify a preferred REPL to use in shell mode. Supported REPLs are: "
                              "[ipython|ptpython|bpython|python]")
        group.add_option("--stop-after-init", action="store_true", dest="stop_after_init", my_default=False, file_exportable=False,
                         help="stop the server after its initialization")
        group.add_option("--osv-memory-count-limit", dest="osv_memory_count_limit", my_default=0,
                         help="Force a limit on the maximum number of records kept in the virtual "
                              "osv_memory tables. By default there is no limit.",
                         type="int")
        group.add_option("--transient-age-limit", dest="transient_age_limit", my_default=1.0,
                         help="Time limit (decimal value in hours) records created with a "
                              "TransientModel (mostly wizard) are kept in the database. Default to 1 hour.",
                         type="float")
        group.add_option("--max-cron-threads", dest="max_cron_threads", my_default=2,
                         help="Maximum number of threads processing concurrently cron jobs (default 2).",
                         type="int")
        group.add_option("--unaccent", dest="unaccent", my_default=False, action="store_true",
                         help="Try to enable the unaccent extension when creating new databases.")
        group.add_option("--geoip-city-db", "--geoip-db", dest="geoip_city_db", type='path', my_default='/usr/share/GeoIP/GeoLite2-City.mmdb',
                         help="Absolute path to the GeoIP City database file.")
        group.add_option("--geoip-country-db", dest="geoip_country_db", type='path', my_default='/usr/share/GeoIP/GeoLite2-Country.mmdb',
                         help="Absolute path to the GeoIP Country database file.")
        parser.add_option_group(group)

        if os.name == 'posix':
            group = optparse.OptionGroup(parser, "Multiprocessing options")
            # TODO sensible default for the three following limits.
            group.add_option("--workers", dest="workers", my_default=0,
                             help="Specify the number of workers, 0 disable prefork mode.",
                             type="int")
            group.add_option("--limit-memory-soft", dest="limit_memory_soft", my_default=2048 * 1024 * 1024,
                             help="Maximum allowed virtual memory per worker (in bytes), when reached the worker be "
                             "reset after the current request (default 2048MiB).",
                             type="int")
            group.add_option("--limit-memory-hard", dest="limit_memory_hard", my_default=2560 * 1024 * 1024,
                             help="Maximum allowed virtual memory per worker (in bytes), when reached, any memory "
                             "allocation will fail (default 2560MiB).",
                             type="int")
            group.add_option("--limit-time-cpu", dest="limit_time_cpu", my_default=60,
                             help="Maximum allowed CPU time per request (default 60).",
                             type="int")
            group.add_option("--limit-time-real", dest="limit_time_real", my_default=120,
                             help="Maximum allowed Real time per request (default 120).",
                             type="int")
            group.add_option("--limit-time-real-cron", dest="limit_time_real_cron", my_default=-1,
                             help="Maximum allowed Real time per cron job. (default: --limit-time-real). "
                                  "Set to 0 for no limit. ",
                             type="int")
            group.add_option("--limit-request", dest="limit_request", my_default=2**16,
                             help="Maximum number of request to be processed per worker (default 65536).",
                             type="int")
            parser.add_option_group(group)

    def _load_default_options(self):
        self._default_options.clear()
        self._default_options.update({
            option_name: option.my_default
            for option_name, option in self.options_index.items()
        })

        self._default_options['data_dir'] = (
            appdirs.user_data_dir(release.product_name, release.author)
            if os.path.isdir(os.path.expanduser('~')) else
            appdirs.site_data_dir(release.product_name, release.author)
            if sys.platform in ['win32', 'darwin'] else
            f'/var/lib/{release.product_name}'
        )

        self._default_options['addons_path'] = []
        for missing_level, name, addons_dir in [
            (logging.WARNING, 'base', self.addons_base_dir),
            (logging.WARNING, 'main', self.addons_main_dir),
            (logging.DEBUG, 'data', self.addons_data_dir),
        ]:
            if self._is_addons_path(addons_dir):
                self._default_options['addons_path'].append(addons_dir)
            else:
                self._log(missing_level, "%s addons dir at %r seems missing/empty", name, addons_dir)

        if rcfilepath := os.getenv('ODOO_RC'):
            pass
        elif rcfilepath := os.getenv('OPENERP_SERVER'):
            self._warn("Since ages ago, the OPENERP_SERVER environment variable has been replaced by ODOO_RC", DeprecationWarning)
        elif os.name == 'nt':
            rcfilepath = os.path.join(os.path.abspath(os.path.dirname(sys.argv[0])), 'odoo.conf')
        elif os.path.isfile(rcfilepath := os.path.expanduser('~/.odoorc')):
            pass
        elif os.path.isfile(rcfilepath := os.path.expanduser('~/.openerp_serverrc')):
            self._warn("Since ages ago, the ~/.openerp_serverrc file has been replaced by ~/.odoorc", DeprecationWarning)
        else:
            rcfilepath = '~/.odoorc'
        self._default_options['config'] = self._normalize(rcfilepath)

    _log_entries = []   # helpers for log() and warn(), accumulate messages
    _warn_entries = []  # until logging is configured and the entries flushed

    @classmethod
    def _log(cls, loglevel, message, *args, **kwargs):
        # is replaced by logger.log once logging is ready
        cls._log_entries.append((loglevel, message, args, kwargs))

    @classmethod
    def _warn(cls, message, *args, **kwargs):
        # is replaced by warnings.warn once logging is ready
        cls._warn_entries.append((message, args, kwargs))

    @classmethod
    def _flush_log_and_warn_entries(cls):
        for loglevel, message, args, kwargs in cls._log_entries:
            _dangerous_logger.log(loglevel, message, *args, **kwargs)
        del cls._log_entries
        cls._log = _dangerous_logger.log

        for message, args, kwargs in cls._warn_entries:
            warnings.warn(message, *args, **kwargs)
        del cls._warn_entries
        cls._warn = warnings.warn

    def parse_config(self, args=None):
        """ Parse the configuration file (if any) and the command-line
        arguments.

        This method initializes odoo.tools.config and openerp.conf (the
        former should be removed in the future) with library-wide
        configuration values.

        This method must be called before proper usage of this library can be
        made.

        Typical usage of this method:

            odoo.tools.config.parse_config(sys.argv[1:])
        """
        opt = self._parse_config(args)
        odoo.netsvc.init_logger()
        self._flush_log_and_warn_entries()
        odoo.modules.module.initialize_sys_path()
        return opt

    def _parse_config(self, args=None):
        opt, unkown_args = self.parser.parse_args(args or [])

        def die(cond, msg):
            if cond:
                self.parser.error(msg)

        # Ensures no illegitimate argument is silently discarded (avoids insidious "hyphen to dash" problem)
        die(unkown_args, "unrecognized parameters: '%s'" % " ".join(unkown_args))

        # Even if they are not exposed on the CLI, cli un-loadable variables still show up in the opt, remove them
        for option_name in list(vars(opt).keys()):
            if not self.options_index[option_name].cli_loadable:
                delattr(opt, option_name)  # hence list(...) above

        die(bool(opt.syslog) and bool(opt.logfile),
            "the syslog and logfile options are exclusive")

        die(opt.translate_in and (not opt.language or not opt.db_name),
            "the i18n-import option cannot be used without the language (-l) and the database (-d) options")

        die(opt.overwrite_existing_translations and not (opt.translate_in or opt.update),
            "the i18n-overwrite option cannot be used without the i18n-import option or without the update option")

        die(opt.translate_out and (not opt.db_name),
            "the i18n-export option cannot be used without the database (-d) option")

        # Check if the config file exists (-c used, but not -s)
        die(not opt.save and opt.config and not os.access(opt.config, os.R_OK),
            "The config file '%s' selected with -c/--config doesn't exist or is not readable, "\
            "use -s/--save if you want to generate it"% opt.config)

        self._load_cli_options(opt)
        self._load_file_options(self['config'])

        die(len(self['db_name']) > 1 and (self['init'] or self['update']),
            "Cannot use -i/--init or -u/--update with multiple databases in the -d/--database/db_name")

        self._postprocess_options()

        if opt.save:
            self.save()

        return opt

    def _load_cli_options(self, opt):
        # odoo.cli.command.main parses the config twice, the second time
        # without --addons-path but expect the value to be persisted
        addons_path = self._cli_options.pop('addons_path', None)
        self._cli_options.clear()
        if addons_path is not None:
            self._cli_options['addons_path'] = addons_path

        keys = [
            option_name for option_name, option
            in self.options_index.items()
            if option.cli_loadable
            if option.action != 'append'
        ]

        for arg in keys:
            if getattr(opt, arg, None) is not None:
                self._cli_options[arg] = getattr(opt, arg)

        if opt.log_handler:
            self._cli_options['log_handler'] = opt.log_handler

    def _postprocess_options(self):
        self._runtime_options.clear()

        # ensure default server wide modules are present
        for mod in self._default_options['server_wide_modules']:
            if mod not in self['server_wide_modules']:
                self._log(logging.INFO, "adding missing %r to %s", mod, self.options_index['server_wide_modules'])
                self._runtime_options['server_wide_modules'] = [mod] + self['server_wide_modules']

        # ensure default addons-path are present
        for ad_path in self._default_options['addons_path']:
            if ad_path not in self['addons_path']:
                self._log(logging.INFO, "adding missing %r to %s", ad_path, self.options_index['addons_path'])
                self._runtime_options['addons_path'] = self['addons_path'] + [ad_path]

        # accumulate all log_handlers
        self._runtime_options['log_handler'] = list(_deduplicate_loggers([
            *self._default_options.get('log_handler', []),
            *self._file_options.get('log_handler', []),
            *self._cli_options.get('log_handler', []),
        ]))

        self._runtime_options['init'] = dict.fromkeys(self['init'], True) or {}
        self._runtime_options['demo'] = dict(self['init']) if not self['without_demo'] else {}
        self._runtime_options['update'] = dict.fromkeys(self['update'], True) or {}
        self._runtime_options['translate_modules'] = sorted(self['translate_modules'])

        if 'all' in self['dev_mode']:
            self._runtime_options['dev_mode'] = self['dev_mode'] + ['reload', 'qweb', 'xml']

        if self['test_enable'] and not self['test_tags']:
            self._runtime_options['test_tags'] = "+standard"
        self._runtime_options['test_enable'] = bool(self['test_tags'])

        if self['longpolling_port']:
            self._warn(
                "The longpolling-port is a deprecated alias to "
                "the gevent-port option, please use the latter.",
                DeprecationWarning)
            if not self['gevent_port']:
                self._runtime_options['gevent_port'] = self['longpolling_port']
            for map_ in self.options.maps:
                map_.pop('lonqgpolling_port', None)

    @classmethod
    def _is_addons_path(cls, path):
        from odoo.modules.module import MANIFEST_NAMES
        for f in os.listdir(path):
            modpath = os.path.join(path, f)
            if os.path.isdir(modpath):
                def hasfile(filename):
                    return os.path.isfile(os.path.join(modpath, filename))
                if hasfile('__init__.py') and any(hasfile(mname) for mname in MANIFEST_NAMES):
                    return True
        return False

    @classmethod
    def _check_addons_path(cls, option, opt, value):
        ad_paths = []
        for path in filter(bool, map(cls._normalize, value.split(','))):
            if not os.path.isdir(path):
                raise optparse.OptionValueError("option %s: no such directory: %r" % (opt, path))
            if not cls._is_addons_path(path):
                raise optparse.OptionValueError("option %s: the path %r is not a valid addons directory" % (opt, path))
            ad_paths.append(path)

        return ad_paths

    @classmethod
    def _check_upgrade_path(cls, option, opt, value):
        upgrade_path = []
        for path in filter(bool, map(cls._normalize, value.split(','))):
            if not os.path.isdir(path):
                raise optparse.OptionValueError("option %s: no such directory: %r" % (opt, path))
            if not cls._is_upgrades_path(path):
                raise optparse.OptionValueError("option %s: the path %r is not a valid upgrade directory" % (opt, path))
            if path not in upgrade_path:
                upgrade_path.append(path)
        return upgrade_path

    @classmethod
    def _is_upgrades_path(cls, path):
        return any(
            glob.glob(os.path.join(path, f"*/*/{prefix}-*.py"))
            for prefix in ["pre", "post", "end"]
        )

    @classmethod
    def _check_bool(cls, option, opt, value):
        if value.lower() in ('1', 'yes', 'true', 'on'):
            return True
        if value.lower() in ('0', 'no', 'false', 'off'):
            return False
        raise optparse.OptionValueError(
            f"option {opt}: invalid boolean value: {value!r}"
        )

    @classmethod
    def _check_comma(cls, option_name, option, value):
        return list(filter(bool, map(str.strip, value.split(','))))

    @classmethod
    def _check_path(cls, option, opt, value):
        return cls._normalize(value)

    def _cast(self, option_name, value):
        if not isinstance(value, str):
            raise TypeError(f"can only cast strings: {value!r}")
        option = self.options_index[option_name]
        if option.action in ('store_true', 'store_false'):
            check_func = self._check_bool
        else:
            check_func = self.parser.option_class.TYPE_CHECKER[option.type]
        return check_func(option, option_name, value)

    @classmethod
    def _format_string(cls, value):
        if value is None:
            return ''
        return str(value)

    @classmethod
    def _format_list(cls, value):
        return ','.join(filter(bool, map(str.strip, value)))

    def _format(self, option_name, value):
        option = self.options_index[option_name]
        if option.action in ('store_true', 'store_false'):
            format_func = self.parser.option_class.TYPE_FORMATTER['bool']
        else:
            format_func = self.parser.option_class.TYPE_FORMATTER[option.type]
        return format_func(value)

    def load(self):
        self._warn("Since 17.0, use config._load_file_options instead", DeprecationWarning, stacklevel=2)
        self._load_default_options(self['config'])

    def _load_file_options(self, rcfile):
        self._file_options.clear()
        outdated_options_map = {
            'xmlrpc_port': 'http_port',
            'xmlrpc_interface': 'http_interface',
            'xmlrpc': 'http_enable',
        }
        p = ConfigParser.RawConfigParser()
        try:
            p.read([rcfile])
            for (name,value) in p.items('options'):
                name = outdated_options_map.get(name, name)
                if option := self.options_index.get(name):
                    if not option.file_loadable:
                        continue
                    is_fake_false = (value == 'False' and option.type not in ('store_true', 'store_false'))
                    if value == '' or value == 'None' or is_fake_false:
                        continue
                    value = self._cast(name, value)
                self._file_options[name] = value
            #parse the other sections, as well
            for sec in p.sections():
                if sec == 'options':
                    continue
                self._warn("""Since 17.0, defining "misc" sections in the configuration file is deprecated, please use ir.config_parameter or your own configuration file instead""", DeprecationWarning, stacklevel=2)
                self.misc.setdefault(sec, {})
                for (name, value) in p.items(sec):
                    if value=='True' or value=='true':
                        value = True
                    if value=='False' or value=='false':
                        value = False
                    self.misc[sec][name] = value
        except IOError:
            pass
        except ConfigParser.NoSectionError:
            pass

    def save(self, keys=None):
        p = ConfigParser.RawConfigParser()
        rc_exists = os.path.exists(self['config'])
        if rc_exists and keys:
            p.read([self['config']])
        if not p.has_section('options'):
            p.add_section('options')
        for opt in sorted(self.options):
            option = self.options_index.get(opt)
            if keys is not None and opt not in keys:
                continue
            if opt == 'version' or (option and not option.file_exportable):
                continue
            if option:
                p.set('options', opt, self._format(opt, self.options[opt]))
            else:
                p.set('options', opt, self.options[opt])

        for sec in sorted(self.misc):
            p.add_section(sec)
            for opt in sorted(self.misc[sec]):
                p.set(sec,opt,self.misc[sec][opt])

        # try to create the directories and write the file
        try:
            if not rc_exists and not os.path.exists(os.path.dirname(self['config'])):
                os.makedirs(os.path.dirname(self['config']))
            try:
                p.write(open(self['config'], 'w'))
                if not rc_exists:
                    os.chmod(self['config'], 0o600)
            except IOError:
                sys.stderr.write("ERROR: couldn't write the config file\n")

        except OSError:
            # what to do if impossible?
            sys.stderr.write("ERROR: couldn't create the config directory\n")

    def get(self, key, default=None):
        return self.options.get(key, default)

    def pop(self, key, default=None):
        self._warn("Since 17.0, config.pop is deprecated, please refrain from modifying the configuration at runtime", DeprecationWarning, stacklevel=2)
        return self.options.pop(key, default)

    def get_misc(self, sect, key, default=None):
        self._warn("Since 17.0, config.get_misc() is deprecated, please use ir.config_parameter or your own configuration file instead", DeprecationWarning, stacklevel=2)
        return self.misc.get(sect,{}).get(key, default)

    def __setitem__(self, key, value):
        if isinstance(value, str) and key in self.options_index:
            value = self._cast(key, value)
        self.options[key] = value

    def __getitem__(self, key):
        return self.options[key]

    @property
    def root_path(self):
        return self._normalize(os.path.join(os.path.dirname(__file__), '..'))

    @property
    def addons_base_dir(self):
        return os.path.join(self.root_path, 'addons')

    @property
    def addons_main_dir(self):
        return os.path.join(os.path.dirname(self.root_path), 'addons')

    @property
    def addons_data_dir(self):
        add_dir = os.path.join(self['data_dir'], 'addons')
        d = os.path.join(add_dir, release.series)
        if not os.path.exists(d):
            try:
                # bootstrap parent dir +rwx
                if not os.path.exists(add_dir):
                    os.makedirs(add_dir, 0o700)
                # try to make +rx placeholder dir, will need manual +w to activate it
                os.makedirs(d, 0o500)
            except OSError:
                logging.getLogger(__name__).debug('Failed to create addons data dir %s', d)
        return d

    @property
    def session_dir(self):
        d = os.path.join(self['data_dir'], 'sessions')
        try:
            os.makedirs(d, 0o700)
        except OSError as e:
            if e.errno != errno.EEXIST:
                raise
            assert os.access(d, os.W_OK), \
                "%s: directory is not writable" % d
        return d

    def filestore(self, dbname):
        return os.path.join(self['data_dir'], 'filestore', dbname)

    def set_admin_password(self, new_password):
        hash_password = crypt_context.hash if hasattr(crypt_context, 'hash') else crypt_context.encrypt
        self.options['admin_passwd'] = hash_password(new_password)

    def verify_admin_password(self, password):
        """Verifies the super-admin password, possibly updating the stored hash if needed"""
        stored_hash = self.options['admin_passwd']
        if not stored_hash:
            # empty password/hash => authentication forbidden
            return False
        result, updated_hash = crypt_context.verify_and_update(password, stored_hash)
        if result:
            if updated_hash:
                self.options['admin_passwd'] = updated_hash
            return True

    @classmethod
    def _normalize(cls, path):
        if not path:
            return ''
        return normcase(realpath(abspath(expanduser(expandvars(path.strip())))))


class OdooOption(optparse.Option):
    TYPES = ['int', 'float', 'string', 'choice', 'bool', 'path', 'comma',
             'addons_path', 'upgrade_path']
    TYPE_CHECKER = {
        'int': lambda _option, _opt, value: int(value),
        'float': lambda _option, _opt, value: float(value),
        'string': lambda _option, _opt, value: str(value),
        'choice': optparse.check_choice,
        'bool': configmanager._check_bool,
        'path': configmanager._check_path,
        'comma': configmanager._check_comma,
        'addons_path': configmanager._check_addons_path,
        'upgrade_path': configmanager._check_upgrade_path,
    }
    TYPE_FORMATTER = {
        'int': configmanager._format_string,
        'float': configmanager._format_string,
        'string': configmanager._format_string,
        'choice': configmanager._format_string,
        'bool': configmanager._format_string,
        'path': configmanager._format_string,
        'comma': configmanager._format_list,
        'addons_path': configmanager._format_list,
        'upgrade_path': configmanager._format_list,
    }

    def __init__(self, *opts, **attrs):
        self.my_default = attrs.pop('my_default', None)
        self.cli_loadable = attrs.pop('cli_loadable', True)
        self.file_loadable = attrs.pop('file_loadable', True)
        self.file_exportable = attrs.pop('file_exportable', self.file_loadable)
        if self.file_exportable and not self.file_loadable:
            raise ValueError(f"it makes no sense that the option {self}"
                             " can be exported to the config file but"
                             " not loaded from the config file")
        super().__init__(*opts, **attrs)
        if self.dest and self.dest not in config.options_index:
            config.options_index[self.dest] = self

    def __str__(self):
        return super().__str__() + '/' + self.dest


class FileOnlyOption(OdooOption):
    def __init__(self, **attrs):
        super().__init__(**attrs, cli_loadable=False, help=optparse.SUPPRESS_HELP)
    def _check_opt_strings(self, opts):
        if opts:
            raise TypeError("No option can be supplied")
    def _set_opt_strings(self, opts):
        return


config = configmanager()
config._build_cli()
config._load_default_options()
config._parse_config()
