export {};

const ejs = require('ejs');
const path = require('path');
const { Tournament, Participant, Match, Member } = require('../../models');
const { generateBracketImage } = require('../../utils');

const MATCH_INCLUDES = [
  { model: Participant, as: 'player1', include: { model: Member, as: 'member' } },
  { model: Participant, as: 'player2', include: { model: Member, as: 'member' } },
  { model: Participant, as: 'winner', include: { model: Member, as: 'member' } },
];

function serializeParticipant(participant) {
  return {
    id: participant?.member?.id,
    name: participant?.member?.name,
  };
}

function serializeMatch(match) {
  return {
    id: match.id,
    round: match.round,
    player1: serializeParticipant(match.player1),
    player2: match.player2 ? serializeParticipant(match.player2) : null,
    winner: match.winner ? serializeParticipant(match.winner) : null,
  };
}

function getBracketData(matches) {
  const rounds = {};

  matches.forEach((match) => {
    const roundNumber = match.round;
    if (!rounds[roundNumber]) {
      rounds[roundNumber] = [];
    }

    rounds[roundNumber].push(serializeMatch(match));
  });

  return rounds;
}

async function generateBracketHtml(tournament, rounds) {
  const templatePath = path.join(__dirname, '..', '..', 'bracket.ejs');
  return ejs.renderFile(templatePath, { tournament, rounds });
}

async function getBracket(req, res) {
  const tournamentId = req.params.id;
  const format = req.query.format || 'json';

  try {
    const tournament = await Tournament.findByPk(tournamentId);
    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }

    const matches = await Match.findAll({
      where: { tournamentId },
      include: MATCH_INCLUDES,
      order: [['round', 'ASC'], ['id', 'ASC']],
    });

    const bracketData = getBracketData(matches);

    if (format === 'json') {
      res.status(200).json(bracketData);
    } else if (format === 'html') {
      const html = await generateBracketHtml(tournament, bracketData);
      res.status(200).send(html);
    } else if (format === 'image') {
      const html = await generateBracketHtml(tournament, bracketData);
      const img = await generateBracketImage(html);
      res.writeHead(200, { 'Content-Type': 'image/png' });
      res.end(img, 'binary');
    } else {
      res.status(400).json({ error: 'Invalid format specified' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
}

module.exports = {
  getBracket,
};
