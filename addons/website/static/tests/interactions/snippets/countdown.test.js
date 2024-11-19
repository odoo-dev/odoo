import { expect, test } from "@odoo/hoot";

import { startInteractions, setupInteractionWhiteList } from "../../core/helpers";

setupInteractionWhiteList("website.countdown");

test("countdown interaction does not activate without .s_countdown", async () => {
    const { core } = await startInteractions(``);
    expect(core.interactions.length).toBe(0);
});

test("countdown interaction activate with a .s_countdown", async () => {
    const endTime = 12345678900;
    const { core } = await startInteractions(`
        <div style="background-color: white;"> 
            <section class="s_countdown pt48 pb48"
             data-display="dhms" 
             data-end-action="nothing" 
             data-size="175"
             data-layout="circle" 
             data-layout-background="none"
             data-progress-bar-style="surrounded" 
             data-progress-bar-weight="thin"
             id="countdown-section"
             data-text-color="o-color-1"
             data-layout-background-color="400"
             data-progress-bar-color="o-color-1"
             data-end-time=${endTime}>
                <div class="container">
                    <div class="s_countdown_canvas_wrapper" 
                    style="
                        display: flex;
                        justify-content: center;
                        align-items: center;">
                    </div>
                </div>
            </section>
        </div>
    `);
    expect(core.interactions.length).toBe(1);
});


test("countdown interaction update the canvas for seconds correctly", async () => {
    const endTime = 12345678900;
    const { core, el } = await startInteractions(`
        <div style="background-color: white;"> 
            <section class="s_countdown pt48 pb48"
             data-display="dhms" 
             data-end-action="nothing" 
             data-size="175"
             data-layout="circle" 
             data-layout-background="none"
             data-progress-bar-style="surrounded" 
             data-progress-bar-weight="thin"
             id="countdown-section"
             data-text-color="o-color-1"
             data-layout-background-color="400"
             data-progress-bar-color="o-color-1"
             data-end-time=${endTime}>
                <div class="container">
                    <div class="s_countdown_canvas_wrapper" 
                    style="
                        display: flex;
                        justify-content: center;
                        align-items: center;">
                    </div>
                </div>
            </section>
        </div>
    `);
    function delay(time) {
        return new Promise(resolve => setTimeout(resolve, time));
    }

    // time T

    const canvass1 = el.querySelectorAll('canvas');
    const canvasHours1 = canvass1[1];
    const dataHours1 = canvasHours1.getContext('2d').getImageData(0, 0, canvasHours1.width, canvasHours1.height).data;
    const canvasSeconds1 = canvass1[3];
    const dataSeconds1 = canvasSeconds1.getContext('2d').getImageData(0, 0, canvasSeconds1.width, canvasSeconds1.height).data;

    await delay(1000);

    // time T + 1s

    const canvass2 = el.querySelectorAll('canvas');
    const canvasHours2 = canvass2[1];
    const dataHours2 = canvasHours2.getContext('2d').getImageData(0, 0, canvasHours2.width, canvasHours2.height).data;
    const canvasSeconds2 = canvass2[3];
    const dataSeconds2 = canvasSeconds2.getContext('2d').getImageData(0, 0, canvasSeconds2.width, canvasSeconds2.height).data;

    const datalengthHours1 = dataHours1.length;
    const datalengthHours2 = dataHours2.length;

    const datalengthSeconds1 = dataSeconds1.length;
    const datalengthSeconds2 = dataSeconds2.length;

    expect(datalengthHours1).toBe(datalengthHours2)
    expect(datalengthSeconds1).toBe(datalengthSeconds2)

    let wasHourCanvasChanged = false;
    for (let i = 0; i < datalengthHours1; i++) {
        if (dataHours1[i] != dataHours2[i]) {
            wasHourCanvasChanged = true;
            break;
        }
    }

    let wasSecondCanvasChanged = false;
    for (let i = 0; i < datalengthSeconds1; i++) {
        if (dataSeconds1[i] != dataSeconds2[i]) {
            wasSecondCanvasChanged = true;
            break;
        }
    }

    expect(wasHourCanvasChanged).toBe(false);
    expect(wasSecondCanvasChanged).toBe(true);
});
