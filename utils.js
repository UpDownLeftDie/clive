'use strict';
const _ = require('lodash');

module.exports = {
  loadConfig: () => {
    return {
      NODE_ENV: _.get(process, 'env.NODE_ENV') || 'dev',
      LOG_LEVEL: _.get(process, 'env.LOG_LEVEL') || 'error',
      DISCORD_WEBHOOK_URL: _.get(process, 'env.DISCORD_WEBHOOK_URL'),
      TWITCH_CHANNELS: _generateChannelList(
        _.get(process, 'env.TWITCH_CHANNELS'),
      ),
      DB_FILE: _.get(process, 'env.DB_FILE') || 'db.json',
      TWITCH_CLIENT_ID: _.get(process, 'env.TWITCH_CLIENT_ID') || undefined,
      RESTRICT_CHANNELS: _.get(process, 'env.RESTRICT_CHANNELS') != 'false',
      BROADCASTER_ONLY:
        _.get(process, 'env.BROADCASTER_ONLY') == 'true' || false,
      MODS_ONLY: _.get(process, 'env.MODS_ONLY') == 'true' || false,
      SUBS_ONLY: _.get(process, 'env.SUBS_ONLY') == 'true' || false,
      RICH_EMBED: _.get(process, 'env.RICH_EMBED') == 'true' || false,
      API: _.get(process, 'env.API') == 'true' || false,
      API_PORT: _.get(process, 'env.API_PORT') || 3000,
    };
  },
};

// Takes space-separated string of twitch channels parses them, adds a # prefix, and puts them into an array
function _generateChannelList(channelsString) {
  const channelArray = _.split(channelsString, ' ');

  return channelArray.map(channel => {
    if (channel.indexOf('#') === 0) return channel.toLowerCase();
    return `#${channel.toLowerCase()}`;
  });
}
