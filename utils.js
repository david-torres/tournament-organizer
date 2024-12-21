const nodeHtmlToImage = require('node-html-to-image');

const K_FACTOR = 32; // You can adjust the K-factor to control the impact of a single match on the Elo score

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

exports.updateElo = async (target1, target2, winnerId) => {
  const actualScore1 = String(winnerId) === String(target1.id) ? 1 : 0;
  const actualScore2 = 1 - actualScore1;
  const [newElo1, newElo2] = calculateUpdatedElo(target1['elo'], target2['elo'], actualScore1, actualScore2);

  await target1.update({ elo: newElo1 });
  await target2.update({ elo: newElo2 });
}

exports.decayElo = (participant, lastActiveDate, currentDate, customDecaySettings = null) => {
  const defaultDecaySettings = [
      { threshold: 10, decayPerDay: 1, minElo: 0, maxElo: 1200 },
      { threshold: 7, decayPerDay: 3, minElo: 1201, maxElo: 1800 },
      { threshold: 3, decayPerDay: 5, minElo: 1801, maxElo: Infinity }
  ];

  const decaySettings = customDecaySettings || defaultDecaySettings;

  const daysInactive = (currentDate - lastActiveDate) / (1000 * 3600 * 24);

  const participantElo = parseFloat(participant.elo) || 0;
  const tier = decaySettings.find(tier => participantElo >= tier.minElo && participantElo <= tier.maxElo);

  if (tier && daysInactive > tier.threshold) {
      const daysOverThreshold = daysInactive - tier.threshold;
      const eloDecay = daysOverThreshold * tier.decayPerDay;

      participant.elo = Math.max((participantElo - eloDecay).toFixed(2), tier.minElo);
  }

  return participant;
}

exports.generateBracketImage = async (bracketHtml) => {
  try {
    const image = await nodeHtmlToImage({
      html: bracketHtml
    });
    return image;
  } catch (err) {
    console.error(err);
    return false;
  }
};

exports.isPowerOfTwo = n => {
  // Check if the number is non-negative and has only one set bit
  return n > 0 && (n & (n - 1)) === 0;
};