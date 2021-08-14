/** @odoo-module **/

import { registerNewModel } from '@mail/model/model_core';
import { attr } from '@mail/model/model_field';

function factory(dependencies) {

    class SoundEffect extends dependencies['mail.model'] {

        //----------------------------------------------------------------------
        // Private
        //----------------------------------------------------------------------

        /**
         * @override
         */
        static _createRecordLocalId(data) {
            return `${this.modelName}_${data.path}_${data.filename}`;
        }

        //----------------------------------------------------------------------
        // Public
        //----------------------------------------------------------------------

        /**
         *
         *
         * @param {Object} param0
         * @param {boolean} [param0.loop] true if we want to make the audio loop, will only stop if stop() is called
         * @param {boolean} [param0.volume]
         */
        play({ loop, volume = 1 } = {}) {
            if (typeof(Audio) !== "undefined") {
                if (!this.audio) {
                    const audio = new Audio();
                    this.update({ audio });
                }
                this.audio.pause();
                const ext = this.audio.canPlayType("audio/ogg; codecs=vorbis") ? ".ogg" : ".mp3";
                this.audio.loop = loop;
                this.audio.src = this.path + this.filename + ext;
                this.audio.volume = volume;
                this.audio.currentTime = 0;
                this.audio.play().catch(()=>{});
            }
        }

        /**
         * Resets the audio to the start of the track and pauses it.
         */
        stop() {
            if (this.audio) {
                this.audio.pause();
                this.audio.currentTime = 0;
            }
        }
    }

    SoundEffect.fields = {
        /**
         * HTMLAudioElement.
         */
        audio: attr(),
        /**
         * Name of the audio file.
         */
        filename: attr({
            required: true,
        }),
        /**
         * Path to the audio file folder.
         */
        path: attr({
            default: '/mail/static/src/audio/',
            required: true,
        }),
    };

    SoundEffect.modelName = 'mail.sound_effect';

    return SoundEffect;
}

registerNewModel('mail.sound_effect', factory);
