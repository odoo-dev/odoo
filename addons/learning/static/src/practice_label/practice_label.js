import { Component, t, usePlugin, useProps } from "@odoo/owl";
import { LearningPracticePlugin } from "../services/learning_practice_plugin";

/**
 * "Practice" label shown next to the record's name when a real record (a
 * product, a category, ...) only exists for learning.
 */
export class PracticeLabel extends Component {
    static template = "learning.PracticeLabel";
    props = useProps({
        record: t.object(),
    });

    setup() {
        this.practice = usePlugin(LearningPracticePlugin);
    }

    get isPractice() {
        const { record } = this.props;
        return this.practice.isPractice(record.resModel, record.resId);
    }
}
