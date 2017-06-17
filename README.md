<img src="http://i.imgur.com/M9TvvSy.png" alt="clive-mascot" width=64px />

## ☝️ That's Clive
He's a very simple bot that monitors Twitch chat for clips and auto-posts them to Discord. He runs on a diet of [nodejs](https://nodejs.org/en/) and [tmi.js](https://docs.tmijs.org/v1.2.1/index.html). He needs to live on a server (Like an [Amazon EC2 instance](https://aws.amazon.com/getting-started/tutorials/launch-a-virtual-machine/)). I use a [Pocket C.H.I.P.](https://getchip.com/pages/pocketchip) to host Clive.

**Some assembly required (it helps to be familiar with node).**

## 🤖 Instructions (OSX/Linux)
Before starting, make sure [nodejs](https://nodejs.org/en/download/) is installed. You will also need a [webhook](https://support.discordapp.com/hc/en-us/articles/228383668-Intro-to-Webhooks) for the Discord channel where these clips will be posted.

1. Open terminal.
2. Navigate to a directory (like `~/Developer`).
3. Run `git clone https://github.com/mangosango/Clive.git && cd Clive`.
4. Run `npm install`
5. Open `index.js` in a text editor (like [atom](https://atom.io/)).
6. Modify `... || YOUR_DISCORD_WEBHOOK_URL_HERE` to your [Discord webhook URL](http://i.imgur.com/sEUCxct.png) between the quotes.*
7. Modify `... || ["#YOUR_TWITCH_CHANNEL_HERE"]` to your Twitch channel. Keep the `#` in front of the channel. For example, if you wanted to watch for clips in `Monstercat`'s chat, you would use `... || ["#monstercat"]`. If you wanted to monitor multiple channels, you would use `... || ["#monstercat", "#mrchowderclam"]`.*
8. Save `index.js`.
9. In terminal, run `npm start`.
10. ???
11. Profit.

** If you prefer to use environment variables, you can set *`DISCORD_WEBHOOK_URL`* and *`TWITCH_CHANNELS`. `TWITCH_CHANNELS`* should be a space limited set of *`#channel_name`*s. You can set these in the provided *`clive.service`* file, or by using the *`export`* command. Here's a [short guide](http://blog.mdda.net/oss/2015/02/16/forever-node-service-systemd). on how to use systemd files*

## 📋 Todo
- Option to only send clips of a certain channel or channels.
- Option to only send clips posted by mods or subs.
- Having a UI or hosting this somewhere would be nice.
- ~~Set the `DISCORD_WEBHOOK_URL` to pull from an evar or something.~~
- Make clive an actual Discord bot, but that would require actual work lol.
- MFW the Readme is bigger than the app LUL

## 👯 Contributing
1. Create your own feature branch (using `git checkout -b ...` or whatever you want to use).
2. Write some nice code. Commit it! Push it!
3. Use Github's excellent pull request feature to submit a PR.
4. Someone will review your PR and merge to master!
5. Yay.
