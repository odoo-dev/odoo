# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

import logging
import re
import subprocess
from unittest import skipIf
from odoo import tools

from . import lint_case

RULES = '{no-undef: error}'
PARSER_OPTIONS = '{ecmaVersion: 2019, sourceType: module}'
# Not sure if the global is complete or too big
GLOBAL = ('owl,openerp,odoo,CKEDITOR,we3,$,jQuery,_,google,window,setTimeout,clearTimeout,'
    'document,console,QUnit,moment,FileReader,nv,d3,ace,Option,py,XMLHttpRequest,setInterval,'
    'clearInterval,Image,jstz,ZeroClipboard,sessionStorage,Node,history,gapi,Event,Gravitec,'
    'navigator,OneSignal,PDFJS,ClipboardJS,PDFSlidesViewer,MutationObserver,Element,URL')


_logger = logging.getLogger(__name__)

try:
    eslint = tools.misc.find_in_path('eslint')
except IOError:
    eslint = None

@skipIf(eslint is None, "eslint tool not found on this system")
class TestESLint(lint_case.LintCase):

    longMessage = True

    def test_eslint_version(self):
        """ Test that there are no eslint errors in javascript files """

        files_to_check = [
            p for p in self.iter_module_files('*.js')
            if not re.match('.*/lib/.*', p)  # don't check libraries
        ]

        _logger.info('Testing %s js files', len(files_to_check))
        # https://eslint.org/docs/user-guide/command-line-interface

        # the --no-eslintrc can be changed when the PR https://github.com/odoo-dev/odoo/pull/770
        # is merged. And we can use the eslintrc.jscon file defined on the that PR.
        # -c ~/my-eslint.json
        cmd = [eslint, '--no-eslintrc', '--env', 'browser', '--env', 'es2017', '--parser-options', PARSER_OPTIONS, '--rule', RULES, '--globa@l', GLOBAL] + files_to_check
        process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        out, err = process.communicate()
        self.assertEqual(process.returncode, 0, msg=out.decode())
