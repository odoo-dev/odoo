# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from . import models
from . import controllers

from .models.slide_channel import SlideChannel, SlideChannelPartner
from .models.slide_slide import SlideSlide, SlideSlidePartner
from .models.survey_survey import SurveySurvey
from .models.survey_user import SurveyUser_Input

def uninstall_hook(env):
    dt = env.ref('website_slides.badge_data_certification_goal', raise_if_not_found=False)
    if dt:
        dt.domain = "[('completed', '=', True), (0, '=', 1)]"
