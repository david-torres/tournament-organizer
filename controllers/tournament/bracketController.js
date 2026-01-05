const ejs = require('ejs');
const path = require('path');
const { Tournament, Participant, Match, Member } = require('../../models');
const { generateBracketImage } = require('../../utils');

function getBracketData(matches) {
  const rounds = {};

  matches.forEach((match) => {
    const roundNumber = match.round;
    if (!rounds[roundNumber]) {
      rounds[roundNumber] = [];
    }

    rounds[roundNumber].push({
      id: match.id,
      round: roundNumber,
      player1: {
        id: match.player1.member.id,
        name: match.player1.member.name,
      },
      player2: {
        id: match.player2.member.id,
        name: match.player2.member.name,
      },
      winner: match.winner
        ? {
            id: match.winner.member.id,
            name: match.winner.member.name,
          }
        : null,
    });
  });

  return rounds;
}

async function generateBracketHtml(tournament, rounds) {
  const templatePath = path.join(__dirname, '..', '..', 'bracket.ejs');
  const html = await ejs.renderFile(templatePath, { tournament, rounds });

  return html;
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
      include: [
        { model: Participant, as: 'player1', include: { model: Member, as: 'member' } },
        { model: Participant, as: 'player2', include: { model: Member, as: 'member' } },
        { model: Participant, as: 'winner', include: { model: Member, as: 'member' } },
      ],
      order: [['round', 'ASC'], ['id', 'ASC']],
    });

    const bracketData = getBracketData(matches);

    if (format === 'json') {
      res.json(bracketData);
    } else if (format === 'html') {
      const html = await generateBracketHtml(tournament, bracketData);
      res.send(html);
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

