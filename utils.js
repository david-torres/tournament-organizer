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
  const actualScore1 = winnerId === target1.id ? 1 : 0;
  const actualScore2 = 1 - actualScore1;
  const [newElo1, newElo2] = calculateUpdatedElo(target1['elo'], target2['elo'], actualScore1, actualScore2);

  await target1.update({ elo: newElo1 });
  await target2.update({ elo: newElo2 });
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