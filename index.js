const TelegramBot = require('node-telegram-bot-api');
const port = process.env.PORT || 3000;
const config = require('./config.json');
const axios = require('axios');
let search = require('youtube-search');

const TOKEN = config.token;

const bot = new TelegramBot(TOKEN, {
  webHook: {
    port,
    autoOpen: false
  }
});

bot.openWebHook();
bot.setWebHook(`${config.url}/bot${TOKEN}`);

bot.onText(/\/start/, msg => {
  bot.sendMessage(msg.chat.id, 'Just enter the name of the band and I will tell ya');
});

bot.onText(/\/help(.+)/, (msg, [source, match]) => {
  bot.sendMessage(msg.chat.id, match);
});

async function getBandId(band) {
  let response = await axios.get(`https://musicbrainz.org/ws/2/artist/?query=artist:${band}&fmt=json`);
  let bandId = response.data.artists[0].id;
  return bandId;
}

async function getReleases(id) {
  let response = await axios.get(`https://musicbrainz.org/ws/2/release-group?artist=${id}&type=album&fmt=json`);
  let releases = response.data["release-groups"];

  await releases.sort((a, b) => {
    if (a["first-release-date"] > b["first-release-date"]) return 1;
    if (a["first-release-date"] < b["first-release-date"]) return -1;
  });

  return releases;
}

async function getNewRecords(id) {
  let releases = await getReleases(id);

  let currentDate = new Date().toISOString();

  let latestRelease, upcomingRelease;
  if (releases[releases.length-1]["first-release-date"] < currentDate) {
    latestRelease = releases[releases.length-1];
  } else if (releases[releases.length-1]["first-release-date"] > currentDate) {
    latestRelease = releases.slice(-2)[0];
    upcomingRelease = releases[releases.length-1];
  }

  let newRecords = typeof upcomingRelease !== "undefined" ? [latestRelease, upcomingRelease] : [latestRelease];
  return newRecords;
}

const searchOptions = {
  maxResults: 1,
  key: config.youtubeKey
};

function getYouTubeLink(release) {
  return new Promise((resolve, reject) => {
    search(release, searchOptions, (err, results) => {
      if(err) return console.log(err);
      resolve(results[0].link);
    });
  })
}

bot.onText(/\/band(.+)/, async (msg, [source, match]) => {

  let band = match.toLowerCase();
  let bandId = await getBandId(band);

  let newRecords = await getNewRecords(bandId);
  let latestReleaseTitle = newRecords[0]["title"];
  let latestReleaseDate = newRecords[0]["first-release-date"];
  let upcomingReleaseTitle = newRecords.length == 1 ? 'Unknown' : newRecords[1]["title"];
  let upcomingReleaseDate = newRecords.length == 1 ? '' : newRecords[1]["first-release-date"];

  let youTubeLinkLatest = await getYouTubeLink(`${band}-${latestReleaseTitle}`);
  let youTubeLinkUpcoming = await getYouTubeLink(`${band}-${upcomingReleaseTitle}`);

  await bot.sendMessage(msg.chat.id, `Latest release: ${latestReleaseTitle} : ${latestReleaseDate}. Listen here:`);
  await bot.sendMessage(msg.chat.id, `${youTubeLinkLatest}`);

  await bot.sendMessage(msg.chat.id, `Upcoming release: ${upcomingReleaseTitle} : ${upcomingReleaseDate}.`);
  upcomingReleaseTitle !== "Unknown" ? await bot.sendMessage(msg.chat.id, `Check out the new single! ${youTubeLinkUpcoming}`) : null;

});
