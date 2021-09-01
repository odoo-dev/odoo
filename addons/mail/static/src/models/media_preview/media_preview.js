/** @odoo-module **/

import { attr } from '@mail/model/model_field';
import { registerNewModel } from '@mail/model/model_core';

function factory(dependencies) {
    class MediaPreview extends dependencies['mail.model'] {

        /**
         * Iterates tracks of the provided MediaStream, calling the `stop`
         * method on each of them.
         * @param {MediaStream} mediaStream 
         */
        static stopTracksOnMediaStream(mediaStream) {
            for (const track of mediaStream.getTracks()) {
                track.stop();
            }
        }

        //----------------------------------------------------------------------
        // Public
        //----------------------------------------------------------------------

        disableMicrophone() {
            this.audioRef.el.srcObject = null;
            if (!this.audioStream) return;

            MediaPreview.stopTracksOnMediaStream(this.audioStream);
            this.update({ audioStream: null });
        }

        disableVideo() {
            this.videoRef.el.srcObject = null;
            if (!this.videoStream) return;

            MediaPreview.stopTracksOnMediaStream(this.videoStream);
            this.update({ videoStream: null });
        }

        async enableMicrophone() {
            if (!this.doesBrowserSupportMediaDevices) return;

            const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.update({ audioStream });
            this.audioRef.el.srcObject = this.audioStream;
        }

        async enableVideo() {
            if (!this.doesBrowserSupportMediaDevices) return;

            const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
            this.update({ videoStream });
            this.videoRef.el.srcObject = this.videoStream;
        }

        onClickDisableMicrophoneButton() { this.disableMicrophone(); }
        onClickDisableVideoButton() { this.disableVideo(); }
        onClickEnableMicrophoneButton() { this.enableMicrophone(); }
        onClickEnableVideoButton() { this.enableVideo(); }

        //----------------------------------------------------------------------
        // Private
        //----------------------------------------------------------------------

        /**
         * @private
         * @returns {boolean} 
         */
        _computeDoesBrowserSupportMediaDevices() {
            return  Boolean(navigator.mediaDevices
                &&  navigator.mediaDevices.getUserMedia
                &&  window.MediaStream);
        }

        /**
         * @private
         * @returns {boolean} 
         */
        _computeIsMicrophoneEnabled() {
            return this.audioStream !== null;
        }

        /**
         * @private
         * @returns {boolean} 
         */
        _computeIsVideoEnabled() {
            return this.videoStream !== null;
        }
    }

    MediaPreview.fields = {
        /**
         * Ref to the audio element used for the audio feedback.
         */
        audioRef: attr(),
        /**
         * The MediaStream from the microphone.
         * 
         * Default set to null to be consistent with the default value of
         * `HTMLMediaElement.srcObject`.
         */
        audioStream: attr({ default: null }),
        doesBrowserSupportMediaDevices: attr({ compute: '_computeDoesBrowserSupportMediaDevices' }),
        isVideoEnabled: attr({ compute: '_computeIsVideoEnabled' }),
        isMicrophoneEnabled: attr({ compute: '_computeIsMicrophoneEnabled' }),
        /**
         * Ref to the video element used for the video feedback.
         */
        videoRef: attr(),
        /**
         * The MediaStream from the camera.
         * 
         * Default set to null to be consistent with the default value of
         * `HTMLMediaElement.srcObject`.
         */
        videoStream: attr({ default: null }),
    };

    MediaPreview.modelName = 'mail.media_preview';

    return MediaPreview;
}

registerNewModel('mail.media_preview', factory);
