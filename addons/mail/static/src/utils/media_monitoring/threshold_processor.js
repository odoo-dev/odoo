class ThresholdProcessor extends AudioWorkletProcessor {
    /**
     * Worklets are not yet supported by Safari.
     *
     * @param {Object} param0 options
     * @param {Object} param0.processorOptions
     * @param {number} processorOptions.minimumActiveCycles - how many cycles have to pass since the last time the
                       threshold was exceeded to go back to inactive state.
     * @param {number} processorOptions.baseLevel the minimum value for audio detection
               TODO find a way to properly normalize sound? See process() comment.
     * @param {Array<number>} processorOptions.frequencyRange array of two numbers that represent the range of
              frequencies that we want to monitor in hz.
     * @param {number} processorOptions.processInterval time in ms between each check
     * @param {number} sampleRate of the audio track
     */
    constructor({ processorOptions: { minimumActiveCycles=10, baseLevel=0.3, frequencyRange, sampleRate } }) {
        super();

        // timing variables
        this.processInterval = 50; // how many ms between each computation
        this.minimumActiveCycles = minimumActiveCycles;
        this.intervalInFrames = this.processInterval / 1000 * sampleRate;
        this.nextUpdateFrame = this.processInterval;

        // process variables
        /**
         * TODO ideally, do the mathematical inverse when computing this.volume, it would make it consistent with
         * the scriptProcessor version and easier to create a visual match between the input and the volume.
         */
        const boostedLevel = baseLevel*10;
        this.baseLevel = boostedLevel*boostedLevel / 10;
        this.frequencyRange = frequencyRange;
        this.sampleRate = sampleRate;
        this.activityBuffer = 0;
        this.wasAboveThreshold = undefined;
        this.isAboveThreshold = false;
        this.volume = 0;
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

        const startIndex = _getFrequencyIndex(this.frequencyRange[0], this.sampleRate, 128);
        const endIndex = _getFrequencyIndex(this.frequencyRange[1], this.sampleRate, 128);


        /**
         * Here is an attempt at a normalization process,
         * `samples` is a Float32array of 128 samples with values in [-1 .. 1],
         * I couldn't figure a way to make a good normalization for those values in a way that would be comparable
         * to the Uint8Array version of the scriptProcessor equivalent: see media_monitoring._getFrquencyAverage
         */
        let sum = 0;
        for (let i = startIndex; i < endIndex; ++i) {
            sum += samples[i];
        }
        this.volume = sum * 30 / (endIndex - startIndex);

        if (this.volume >= this.baseLevel) {
            this.activityBuffer = this.minimumActiveCycles;
        } else if (this.volume < this.baseLevel && this.activityBuffer > 0) {
            this.activityBuffer--;
        }
        this.isAboveThreshold = this.activityBuffer > 0;

        if (this.wasAboveThreshold !== this.isAboveThreshold) {
            this.wasAboveThreshold = this.isAboveThreshold;
            this.port.postMessage({ isAboveThreshold: this.isAboveThreshold });
        }
        return true;
    }

};

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

registerProcessor("threshold-processor", ThresholdProcessor);
