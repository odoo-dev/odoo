# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

import base64
from datetime import datetime, timedelta

from odoo.tests import tagged
from odoo.tests.common import TransactionCase


@tagged('at_install', '-post_install')  # TODO is that more sensible?
class TestCallArtifact(TransactionCase):

    def test_overlapping_artifacts(self):
        test_record = self.env['res.partner'].create({'name': 'Test Partner'})
        now = datetime.now()

        def _create_artifact(artifact_type, start_offset_secs, end_offset_secs):
            content = {
                'video': base64.b64encode(b'v'),
                'audio': base64.b64encode(b'a'),
            }
            return self.env['call.artifact'].create({
                'res_model': 'res.partner',
                'res_id': test_record.id,
                'role': 'debrief',
                'artifact_type': artifact_type,
                artifact_type: content[artifact_type],
                'start': now + timedelta(seconds=start_offset_secs),
                'end': now + timedelta(seconds=end_offset_secs),
            })

        # Case: Video is preferred over audio
        a1 = _create_artifact('audio', 0, 5)
        a2 = _create_artifact('video', 0, 5)
        self.assertTrue(a1.hidden_in_debrief, "Pair: audio should be hidden when video overlaps")
        self.assertFalse(a2.hidden_in_debrief, "Pair: video should be visible when audio overlaps")

        # Case: Longer is preferred over shorter
        a3 = _create_artifact('audio', 10, 15)
        a4 = _create_artifact('audio', 10, 16)
        self.assertTrue(a3.hidden_in_debrief, "Pair: shorter audio should be hidden")
        self.assertFalse(a4.hidden_in_debrief, "Pair: longer audio should be visible")

        # Case: Video is preferred over longer audio
        a5 = _create_artifact('audio', 20, 26)
        a6 = _create_artifact('video', 20, 25)
        self.assertTrue(a5.hidden_in_debrief, "Pair: longer audio should be hidden when video overlaps")
        self.assertFalse(a6.hidden_in_debrief, "Pair: video should be visible even if shorter")

        # Case: Clusters of three artifacts
        #
        #    A7: | V V V |
        #    A8:   | A A A A |
        #    A9:     | V V |
        #
        a7 = _create_artifact('video', 30, 33)
        a8 = _create_artifact('audio', 31, 35)
        a9 = _create_artifact('video', 32, 34)
        self.assertFalse(a7.hidden_in_debrief, "Cluster of 3: Longest video should win")
        self.assertTrue(a8.hidden_in_debrief, "Cluster of 3: audio should be hidden")
        self.assertTrue(a9.hidden_in_debrief, "Cluster of 3: shorter video should be hidden")

        # Case: Chained cluster
        #
        #    A10: | A A A |
        #    A11:     | V V V |
        #    A12:         | A A A |
        #
        a10 = _create_artifact('audio', 40, 43)
        a11 = _create_artifact('video', 42, 45)
        a12 = _create_artifact('audio', 44, 47)
        self.assertTrue(a10.hidden_in_debrief, "Chained cluster: first audio should be hidden")
        self.assertTrue(a12.hidden_in_debrief, "Chained cluster: second audio should be hidden")
        self.assertFalse(a11.hidden_in_debrief, "Chained cluster: video should be the winner")

        # Case: Independent clusters
        #
        #    A13: | V |   A15: | V |
        #    A14: | A |   A16: | A |
        #
        # Two separate clusters, each with a video winner.
        a13 = _create_artifact('video', 50, 51)
        a14 = _create_artifact('audio', 50, 51)
        a15 = _create_artifact('video', 55, 56)
        a16 = _create_artifact('audio', 55, 56)
        self.assertFalse(a13.hidden_in_debrief, "Independent clusters: first video should win")
        self.assertTrue(a14.hidden_in_debrief, "Independent clusters: first audio should be hidden")
        self.assertFalse(a15.hidden_in_debrief, "Independent clusters: second video should win")
        self.assertTrue(a16.hidden_in_debrief, "Independent clusters: second audio should be hidden")

        # Case: Update artifacts
        #
        #   A17:  | A A A |
        #    A18:   | A A A |
        # Updated to
        #    A17: | A A A |
        #    A18:   | A A A A |
        a17 = _create_artifact('video', 60, 62)
        a18 = _create_artifact('video', 61, 63)
        self.assertFalse(a17.hidden_in_debrief, "Update: initial winner should be visible")
        self.assertTrue(a18.hidden_in_debrief, "Update: initial loser should be hidden")
        a18.write({'end': now + timedelta(seconds=64)})
        self.assertTrue(a17.hidden_in_debrief, "Update: after update, former winner should be hidden")
        self.assertFalse(a18.hidden_in_debrief, "Update: after update, updated artifact should be visible")

        # Case: Delete the winning artifact
        a19 = _create_artifact('video', 70, 72)
        a20 = _create_artifact('audio', 70, 72)
        self.assertFalse(a19.hidden_in_debrief, "Delete: video winner should be visible")
        self.assertTrue(a20.hidden_in_debrief, "Delete: audio loser should be hidden")
        a19.unlink()
        self.assertFalse(a20.hidden_in_debrief, "Delete: after deleting winner, audio should become visible")
