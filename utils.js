const { JSDOM } = require('jsdom');
const html2canvas = require('html2canvas');

const K_FACTOR = 32; // You can adjust the K-factor to control the impact of a single match on the ELO score

function calculateExpectedScore(ratingA, ratingB) {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

exports.calculateUpdatedElo = (eloA, eloB) => {
  const expectedScoreA = calculateExpectedScore(eloA, eloB);
  const expectedScoreB = calculateExpectedScore(eloB, eloA);

  const newEloA = eloA + K_FACTOR * (1 - expectedScoreA);
  const newEloB = eloB + K_FACTOR * (0 - expectedScoreB);

  return [newEloA, newEloB];
};

exports.shuffleArray = (array) => {
  let currentIndex = array.length;
  let temporaryValue;
  let randomIndex;

  // While there remain elements to shuffle
  while (currentIndex !== 0) {
    // Pick a remaining element
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex -= 1;

    // Swap it with the current element
    temporaryValue = array[currentIndex];
    array[currentIndex] = array[randomIndex];
    array[randomIndex] = temporaryValue;
  }

  return array;
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
