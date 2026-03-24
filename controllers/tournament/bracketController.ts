export {};

const ejs = require('ejs');
const path = require('path');
const { Tournament, Participant, Match, Member } = require('../../models');
const utils = require('../../utils');

const MATCH_INCLUDES = [
  { model: Participant, as: 'player1', include: { model: Member, as: 'member' } },
  { model: Participant, as: 'player2', include: { model: Member, as: 'member' } },
  { model: Participant, as: 'winner', include: { model: Member, as: 'member' } },
];
const BRACKET_CACHE_TTL_MS = 5 * 60 * 1000;
const BRACKET_CACHE_MAX_ENTRIES = 100;
const bracketRenderCache = new Map();

function serializeParticipant(participant) {
  return {
    id: participant?.member?.id,
    name: participant?.member?.name,
  };
}

function serializeMatch(match) {
  return {
    id: match.id,
    bracket: match.bracket ?? null,
    position: match.position ?? null,
    round: match.round,
    player1: serializeParticipant(match.player1),
    player2: match.player2 ? serializeParticipant(match.player2) : null,
    winner: match.winner ? serializeParticipant(match.winner) : null,
  };
}

function getRoundBuckets(matches) {
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

function getBracketData(tournament, matches) {
  if (tournament.type !== 'double_elimination') {
    return getRoundBuckets(matches);
  }

  return {
    winners: getRoundBuckets(matches.filter((match) => match.bracket === 'winners')),
    losers: getRoundBuckets(matches.filter((match) => match.bracket === 'losers')),
    finals: getRoundBuckets(matches.filter((match) => match.bracket === 'finals')),
  };
}

function getMatchStateFragment(match) {
  return [
    match.id,
    match.bracket ?? 'main',
    match.position ?? 'slot',
    match.round,
    match.player1Id ?? match.player1?.id ?? 'p1',
    match.player2Id ?? match.player2?.id ?? 'bye',
    match.winnerId ?? match.winner?.id ?? 'pending',
    match.updatedAt ? new Date(match.updatedAt).toISOString() : 'no-updated-at',
  ].join(':');
}

function buildBracketCacheKey(tournament, matches, format) {
  const tournamentUpdatedAt = tournament.updatedAt ? new Date(tournament.updatedAt).toISOString() : 'no-updated-at';
  const matchState = matches.map(getMatchStateFragment).join('|');

  return [
    format,
    tournament.id,
    tournament.type ?? 'unknown',
    tournamentUpdatedAt,
    matchState,
  ].join('::');
}

function getCachedRender(cacheKey) {
  const cachedRender = bracketRenderCache.get(cacheKey);
  if (!cachedRender) {
    return null;
  }

  if (cachedRender.expiresAt <= Date.now()) {
    bracketRenderCache.delete(cacheKey);
    return null;
  }

  return cachedRender.value;
}

function setCachedRender(cacheKey, value) {
  bracketRenderCache.set(cacheKey, {
    value,
    expiresAt: Date.now() + BRACKET_CACHE_TTL_MS,
  });

  while (bracketRenderCache.size > BRACKET_CACHE_MAX_ENTRIES) {
    const oldestKey = bracketRenderCache.keys().next().value;
    bracketRenderCache.delete(oldestKey);
  }
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

    const bracketData = getBracketData(tournament, matches);

    if (format === 'json') {
      res.status(200).json(bracketData);
    } else if (format === 'html') {
      const cacheKey = buildBracketCacheKey(tournament, matches, 'html');
      const html = getCachedRender(cacheKey) ?? await generateBracketHtml(tournament, bracketData);
      if (!getCachedRender(cacheKey)) {
        setCachedRender(cacheKey, html);
      }
      res.status(200).send(html);
    } else if (format === 'image') {
      const htmlCacheKey = buildBracketCacheKey(tournament, matches, 'html');
      const imageCacheKey = buildBracketCacheKey(tournament, matches, 'image');
      const cachedImage = getCachedRender(imageCacheKey);
      if (cachedImage) {
        res.writeHead(200, { 'Content-Type': 'image/png' });
        res.end(cachedImage, 'binary');
        return;
      }

      const html = getCachedRender(htmlCacheKey) ?? await generateBracketHtml(tournament, bracketData);
      if (!getCachedRender(htmlCacheKey)) {
        setCachedRender(htmlCacheKey, html);
      }

      const img = await utils.generateBracketImage(html);

      if (!img) {
        return res.status(500).json({ error: 'Unable to generate bracket image' });
      }

      setCachedRender(imageCacheKey, img);
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
  bracketRenderCache,
  getBracket,
};
