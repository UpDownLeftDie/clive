'use strict';
const _ = require('lodash');
if (_.get(process, 'env.NODE_ENV') !== 'production') {
  require('dotenv').load();
}
// Imports
const FileSync = require('lowdb/adapters/FileSync');
const lowdb = require('lowdb');
const request = require('request-promise');
const tmi = require('tmi.js');
const URI = require('urijs');
const { createLogger, format, transports } = require('winston');

//Initialize constants
const config = {
  NODE_ENV: _.get(process, 'end.NODE_ENV'),
  LOG_LEVEL: _.get(process, 'env.LOG_LEVEL') || 'error',
  DISCORD_WEBHOOK_URL: _.get(process, 'env.DISCORD_WEBHOOK_URL'),
  TWITCH_CHANNELS: generateChannelList(_.get(process, 'env.TWITCH_CHANNELS')),
  DB_FILE: _.get(process, 'env.DB_FILE') || 'db.json',
  TWITCH_CLIENT_ID: _.get(process, 'env.TWITCH_CLIENT_ID') || null,
  RESTRICT_CHANNELS: _.get(process, 'env.RESTRICT_CHANNELS') || true,
  BROADCASTER_ONLY: _.get(process, 'env.BROADCASTER_ONLY') === 'true' || false,
  MODS_ONLY: _.get(process, 'env.MODS_ONLY') === 'true' || false,
  SUBS_ONLY: _.get(process, 'env.SUBS_ONLY') === 'true' || false,
  RICH_EMBED: _.get(process, 'env.RICH_EMBED') === 'true' || false,
  API: _.get(process, 'env.API') === 'true' || false,
  API_PORT: _.get(process, 'env.API_PORT') || 3000,
};

//Initialize logger
const logger = createLogger({
  level: config.LOG_LEVEL,
  format: format.combine(format.timestamp(), format.prettyPrint()),
  transports: [
    // - Write to all logs with level `info` and below to `clive.log`
    new transports.File({
      filename: _.get(process, 'env.LOG_FILE') || 'clive.log',
    }),
  ],
});
if (config.NODE_ENV !== 'production') {
  logger.add(
    new transports.Console({
      format: format.simple(),
    }),
  );
}

if (config.API) {
  require('./router')(config.API_PORT);
}

// If we have a twitch client ID and you want to restrict postings of clips to only those channels Clive is watching
// Do a one-time lookup of twitch login names to IDs
let TWITCH_CHANNEL_IDS = [];
if (config.TWITCH_CLIENT_ID && config.RESTRICT_CHANNELS) {
  resolveTwitchUsernamesToIds(config.TWITCH_CHANNELS).then(userIds => {
    TWITCH_CHANNEL_IDS = userIds;
    logStartInfo();
  });
} else {
  logStartInfo();
}

const adapter = new FileSync(config.DB_FILE);
const db = lowdb(adapter);
db.defaults({ postedClipIds: [] }).write();

function logStartInfo() {
  const sanitizedSettings = _.cloneDeep(config);
  delete sanitizedSettings.TWITCH_CLIENT_ID;
  logger.log('info', 'CONFIG SETTINGS:\n', sanitizedSettings);
  logger.log(
    'info',
    `Twitch Client ID is ${config.TWITCH_CLIENT_ID ? '' : 'NOT '}set`,
  );

  createTmiClient();
}

function createTmiClient() {
  const tmiOptions = {
    options: {
      debug: _.get(process, 'env.LOG_LEVEL') === 'debug' || false,
    },
    connection: {
      reconnect: true,
    },
    channels: config.TWITCH_CHANNELS,
  };

  const client = new tmi.client(tmiOptions);

  // Check messages that are posted in twitch chat
  client.on('message', (channel, userstate, message, self) => {
    const debugMessage = {
      channel,
      userstate,
      message,
    };
    logger.log('debug', 'NEW MESSAGE:\n', debugMessage);

    // Don't listen to my own messages..
    if (self) return;
    // Broadcaster only mode
    const isBroadcaster = _.get(userstate, '[badges].broadcaster') === '1';
    if (config.BROADCASTER_ONLY && !isBroadcaster) {
      logger.log('info', `NON-BROADCASTER posted a clip: ${message}`);
      return;
    }
    // Mods only mode
    if (config.MODS_ONLY && !(userstate['mod'] || isBroadcaster)) {
      logger.log('info', `NON-MOD posted a clip: ${message}`);
      return;
    }
    // Subs only mode
    if (config.SUBS_ONLY && !userstate['subscriber']) {
      logger.log('info', `NON-SUB posted a clip: ${message}`);
      return;
    }

    // Handle different message types..
    switch (userstate['message-type']) {
      case 'action':
        // This is an action message..
        break;
      case 'chat':
        if (message.indexOf('clips.twitch.tv/') !== -1) {
          logger.log('debug', `CLIP DETECTED: in message: ${message}`);
          const clipId = getUrlSlug(message);
          // check if its this clip has already been shared
          const postedClip = chceckDbForClip(clipId);
          if (postedClip) {
            logger.log(
              'info',
              `PREVIOUSLY SHARED CLIP: ${clipId} was pushed to Discord on ${new Date(
                postedClip.date,
              )}`,
            );
            return;
          }
          // If we have a client ID we can use the Twitch API
          if (config.TWITCH_CLIENT_ID) {
            postUsingTwitchAPI(clipId);
          } else {
            // Fallback to dumb method of posting
            postUsingMessageInfo({ clipId, message, userstate });
          }
        }
        break;
      case 'whisper':
        // This is a whisper..
        break;
      default:
        // Something else ?
        break;
    }
  });

  // Connect the client to the server..
  client.connect();
}

function postUsingTwitchAPI(clipId) {
  twitchApiGetCall('clips', clipId).then(clipInfo => {
    logger.log('debug', 'Twitch clip results:', clipInfo);

    if (
      config.RESTRICT_CHANNELS &&
      TWITCH_CHANNEL_IDS.indexOf(clipInfo.broadcaster_id) === -1
    ) {
      logger.log('info', 'OUTSIDER CLIP: Posted in chat from tracked channel');
      return;
    }

    Promise.all([
      twitchApiGetCall('users', clipInfo.creator_id),
      twitchApiGetCall('users', clipInfo.broadcaster_id),
      twitchApiGetCall('games', clipInfo.game_id),
    ]).then(results => {
      logger.log('debug', 'DEBUG: Async results:\n', results);
      const content = buildMessage({
        userInfo: results[0],
        broadcasterInfo: results[1],
        gameInfo: results[2],
        clipInfo,
      });
      logger.log('debug', 'DEBUG: generated rich embed', content);
      postToDiscord({ content, clipId, clipInfo });
    });
  });
}

function postUsingMessageInfo({ clipId, message, userstate }) {
  const content = `**${userstate['display-name']}** posted a clip: ${message}`;
  postToDiscord({ content, clipId });
}

function getUrlSlug(message) {
  // split message by spaces, then filter out anything that's not a twitch clip
  const urls = _.filter(_.split(message, ' '), messagePart => {
    return messagePart.indexOf('clips.twitch.tv/') !== -1;
  });
  logger.log('debug', `URLs FOUND: ${urls.length} urls: `, urls);
  if (urls.length < 1) {
    logger.log('error', 'ERROR: no urls found in message', message);
    return;
  }

  const path = URI(urls[0]).path();
  const clipId = path.replace('/', '');
  if (!path || !clipId) {
    logger.log('error', `MALFORMED URL: ${urls[0]}`);
    return;
  }
  logger.log('debug', `CLIP SLUG: ${clipId}`);
  return clipId;
}

function chceckDbForClip(clipId) {
  return db
    .get('postedClipIds')
    .find({ id: clipId })
    .value();
}

function insertClipIdToDb(clipId) {
  db
    .get('postedClipIds')
    .push({ id: clipId, date: Date.now() })
    .write();
}

async function twitchApiGetCall(endpoint, id) {
  if (!config.TWITCH_CLIENT_ID) return;
  const options = {
    uri: `https://api.twitch.tv/helix/${endpoint}`,
    qs: {
      id: id,
    },
    headers: {
      'Client-ID': config.TWITCH_CLIENT_ID,
    },
    json: true,
  };
  logger.log('info', `GET: /${endpoint}?id=${id}`);
  try {
    const response = await request(options);
    return response.data[0];
  } catch (err) {
    logger.log('error', `ERROR: GET twitch API /${endpoint}:`, err);
  }
}

async function resolveTwitchUsernamesToIds(usernames) {
  if (!config.TWITCH_CLIENT_ID) return [];

  const usernameFuncs = usernames.map(async username => {
    const options = {
      uri: `https://api.twitch.tv/helix/users`,
      qs: {
        login: username.replace('#', ''),
      },
      headers: {
        'Client-ID': config.TWITCH_CLIENT_ID,
      },
      json: true,
    };
    logger.log('info', `GET: /users?login=${username}`);
    try {
      const response = await request(options);
      return response.data[0].id;
    } catch (err) {
      logger.log('error', `ERROR: GET twitch API /users:`, err);
    }
  });
  return await Promise.all(usernameFuncs).then(userIds => userIds);
}

function postToDiscord({ content, clipId, clipInfo }) {
  let body = {};
  if (typeof content === 'object') {
    body = content;
  } else {
    body = { content };
  }
  body.username = 'Clive';
  body.avatar_url = 'http://i.imgur.com/9s3TBNv.png';

  const options = {
    method: 'POST',
    uri: config.DISCORD_WEBHOOK_URL,
    body,
    json: true,
    resolveWithFullResponse: true,
  };

  if (config.RICH_EMBED && config.TWITCH_CLIENT_ID) {
    const videoOptions = _.cloneDeep(options);
    delete videoOptions.body.embeds;
    videoOptions.body.content = `*${clipInfo.title}*\n${clipInfo.url}`;
    logger.log('debug', 'POST: 1 of 2 requests with options', videoOptions);

    // ensure order of the posts, nest the promises
    request
      .post(videoOptions)
      .then(response => {
        if (response.statusCode === 204) {
          logger.log('debug', 'POST: 2 of 2 requests with options', options);
          request
            .post(options)
            .then(response => {
              if (response.statusCode === 204) {
                insertClipIdToDb(clipId);
              }
            })
            .catch(err => {
              logger.log('error', 'ERROR: posting to Discord', err);
            });
        }
      })
      .catch(err => {
        logger.log('error', 'ERROR: posting to Discord', err);
      });
  } else {
    request
      .post(options)
      .then(response => {
        if (response.statusCode === 204) {
          insertClipIdToDb(clipId);
        }
      })
      .catch(err => {
        logger.log('error', 'ERROR: posting to Discord', err);
      });
  }
}

function buildMessage({ userInfo, broadcasterInfo, gameInfo, clipInfo }) {
  if (!config.RICH_EMBED) {
    const string = `*${clipInfo.title}*\n**${
      userInfo.display_name
    }** created a clip of **${broadcasterInfo.display_name}** playing __${
      gameInfo.name
    }__\n${clipInfo.url}`;
    return string;
  } else {
    return {
      content: '',
      embeds: [
        {
          title: clipInfo.title,
          url: clipInfo.url,
          color: 9442302,
          timestamp: clipInfo.created_at,
          thumbnail: {
            url: gameInfo.box_art_url
              .replace('{height}', '80')
              .replace('{width}', '80'),
          },
          author: {
            name: userInfo.display_name,
            url: `https://www.twitch.tv/${userInfo.login}`,
            icon_url: userInfo.profile_image_url,
          },
          fields: [
            {
              name: 'Channel',
              value: `[${broadcasterInfo.display_name}](https://www.twitch.tv/${
                broadcasterInfo.login
              })`,
              inline: true,
            },
            {
              name: 'Game',
              value: gameInfo.name || '',
              inline: true,
            },
          ],
        },
      ],
    };
  }
}

// Takes space-separated string of twitch channels parses them, adds a # prefix, and puts them into an array
function generateChannelList(channelsString) {
  const channelArray = _.split(channelsString, ' ');

  return channelArray.map(channel => {
    return `#${channel.toLowerCase()}`;
  });
}
