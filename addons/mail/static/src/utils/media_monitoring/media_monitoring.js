/** @odoo-module **/

// broad human voice range of frequencies.
const FREQUENCY_RANGE = [80, 400];

//------------------------------------------------------------------------------
// Public
//------------------------------------------------------------------------------

/**
 * monitors the activity of an audio mediaStreamTrack
 *
 * @param {MediaStreamTrack} audioTrack
 * @param {Object} processorOptions options for the audio processor

 */
async function monitorAudioThresholds(track, processorOptions) {
    // cloning the track so it is not affected by the enabled change of the original track.
    const monitoredTrack = track.clone();
    monitoredTrack.enabled = true;
    const stream = new MediaStream([monitoredTrack]);
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) {
        throw 'missing audio context';
    }
    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);

    let processor;
    try {
        processor = await _loadAudioWorkletProcessor(source, audioContext, processorOptions);
    } catch (e) {
        // In case Worklets are not supported by the browser (eg: Safari)
        processor = _loadScriptProcessor(source, audioContext, processorOptions);
    }

    return { disconnect: () => {
        processor.disconnect();
        source.disconnect();
        monitoredTrack.stop();
    }};
};

//------------------------------------------------------------------------------
// Private
//------------------------------------------------------------------------------

/**
 * @param {MediaStreamSource} source
 * @param {AudioContext} audioContext
 * @param {Object} param1 options
 * @param {number} param1.minimumActiveCycles - how many cycles have to pass since the last time the
                   threshold was exceeded to go back to inactive state.
 * @param {function} param1.onStateChange
 * @param {number} param1.baseLevel the normalized minimum value for audio detection
 * @returns {function} disconnect callback
 */
function _loadScriptProcessor(source, audioContext, { onStateChange, minimumActiveCycles=10, baseLevel=0.3 }) {
    // audio setup
    const bitSize = 1024;
    const analyser = audioContext.createAnalyser();
    source.connect(analyser);
    const scriptProcessorNode = audioContext.createScriptProcessor(bitSize, 1, 1);
    analyser.connect(scriptProcessorNode);
    analyser.fftsize = bitSize;
    scriptProcessorNode.connect(audioContext.destination);

    // timing variables
    const processInterval = 50;  // how many ms between each computation
    const intervalInFrames = processInterval / 1000 * analyser.context.sampleRate;
    let nextUpdateFrame = processInterval;

    // process variables
    let activityBuffer = 0;
    let wasAboveThreshold = undefined;
    let isAboveThreshold = false;

    scriptProcessorNode.onaudioprocess = () => {
        // throttles down the processing tic rate
        nextUpdateFrame -= bitSize;
        if (nextUpdateFrame >= 0) {
            return;
        }
        nextUpdateFrame += intervalInFrames;
        const normalizedVolume = _getFrquencyAverage(analyser, FREQUENCY_RANGE[0], FREQUENCY_RANGE[1]);
        if (normalizedVolume >= baseLevel) {
            activityBuffer = minimumActiveCycles;
        } else if (normalizedVolume < baseLevel && activityBuffer > 0) {
            activityBuffer--;
        }
        isAboveThreshold = activityBuffer > 0;

        if (wasAboveThreshold !== isAboveThreshold) {
            wasAboveThreshold = isAboveThreshold;
            if (!onStateChange) {
                return;
            }
            onStateChange(isAboveThreshold);
        }
    };
    return {
        disconnect: () => {
            analyser.disconnect();
            scriptProcessorNode.disconnect();
            scriptProcessorNode.onaudioprocess = null;
        },
    };
}

/**
 * @param {MediaStreamSource} source
 * @param {AudioContext} audioContext
 * @param {Object} param2 options
 * @param {number} param2.minimumActiveCycles - how long the sound remains 'active' after the last time the threshold is passed
 * @param {function} param2.onStateChange
 * @param {number} param2.baseLevel the normalized minimum value for audio detection
 * @returns {function} disconnect callback
 */
async function _loadAudioWorkletProcessor(source, audioContext, { onStateChange, minimumActiveCycles=10, baseLevel=0.3 }) {
    await audioContext.resume();
    await audioContext.audioWorklet.addModule('mail/static/src/utils/media_monitoring/threshold_processor.js');
    const thresholdProcessor = new AudioWorkletNode(audioContext, 'threshold-processor', {
        processorOptions: {
            minimumActiveCycles,
            baseLevel,
            frequencyRange: FREQUENCY_RANGE,
        }
    });
    source.connect(thresholdProcessor).connect(audioContext.destination);
    thresholdProcessor.port.onmessage = (event) => {
        const { isAboveThreshold } = event.data;
        if (!onStateChange) {
            return;
        }
        onStateChange(isAboveThreshold);
    }
    return {
        disconnect: () => {
            thresholdProcessor.disconnect();
        },
    };
}

/**
 * @param {AnalyserNode} analyser
 * @param {number} lowerFrequency lower bound for relevant frequencies to monitor
 * @param {number} higherFrequency upper bound for relevant frequencies to monitor
 * @returns {number} normalized [0...1] average quantity of the relevant frequencies
 */
function _getFrquencyAverage(analyser, lowerFrequency, higherFrequency) {
    const frequencies = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(frequencies);
    const sampleRate = analyser.context.sampleRate;
    const startIndex = _getFrequencyIndex(lowerFrequency, sampleRate, analyser.frequencyBinCount);
    const endIndex = _getFrequencyIndex(higherFrequency, sampleRate, analyser.frequencyBinCount);
    const count = endIndex - startIndex;
    let sum = 0;
    for (let index = startIndex; index < endIndex; index++) {
        sum += frequencies[index] / 255;
    }
    if (!count) {
        return 0;
    }
    return sum / count;
}

/**
 * @param {number} frequency in Hz
 * @param {number} sampleRate the sample rate of the audio
 * @param {number} sampleRate the sample rate of the audio
 * @returns {number} the index of the frequency within binCount
 */
function _getFrequencyIndex(frequency, sampleRate, binCount) {
    const index = Math.round(frequency / (sampleRate / 2) * binCount);
    if (binCount > 0) {
        if (index < 0) {
            return 0;
        }
        if (index > binCount) {
            return binCount;
        }
        return index;
    }
    if (index < binCount) {
        return binCount;
    }
    if (index > 0) {
        return 0;
    }
    return index;
}

//------------------------------------------------------------------------------
// Export
//------------------------------------------------------------------------------

export {
    monitorAudioThresholds,
};
