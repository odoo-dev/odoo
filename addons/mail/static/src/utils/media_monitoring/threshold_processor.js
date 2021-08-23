class ThresholdProcessor extends globalThis.AudioWorkletProcessor {
    /**
     * @param {Object} param0 options
     * @param {Object} param0.processorOptions
     * @param {number} [param0.processorOptions.baseLevel] the minimum value for audio detection
            TODO find a way to properly normalize sound? See process() comment.
     * @param {Array<number>} param0.processorOptions.frequencyRange array of two numbers that represent the range of
            frequencies that we want to monitor in hz.
     * @param {number} [param0.processorOptions.minimumActiveCycles] - how many cycles have to pass since the last time the
            threshold was exceeded to go back to inactive state. It prevents the microphone to shut down
            when the user's voice drops in volume mid-sentence.
     * @param {boolean} [param0.processorOptions.postAllTics] true if we need to postMessage at each tics
     */
    constructor({ processorOptions: { baseLevel = 0.3, frequencyRange, minimumActiveCycles = 10, postAllTics } }) {
        super();

        // timing variables
        this.processInterval = 50; // how many ms between each computation
        this.minimumActiveCycles = minimumActiveCycles;
        this.intervalInFrames = this.processInterval / 1000 * globalThis.sampleRate;
        this.nextUpdateFrame = this.processInterval;

        // process variables
        this.activityBuffer = 0;
        /**
         * TODO ideally, do the mathematical inverse when computing this.volume, it would make it consistent with
         * the scriptProcessor version and easier to create a visual match between the input and the volume.
         * probably not use a sqrt but a log2 since input has negative numbers.
         */
        this.baseLevel = Math.pow(baseLevel, 2);
        this.frequencyRange = frequencyRange || [80, 400];
        this.isAboveThreshold = false;
        this.postAllTics = postAllTics;
        this.volume = 0;
        this.wasAboveThreshold = undefined;
    }

    process(inputs, outputs, parameters) {
        const input = inputs[0];

        if (input.length < 1) {
        return;
        }
        const samples = input[0];

        // throttles down the processing tic rate
        this.nextUpdateFrame -= samples.length;
        if (this.nextUpdateFrame >= 0) {
            return true;
        }
        this.nextUpdateFrame += this.intervalInFrames;

        // computes volume and threshold
        const startIndex = _getFrequencyIndex(this.frequencyRange[0], globalThis.sampleRate, samples.length);
        const endIndex = _getFrequencyIndex(this.frequencyRange[1], globalThis.sampleRate, samples.length);
        /**
         * Here is an attempt at a normalization process,
         * `samples` is a Float32array of 128 samples with values in [-1 .. 1],
         * I couldn't figure a way to make a good normalization for those values in a way that would be comparable
         * to the Uint8Array version of the scriptProcessor equivalent: see media_monitoring._getFrquencyAverage
         * TODO something like Math.log2(volume+1) * constant, while baseLevel = baseLevel
         * Math.log2(0) should be counted as 0
         */
        let sum = 0;
        for (let i = startIndex; i < endIndex; ++i) {
            sum += samples[i];
        }
        const preNormalizationVolume = sum / (endIndex - startIndex);
        this.volume = preNormalizationVolume * 3;

        if (this.volume >= this.baseLevel) {
            this.activityBuffer = this.minimumActiveCycles;
        } else if (this.volume < this.baseLevel && this.activityBuffer > 0) {
            this.activityBuffer--;
        }
        this.isAboveThreshold = this.activityBuffer > 0;

        this.postAllTics && this.port.postMessage({ volume: this.volume });
        if (this.wasAboveThreshold !== this.isAboveThreshold) {
            this.wasAboveThreshold = this.isAboveThreshold;
            this.port.postMessage({ isAboveThreshold: this.isAboveThreshold });
        }
        return true;
    }

}

/**
 * @param {number} targetFrequency in Hz
 * @param {number} sampleRate the sample rate of the audio
 * @param {number} samplesSize amount of samples in the audio input
 * @returns {number} the index of the targetFrequency within samplesSize
 */
function _getFrequencyIndex(targetFrequency, sampleRate, samplesSize) {
    const index = Math.round(targetFrequency / (sampleRate / 2) * samplesSize);
    return Math.min(Math.max(0, index), samplesSize);
}

globalThis.registerProcessor("threshold-processor", ThresholdProcessor);
