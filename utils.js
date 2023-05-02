const { JSDOM } = require('jsdom');
const html2canvas = require('html2canvas');

const K_FACTOR = 32; // You can adjust the K-factor to control the impact of a single match on the ELO score

function calculateExpectedScore(ratingA, ratingB) {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

exports.calculateUpdatedElo = (eloA, eloB, actualScoreA, actualScoreB) => {
  const expectedScoreA = calculateExpectedScore(eloA, eloB);
  const expectedScoreB = calculateExpectedScore(eloB, eloA);

  const newEloA = eloA + K_FACTOR * (actualScoreA - expectedScoreA);
  const newEloB = eloB + K_FACTOR * (actualScoreB - expectedScoreB);

  return [newEloA.toFixed(2), newEloB.toFixed(2)].map(parseFloat);
};

// TODO: fix this...
async function generateBracketImage(bracketHtml) {
  const dom = new JSDOM(bracketHtml);
  const { document } = dom.window;

  const canvas = await html2canvas(document.body, { useCORS: true });
  const imgData = canvas.toDataURL('image/png');

  return imgData;
}

module.exports.generateBracketImage = generateBracketImage;

exports.isPowerOfTwo = n => {
  // Check if the number is non-negative and has only one set bit
  return n > 0 && (n & (n - 1)) === 0;
}