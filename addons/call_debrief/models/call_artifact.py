# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models, api
from odoo.exceptions import ValidationError
import logging

_logger = logging.getLogger(__name__)

class CallArtifact(models.Model):
    _name = 'call.artifact'
    _description = 'Post-Call Artifact'
    _order = 'start'

    res_model = fields.Char(required=True, index=True)
    res_id = fields.Integer(required=True, index=True)
    start = fields.Datetime("Start Time (UTC)", help="Start time of the artifact in UTC")
    end = fields.Datetime("End Time (UTC)", help="End time of the artifact in UTC")
    artifact_type = fields.Selection([
        ('video', 'Video'),
        ('audio', 'Audio'),
        ('transcript', 'Transcript'),
    ], string="Type", required=True)
    role = fields.Selection(
        [
            ("debrief", "Debrief"),
        ],
    string="Role",
    default="debrief",
    required=True,
    help="How this artifact is used in the application (UI-visible debrief vs internal/technical roles).",
    )
    transcript = fields.Text("Text Transcript", help="Text content for transcript artifacts")
    audio = fields.Binary("Audio Recording", help="Binary content for audio recordings")
    video = fields.Binary("Video Recording", help="Binary content for video recordings")
    hidden_in_debrief = fields.Boolean("Hidden in Debrief UI", default=False, help="Less relevant artifacts (e.g. overlapping audio) can be hidden in the call debrief UI.")

    @api.constrains("start", "end", "artifact_type")
    def _constrains_media_time_window(self):
        for rec in self:
            if rec.artifact_type not in ("audio", "video"):
                continue
            if not rec.start or not rec.end:
                msg = "Media artifacts must have start and end timestamps."
                raise ValidationError(msg)
            if rec.start >= rec.end:
                msg = "Artifact start time must be before end time."
                raise ValidationError(msg)

    @api.model_create_multi
    def create(self, vals_list):
        records = super().create(vals_list)
        if not self.env.context.get("skip_call_debrief_recompute"):
            call_keys = records._get_related_call_keys()
            records._recompute_hidden_for_call_keys(call_keys)
        return records

    def write(self, vals):
        call_keys_before = self._get_related_call_keys()
        res = super().write(vals)
        if not self.env.context.get("skip_call_debrief_recompute"):
            call_keys_after = self._get_related_call_keys()
            call_keys = call_keys_before | call_keys_after
            self._recompute_hidden_for_call_keys(call_keys)
        return res

    def unlink(self):
        call_keys = self._get_related_call_keys()
        res = super().unlink()
        if call_keys and not self.env.context.get("skip_call_debrief_recompute"):
            self._recompute_hidden_for_call_keys(call_keys)
        return res

    def _get_related_call_keys(self):
        """Return set of (res_model, res_id) pairs for these artifacts."""
        return {
            (rec.res_model, rec.res_id)
            for rec in self
            if rec.res_model and rec.res_id
        }

    def _recompute_hidden_for_call_keys(self, call_keys):
        for res_model, res_id in call_keys:
            self._apply_overlap_visibility_heuristic(res_model, res_id)

    def _apply_overlap_visibility_heuristic(self, res_model, res_id):
        """Decides if there are any artifacts that should be hidden in the call debrief UI.
        Solves the issue of overlapping media (audio,video) artifacts.

        Note: algorithm is rather strict, because overlap can be chained and only one winner is selected,
        however given the predicted low prevalence of overlapping artifacts, this is not expected to be a problem.
        """
        media_debrief_artifacts = self.sudo().search([
            ("res_model", "=", res_model),
            ("res_id", "=", res_id),
            ("role", "=", "debrief"),
            ("artifact_type", "in", ("audio", "video")),
        ])
        if not media_debrief_artifacts:
            return

        # Start from "everything visible"
        media_debrief_artifacts.with_context(skip_call_debrief_recompute=True).write({"hidden_in_debrief": False})

        # Work on a sorted list for deterministic clustering
        artifacts = sorted(
            media_debrief_artifacts,
            key=lambda r: (r.start, r.end, r.id),
        )
        visible_ids = {rec.id for rec in artifacts}

        def duration_seconds(rec):
            return (rec.end - rec.start).total_seconds()

        start_index = 0
        artifact_count = len(artifacts)
        while start_index < artifact_count:
            # Build one MAXIMAL overlapping cluster by chaining
            cluster = [artifacts[start_index]]
            cluster_end = artifacts[start_index].end
            j = start_index + 1
            while j < artifact_count and artifacts[j].start < cluster_end:
                cluster.append(artifacts[j])
                if artifacts[j].end > cluster_end:
                    cluster_end = artifacts[j].end
                j += 1

            # Pick winning artifact in the current cluster
            if len(cluster) > 1:
                cluster_sorted = sorted(
                    cluster,
                    key=lambda r: (
                        0 if r.artifact_type == "video" else 1,   # prefer video
                        -duration_seconds(r),                     # then longer
                        r.start,                                  # then earlier
                        r.id,                                     # ids for a tie breaker
                    ),
                )
                winner = cluster_sorted[0]
                for rec in cluster:
                    if rec.id != winner.id:
                        visible_ids.discard(rec.id)

            start_index = j

        to_hide = media_debrief_artifacts.filtered(lambda r: r.id not in visible_ids)
        if to_hide:
            to_hide.with_context(skip_call_debrief_recompute=True).write({"hidden_in_debrief": True})

    @api.constrains('artifact_type', 'transcript', 'audio', 'video')
    def _check_artifact_content(self):
        for record in self:
            if record.artifact_type == 'transcript' and not record.transcript:
                raise ValidationError("Transcript artifacts must have text content.")
            if record.artifact_type == 'audio' and not record.audio:
                raise ValidationError("Audio artifacts must have binary recording content.")
            if record.artifact_type == 'video' and not record.video:
                raise ValidationError("Video artifacts must have binary video content.")

            # Ensure only one content field is populated based on artifact_type
            if record.artifact_type == 'transcript':
                if record.audio or record.video:
                    raise ValidationError("Transcript artifacts can only have text content.")
            elif record.artifact_type == 'audio':
                if record.transcript or record.video:
                    raise ValidationError("Audio artifacts can only have binary recording content.")
            elif record.artifact_type == 'video':
                if record.transcript or record.audio:
                    raise ValidationError("Video artifacts can only have binary video content.")
