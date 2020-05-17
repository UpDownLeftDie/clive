'use strict';
require('dotenv').config();
const _ = require('lodash');
const FileSync = require('lowdb/adapters/FileSync');
const lowdb = require('lowdb');
const request = require('request-promise');
const { URL } = require('url');
// Init Twitch-JS
const TwitchJs = require('twitch-js').default;
const { chat } = new TwitchJs({});
const { getAppToken } = require('./auth.js');

//Initialize constants
const config = require('./config');
const logger = require('./logger');
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const {
  BOT_USERNAME,
  BROADCASTER_ONLY,
  DB_FILE,
  DISCORD_WEBHOOK_URL,
  MODS_ONLY,
  RESTRICT_CHANNELS,
  RICH_EMBED,
  SUBS_ONLY,
  TWITCH_CHANNELS,
  URL_AVATAR,
} = config;
const adapter = new FileSync(DB_FILE);
const db = lowdb(adapter);
db.defaults({ postedClipIds: [] }).write();

// (twitch.tv\/.*\/clip) check https://www.twitch.tv/username/clip/clip_id
// (clips.twitch.tv) checks https://clips.twitch.tv/clip_id
const CLIPS_REGEX = /(twitch.tv\/.*\/clip)|(clips.twitch.tv)\/\w+/i;

main();
async function main() {
  // Application token, to be fetched async via getAppToken
  var APP_TOKEN = await getAppToken();
  // If we have a twitch app token and you want to restrict postings of clips to only those channels Clive is watching
  // Do a one-time lookup of twitch login names to IDs
  let TWITCH_CHANNEL_IDS = [];
  if (APP_TOKEN && RESTRICT_CHANNELS) {
    const userIds = await resolveTwitchUsernamesToIds(TWITCH_CHANNELS);
    TWITCH_CHANNEL_IDS = userIds;
  }

  logger.log('info', 'CONFIG SETTINGS:\n', config);
  logger.log('info', `Twitch App Token is ${APP_TOKEN ? '' : 'NOT '}set`);

  createTwitchClient();

  function createTwitchClient() {
    chat.connect().then((globalUserState) => {
      Promise.all(TWITCH_CHANNELS.map((channel) => chat.join(channel))).then(
        (channelStates) => {
          // Listen to private messages from #dallas and #ronni
          chat.on('PRIVMSG', (message) => {
            const self = message.isSelf;
            const isBroadcaster = message.tags.badges.broadcaster == '1';
            const isMod = message.tags.mod == '1';
            const isSub = message.tags.subscriber == '1';
            const chatMessage = message.message;

            // logger.log("debug", "NEW MESSAGE:\n", message);

            // Don't listen to my own messages..
            if (self) return;
            // Broadcaster only mode
            if (BROADCASTER_ONLY && !isBroadcaster) {
              logger.log(
                'info',
                `NON-BROADCASTER posted a clip: ${chatMessage}`,
              );
              return;
            }
            // Mods only mode
            if (MODS_ONLY && !(isMod || isBroadcaster)) {
              logger.log('info', `NON-MOD posted a clip: ${chatMessage}`);
              return;
            }
            // Subs only mode
            if (SUBS_ONLY && !isSub) {
              logger.log('info', `NON-SUB posted a clip: ${chatMessage}`);
              return;
            }

            // Handle different message types..
            switch (message.event) {
              case 'PRIVMSG':
                if (CLIPS_REGEX.test(chatMessage)) {
                  logger.log(
                    'debug',
                    `CLIP DETECTED: in message: ${chatMessage}`,
                  );
                  const clipId = getUrlSlug(chatMessage);
                  // check if its this clip has already been shared
                  const postedClip = checkDbForClip(clipId);
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
                  if (APP_TOKEN) {
                    postUsingTwitchAPI(clipId);
                  } else {
                    // Fallback to dumb method of posting
                    const displayName = message.tags.displayName;
                    postUsingMessageInfo({ clipId, displayName });
                  }
                }
                break;
              default:
                // Something else ?
                break;
            }
          });
        },
      );
    });
  }

  function postUsingTwitchAPI(clipId) {
    twitchApiGetCall('clips', clipId)
      .then((res) => {
        logger.log('debug', 'Twitch clip results:', res);
        const clipInfo = {
          ...res,
          title: res.title.trim(),
        };

        if (
          RESTRICT_CHANNELS &&
          TWITCH_CHANNEL_IDS.indexOf(clipInfo.broadcaster_id) === -1
        ) {
          logger.log(
            'info',
            'OUTSIDER CLIP: Posted in chat from tracked channel',
          );
          return;
        }

        Promise.all([
          twitchApiGetCall('users', clipInfo.creator_id),
          twitchApiGetCall('users', clipInfo.broadcaster_id),
          twitchApiGetCall('games', clipInfo.game_id),
        ]).then((results) => {
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
      })
      .catch((e) => {
        logger.log('error', `ERROR: GET twitch API:`, e);
      });
  }

  function postUsingMessageInfo({ clipId, displayName }) {
    const clipUrl = `https://clips.twitch.tv/${clipId}`;
    const content = `**${displayName}** posted a clip: ${clipUrl}`;
    postToDiscord({ content, clipId });
  }

  function getUrlSlug(message) {
    // split message by spaces, then filter out anything that's not a twitch clip
    const urls = _.filter(_.split(message, ' '), (messagePart) => {
      return CLIPS_REGEX.test(messagePart);
    });
    logger.log('debug', `URLs FOUND: ${urls.length} urls: `, urls);
    if (urls.length < 1) {
      logger.log('error', 'ERROR: no urls found in message', message);
      return;
    }

    const path = new URL(urls[0]).pathname;
    const clipId = path.split('/').pop();
    if (!path || !clipId) {
      logger.log('error', `MALFORMED URL: ${urls[0]}`);
      return;
    }
    logger.log('debug', `CLIP SLUG: ${clipId}`);
    return clipId;
  }

  function checkDbForClip(clipId) {
    return db.get('postedClipIds').find({ id: clipId }).value();
  }

  function insertClipIdToDb(clipId) {
    db.get('postedClipIds').push({ id: clipId, date: Date.now() }).write();
  }

  async function twitchApiGetCall(endpoint, id) {
    if (!APP_TOKEN) return;
    const options = {
      uri: `https://api.twitch.tv/helix/${endpoint}`,
      qs: {
        id: id,
      },
      headers: {
        'Client-ID': TWITCH_CLIENT_ID,
        Authorization: `Bearer ${APP_TOKEN}`,
      },
      json: true,
    };
    logger.log('info', `GET: /${endpoint}?id=${id}`);
    try {
      const response = await request(options);
      return response.data[0];
    } catch (err) {
      logger.log('error', `ERROR: GET twitch API /${endpoint}:`, err);
      console.error(`ERROR: GET twitch API /${endpoint}: ${err}`);
      return err;
    }
  }

  async function resolveTwitchUsernamesToIds(usernames) {
    if (!APP_TOKEN) return [];

    const usernameFuncs = usernames.map(async (username) => {
      const options = {
        uri: `https://api.twitch.tv/helix/users`,
        qs: {
          login: username.replace('#', ''),
        },
        headers: {
          'Client-ID': TWITCH_CLIENT_ID,
          Authorization: `Bearer ${APP_TOKEN}`,
        },
        json: true,
      };
      logger.log('info', `GET: /users?login=${username}`);
      try {
        const response = await request(options);
        return response.data[0].id;
      } catch (err) {
        logger.log('error', `ERROR: GET twitch API /users:`, err);
        return err;
      }
    });
    return await Promise.all(usernameFuncs).then((userIds) => userIds);
  }

  function postToDiscord({ content, clipId, clipInfo }) {
    let body = {};
    if (typeof content === 'object') {
      body = content;
    } else {
      body = { content };
    }
    body.username = BOT_USERNAME;
    body.avatar_url = URL_AVATAR;

    const options = {
      method: 'POST',
      uri: DISCORD_WEBHOOK_URL,
      body,
      json: true,
      resolveWithFullResponse: true,
    };

    if (RICH_EMBED && APP_TOKEN) {
      const videoOptions = _.cloneDeep(options);
      delete videoOptions.body.embeds;
      videoOptions.body.content = `*${clipInfo.title}*\n${clipInfo.url}`;
      logger.log('debug', 'POST: 1 of 2 requests with options', videoOptions);

      // ensure order of the posts, nest the promises
      request
        .post(videoOptions)
        .then((response) => {
          if (response.statusCode === 204) {
            logger.log('debug', 'POST: 2 of 2 requests with options', options);
            request
              .post(options)
              .then((response) => {
                if (response.statusCode === 204) {
                  insertClipIdToDb(clipId);
                }
              })
              .catch((err) => {
                logger.log('error', 'ERROR: posting to Discord', err);
              });
          }
        })
        .catch((err) => {
          logger.log('error', 'ERROR: posting to Discord', err);
        });
    } else {
      request
        .post(options)
        .then((response) => {
          if (response.statusCode === 204) {
            insertClipIdToDb(clipId);
          }
        })
        .catch((err) => {
          logger.log('error', 'ERROR: posting to Discord', err);
        });
    }
  }

  function buildMessage({ userInfo, broadcasterInfo, gameInfo, clipInfo }) {
    if (!RICH_EMBED) {
      let playingStr = '';
      if (gameInfo) playingStr = ` playing __${gameInfo.name}__`;
      const string = `*${clipInfo.title}*\n**${userInfo.display_name}** created a clip of **${broadcasterInfo.display_name}**${playingStr}\n${clipInfo.url}`;
      return string;
    } else {
      if (gameInfo) {
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
                  value: `[${broadcasterInfo.display_name}](https://www.twitch.tv/${broadcasterInfo.login})`,
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
      // Fallback to less information if no gameInfo is set on clip
      return {
        content: '',
        embeds: [
          {
            title: clipInfo.title,
            url: clipInfo.url,
            color: 9442302,
            timestamp: clipInfo.created_at,
            author: {
              name: userInfo.display_name,
              url: `https://www.twitch.tv/${userInfo.login}`,
              icon_url: userInfo.profile_image_url,
            },
            fields: [
              {
                name: 'Channel',
                value: `[${broadcasterInfo.display_name}](https://www.twitch.tv/${broadcasterInfo.login})`,
                inline: true,
              },
            ],
          },
        ],
      };
    }
  }
}
