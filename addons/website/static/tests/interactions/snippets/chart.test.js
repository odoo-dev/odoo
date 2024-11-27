import { expect, test } from "@odoo/hoot";

import {
    startInteractions,
    setupInteractionWhiteList,
} from "../../core/helpers";

import { advanceTime } from "@odoo/hoot-mock";

setupInteractionWhiteList("website.chart");

const getTemplate = function (options = {}) {
    return `
    <div class="s_chart" data-type="bar" data-legend-position="top" data-tooltip-display="true" data-stacked="false" data-border-width="2"
        data-data="{
            &quot;labels&quot;:[&quot;First&quot;,&quot;Second&quot;,&quot;Third&quot;,&quot;Fourth&quot;,&quot;Fifth&quot;],
            &quot;datasets&quot;:[
                {
                    &quot;label&quot;:&quot;One&quot;,
                    &quot;data&quot;:[&quot;12&quot;,&quot;24&quot;,&quot;18&quot;,&quot;17&quot;,&quot;10&quot;],
                    &quot;backgroundColor&quot;:&quot;o-color-1&quot;,
                    &quot;borderColor&quot;:&quot;o-color-1&quot;
                }
            ]
        }">
        <h2>A Chart Title</h2>
        <canvas/>
    </div>
    `
}

test("chart is started when there is an element .s_chart", async () => {
    const { core, el } = await startInteractions(getTemplate());
    await advanceTime(0);
    const canvas = el.querySelector('canvas');
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    const dataLength = data.length;
    let isCanvaBlank = true;
    for (let i = 0; i < dataLength; i++) {
        if (data[i] != 0) {
            isCanvaBlank = false;
        }
    }
    expect(core.interactions.length).toBe(1);
    expect(isCanvaBlank).toBe(false);
});
