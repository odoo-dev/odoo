/** @odoo-module alias=project.BurndownChartRenderer **/
import * as GraphRenderer from 'web/static/src/js/views/graph/graph_renderer';

export class BurndownChartRenderer extends GraphRenderer {

    /**
     * @override
     * @private
     * @returns {Object}
     */
    _getElementOptions() {
        const elementOptions = super._getElementOptions();
        if (this.props.mode === 'line') {
            elementOptions.line.fill = true;
        }
        return elementOptions;
    }

    _getScaleOptions() {
        const scaleOptions = super._getScaleOptions();

        if (!scaleOptions) { // then the mode is pie chart
            return scaleOptions;
        }

        const { xAxes, yAxes } = scaleOptions;
        for (const y of yAxes) {
            y.stacked = false;
        }

        console.log(yAxes);
        return { xAxes, yAxes };
    }
}
