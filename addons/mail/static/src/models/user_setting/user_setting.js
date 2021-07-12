/** @odoo-module **/

import { registerNewModel } from '@mail/model/model_core';
import { attr, one2one } from '@mail/model/model_field';

let timeoutId;
function debounce(func, delay) {
    if (timeoutId) {
        clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(func, delay);
}

function factory(dependencies) {

    class UserSetting extends dependencies['mail.model'] {

        /**
         * @override
         */
        _created() {
            const res = super._created(...arguments);
            const voiceActivationThresholdString = this.env.services.local_storage.getItem('mail_user_setting_voice_threshold');
            const voiceActivationThreshold = parseFloat(voiceActivationThresholdString, 10);
            if (voiceActivationThreshold > 0) {
                this.update({
                    voiceActivationThreshold,
                });
            }
        }

        //----------------------------------------------------------------------
        // Public
        //----------------------------------------------------------------------

        /**
         * @static
         * @param {Object} data
         * @returns {Object}
         */
        static convertData(data) {
            const data2 = {};
            if ('use_push_to_talk' in data) {
                data2.usePushToTalk = data.use_push_to_talk;
            }
            if ('push_to_talk_key' in data) {
                data2.pushToTalkKey = data.push_to_talk_key;
            }
            if ('voice_active_duration' in data) {
                data2.voiceActiveDuration = data.voice_active_duration;
            }
            if ('id' in data) {
                data2.id = data.id;
            }
            return data2;
        }

        /**
         * toggles the display of the option window
         */
        toggleWindow() {
            this.update({ isOpen: !this.isOpen });
        }

        /**
         * @param {String} value
         */
        setDelayValue(value) {
            const voiceActiveDuration = parseInt(value, 10);
            this.update({ voiceActiveDuration });
            this.saveSettings();
        }

        /**
         * @param {String} value
         */
        async setThresholdValue(value) {
            const voiceActivationThreshold = parseFloat(value, 10);
            this.update({ voiceActivationThreshold });
            this.env.services.local_storage.setItem('mail_user_setting_voice_threshold', value);
            await this.env.mailRtc.updateVoiceActivation();
        }

        /**
         * @param {String} key
         */
        async savePushToTalkKey(key) {
            this.update({ pushToTalkKey: key });
            this.saveSettings();
        }

        async togglePushToTalk() {
            this.update({ usePushToTalk: !this.usePushToTalk });
            await this.env.mailRtc.updateVoiceActivation();
            this.saveSettings();
        }

        /**
         *
         */
        async saveSettings() {
            debounce(async () => {
                await this.async(() => this.env.services.rpc(
                    {
                        model: 'mail.user.settings',
                        method: 'set_mail_user_settings',
                        args: [[this.env.messaging.mailUserSettingsId], {
                            push_to_talk_key: this.pushToTalkKey,
                            use_push_to_talk: this.usePushToTalk,
                            voice_active_duration: this.voiceActiveDuration,
                        }],
                    },
                    { shadow: true },
                ));
            }, 2000);
        }
    }

    UserSetting.fields = {
        id: attr(),
        isOpen: attr({
            default: false,
        }),
        messaging: one2one('mail.messaging', {
            inverse: 'userSetting',
        }),
        usePushToTalk: attr({
            default: false,
        }),
        pushToTalkKey: attr({
            default: false,
        }),
        /*
         * normalized volume
         */
        voiceActivationThreshold: attr({
            default: 0.3,
        }),
        /*
         * how long the voice remains active after releasing the push-to-talk key in ms
         */
        voiceActiveDuration: attr({
            default: 10,
        }),
    };

    UserSetting.modelName = 'mail.user_setting';

    return UserSetting;
}

registerNewModel('mail.user_setting', factory);
