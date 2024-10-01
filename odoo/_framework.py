# -*- coding: utf-8 -*-
# ruff: noqa: E402, F401
# Part of Odoo. See LICENSE file for full copyright and licensing details.

""" OpenERP core library."""

import sys
MIN_PY_VERSION = (3, 10)
MAX_PY_VERSION = (3, 12)
assert sys.version_info > MIN_PY_VERSION, f"Outdated python version detected, Odoo requires Python >= {'.'.join(map(str, MIN_PY_VERSION))} to run."

# ----------------------------------------------------------
# Shortcuts
# ----------------------------------------------------------
# The hard-coded super-user id (a.k.a. administrator, or root user).
SUPERUSER_ID = 1

# XXX hack to expose variables at `odoo` level
import odoo
odoo.SUPERUSER_ID = SUPERUSER_ID
odoo.MIN_PY_VERSION = MIN_PY_VERSION
odoo.MAX_PY_VERSION = MAX_PY_VERSION


def registry(database_name=None):
    """
    Return the model registry for the given database, or the database mentioned
    on the current thread. If the registry does not exist yet, it is created on
    the fly.
    """
    import warnings  # noqa: PLC0415
    warnings.warn("Use directly odoo.modules.registry.Registry", DeprecationWarning, 2)
    if database_name is None:
        import threading
        database_name = threading.current_thread().dbname
    return modules.registry.Registry(database_name)


# ----------------------------------------------------------
# Import tools to patch code and libraries
# required to do as early as possible for evented and timezone
# ----------------------------------------------------------
from . import _monkeypatches
_monkeypatches.patch_all()


# ----------------------------------------------------------
# Imports
# ----------------------------------------------------------
from . import upgrade  # this namespace must be imported first
from . import addons
from . import conf
from . import loglevels
from . import modules
from . import netsvc
from . import osv
from . import release
from . import service
from . import sql_db
from . import tools

# ----------------------------------------------------------
# Model classes, fields, api decorators, and translations
# ----------------------------------------------------------
from . import models
from . import fields
from . import api

odoo._ = tools.translate._
odoo.Command = fields.Command

# ----------------------------------------------------------
# Other imports, which may require stuff from above
# ----------------------------------------------------------
from . import cli
from . import http
