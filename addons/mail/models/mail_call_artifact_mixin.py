from odoo import fields, models


class MailCallArtifactMixin(models.AbstractModel):
    """
    Mixin for managing multimedia recordings (audio/video) attached to records.
    This mixin provides a standardized way to store and link media files,
    serving as a foundation for features like playback widgets and
    future AI processing.
    """
    _name = 'mail.call.artifact.mixin'
    _description = 'Call Artifact Mixin'

    # For compatibility and good compression prefer webm container with 'opus' audio or 'av1' video codecs.
    media_id = fields.Many2one("ir.attachment", string="Recording", index=True, help="The audio or video recording file associated with this call")
