const nodeHtmlToImage = require('node-html-to-image');

const K_FACTOR = 32;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

function calculateExpectedScore(ratingA, ratingB) {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

const calculateUpdatedElo = (eloA, eloB, actualScoreA, actualScoreB) => {
  const expectedScoreA = calculateExpectedScore(eloA, eloB);
  const expectedScoreB = calculateExpectedScore(eloB, eloA);

  const newEloA = eloA + K_FACTOR * (actualScoreA - expectedScoreA);
  const newEloB = eloB + K_FACTOR * (actualScoreB - expectedScoreB);

  return [newEloA.toFixed(2), newEloB.toFixed(2)].map(parseFloat);
};

function isWinnerOneOfParticipants(target1, target2, winnerId) {
  return String(winnerId) === String(target1.id) || String(winnerId) === String(target2.id);
}

exports.updateElo = async (target1, target2, winnerId) => {
  if (!isWinnerOneOfParticipants(target1, target2, winnerId)) {
    throw new Error('Winner must be one of the match participants');
  }

  const actualScore1 = String(winnerId) === String(target1.id) ? 1 : 0;
  const actualScore2 = 1 - actualScore1;
  const [newElo1, newElo2] = calculateUpdatedElo(target1.elo, target2.elo, actualScore1, actualScore2);

  await target1.update({ elo: newElo1 });
  await target2.update({ elo: newElo2 });
};

function getDecaySettings(customDecaySettings) {
  const defaultDecaySettings = [
    { threshold: 10, decayPerDay: 1, minElo: 0, maxElo: 1200 },
    { threshold: 7, decayPerDay: 3, minElo: 1201, maxElo: 1800 },
    { threshold: 3,  decayPerDay: 5, minElo: 1801, maxElo: Infinity },
  ];

  return customDecaySettings || defaultDecaySettings;
}

function getDecayTier(decaySettings, elo) {
  return decaySettings.find((tier) => elo >= tier.minElo && elo <= tier.maxElo);
}

exports.decayElo = (participant, lastActiveDate, currentDate, customDecaySettings = null) => {
  const decaySettings = getDecaySettings(customDecaySettings);
  const daysInactive = Math.floor((currentDate - lastActiveDate) / MILLISECONDS_PER_DAY);
  let participantElo = parseFloat(participant.elo) || 0;

  for (let day = 1; day <= daysInactive; day++) {
    const tier = getDecayTier(decaySettings, participantElo);

    if (!tier) break;

    if (day > tier.threshold) {
      participantElo -= tier.decayPerDay;
      if (participantElo < 0) {
        participantElo = 0;
        break;
      }
    }
  }

  participant.elo = Number(participantElo.toFixed(2));
  return participant;
};

exports.generateBracketImage = async (bracketHtml) => {
  try {
    const image = await nodeHtmlToImage({ html: bracketHtml });
    return image;
  } catch (err) {
    console.error(err);
    return false;
  }
};

exports.isPowerOfTwo = (n) => {
  return n > 0 && (n & (n - 1)) === 0;
};
