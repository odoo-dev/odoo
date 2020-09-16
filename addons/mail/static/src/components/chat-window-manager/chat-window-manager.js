/** @odoo-module alias=mail.components.ChatWindowManager **/

import usingModels from 'mail.componentMixins.usingModels';

const { Component, QWeb } = owl;

class ChatWindowManager extends usingModels(Component) {}

Object.assign(ChatWindowManager, {
    props: {},
    template: 'mail.ChatWindowManager',
});

QWeb.registerComponent('ChatWindowManager', ChatWindowManager);

export default ChatWindowManager;
