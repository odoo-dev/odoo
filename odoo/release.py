# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.
import warnings

RELEASE_LEVELS = [ALPHA, BETA, RELEASE_CANDIDATE, FINAL] = ['alpha', 'beta', 'candidate', 'final']
RELEASE_LEVELS_DISPLAY = {ALPHA: ALPHA,
                          BETA: BETA,
                          RELEASE_CANDIDATE: 'rc',
                          FINAL: ''}

# version_info format: (MAJOR, MINOR, MICRO, RELEASE_LEVEL, SERIAL)
# inspired by Python's own sys.version_info, in order to be
# properly comparable using normal operators, for example:
#  (6,1,0,'beta',0) < (6,1,0,'candidate',1) < (6,1,0,'candidate',2)
#  (6,1,0,'candidate',2) < (6,1,0,'final',0) < (6,1,2,'final',0)
# NOTE: serial hasn't been used since 11.0 or so
version_info = (17, 5, 0, ALPHA, 1, '')
major_version = '.'.join(str(s) for s in version_info[:2])
version = major_version + RELEASE_LEVELS_DISPLAY[version_info[3]] + str(version_info[4] or '') + version_info[5]

product_name = 'Odoo'
description = 'Odoo Server'
url = 'https://www.odoo.com'
author = 'OpenERP S.A.'

nt_service_name = f"odoo-server-{major_version}"

def __getattr__(name):
    if name in ('series', 'serie'):
        warnings.warn(
            "odoo.release.serie and odoo.release.series are deprecated, use `major_version`",
            category=PendingDeprecationWarning,
            stacklevel=2,
        )
        return major_version
    raise AttributeError(f"module {__name__} has no attribute {name}")
