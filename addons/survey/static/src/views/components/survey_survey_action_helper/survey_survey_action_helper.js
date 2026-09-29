import { useService } from '@web/core/utils/hooks';
import { Component, onWillStart, usePlugin } from '@odoo/owl';
import { ActionPlugin } from "@web/webclient/actions/action_plugin";

export class SurveySurveyActionHelper extends Component {
    static template = 'survey.SurveySurveyActionHelper';

    setup() {
        this.orm = useService('orm');
        this.action = usePlugin(ActionPlugin);

        onWillStart(async () => {
            this.surveyTemplateData = await this.orm.call(
                'survey.survey',
                'get_survey_templates_data',
                []
            );
        });
    }

    async onStartFromScratchClick() {
        const action = await this.orm.call(
            'survey.survey',
            'action_load_sample_custom',
            [],
        );
        this.action.doAction(action);
    }

    async onTemplateClick(templateInfo) {
        const action = await this.orm.call(
            'survey.survey',
            'action_load_survey_template_sample',
            [templateInfo.template_key],
        );
        this.action.doAction(action);
    }
};
