const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || "YOUR_DISCORD_WEBHOOK_URL_HERE";
const TWITCH_CHANNELS = process.env.TWITCH_CHANNELS.split(' ') || ['#YOUR_TWITCH_CHANNEL_HERE'];

var request = require('request');
var tmi = require("tmi.js");

var options = {
  options: {
    debug: false
  },
  connection: {
    reconnect: true
  },
  channels: TWITCH_CHANNELS
};

var client = new tmi.client(options);

client.on("message", function (channel, userstate, message, self) {
  // Don't listen to my own messages..
  if (self) return;

  // Handle different message types..
  switch(userstate["message-type"]) {
    case "action":
      // This is an action message..
      break;
    case "chat":
      // console.log(userstate);
      if (message.indexOf("clips.twitch.tv/") !== -1) {
        postThing(`**${userstate["display-name"]}** posted a clip: ${message}`);
      }
      break;
    case "whisper":
      // This is a whisper..
      break;
    default:
      // Something else ?
      break;
  }
});

// Connect the client to the server..
client.connect();

function postThing(val) {
  request.post(
    DISCORD_WEBHOOK_URL,
    { json:
      {
        content: val,
      }
    },
    function (error, response, body) {
      if (!error && response.statusCode == 200) {
        console.log(body)
      }
    }
  );
}
