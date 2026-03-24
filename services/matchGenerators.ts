export {};

type DoubleEliminationSource =
  | { type: 'seed'; seed: number }
  | { type: 'winner'; matchId: string }
  | { type: 'loser'; matchId: string };

type DoubleEliminationNode = {
  id: string;
  bracket: 'winners' | 'losers' | 'finals';
  round: number;
  position: number;
  sources: DoubleEliminationSource[];
};

function normalizeParticipant(participant) {
  if (participant && typeof participant.get === 'function') {
    return participant.get({ plain: true });
  }

  return participant;
}

function normalizeParticipants(participants) {
  return participants.map(normalizeParticipant);
}

function normalizeMatch(match) {
  if (match && typeof match.get === 'function') {
    return match.get({ plain: true });
  }

  return match;
}

function normalizeMatches(matches) {
  return matches.map(normalizeMatch);
}

function compareParticipantsBySetupOrder(leftParticipant, rightParticipant) {
  const leftSeed = leftParticipant.seed;
  const rightSeed = rightParticipant.seed;

  if (leftSeed != null && rightSeed != null && leftSeed !== rightSeed) {
    return leftSeed - rightSeed;
  }

  if (leftSeed != null && rightSeed == null) {
    return -1;
  }

  if (leftSeed == null && rightSeed != null) {
    return 1;
  }

  return leftParticipant.id - rightParticipant.id;
}

function compareParticipantsBySeedPreference(leftParticipant, rightParticipant) {
  const leftSeed = leftParticipant.seed;
  const rightSeed = rightParticipant.seed;

  if (leftSeed != null && rightSeed != null && leftSeed !== rightSeed) {
    return leftSeed - rightSeed;
  }

  if (leftSeed != null && rightSeed == null) {
    return -1;
  }

  if (leftSeed == null && rightSeed != null) {
    return 1;
  }

  return 0;
}

function sortParticipantsForSetup(participants) {
  return [...normalizeParticipants(participants)].sort(compareParticipantsBySetupOrder);
}

function assignEffectiveSeeds(participants) {
  const orderedParticipants = sortParticipantsForSetup(participants);
  const usedSeeds = new Set(orderedParticipants.filter((participant) => participant.seed != null).map((participant) => participant.seed));
  let nextAvailableSeed = 1;

  return orderedParticipants.map((participant) => {
    if (participant.seed != null) {
      return {
        ...participant,
        effectiveSeed: participant.seed,
      };
    }

    while (usedSeeds.has(nextAvailableSeed)) {
      nextAvailableSeed += 1;
    }

    const effectiveSeed = nextAvailableSeed;
    usedSeeds.add(effectiveSeed);
    nextAvailableSeed += 1;

    return {
      ...participant,
      effectiveSeed,
    };
  });
}

function buildSingleEliminationSeedPositions(size) {
  let positions = [1, 2];

  for (let bracketSize = 4; bracketSize <= size; bracketSize *= 2) {
    positions = positions.flatMap((seed) => [seed, bracketSize + 1 - seed]);
  }

  return positions;
}

function getDoubleEliminationMatchId(bracket, round, position) {
  const bracketPrefixByType = {
    winners: 'W',
    losers: 'L',
    finals: 'F',
  };

  return `${bracketPrefixByType[bracket]}:${round}:${position}`;
}

function createDoubleEliminationNode(bracket, round, position, sources): DoubleEliminationNode {
  return {
    id: getDoubleEliminationMatchId(bracket, round, position),
    bracket,
    round,
    position,
    sources,
  };
}

function buildDoubleEliminationPlan(participantCount) {
  const totalWinnerRounds = Math.log2(participantCount);

  if (!Number.isInteger(totalWinnerRounds) || participantCount < 2) {
    return [];
  }

  const seedPositions = buildSingleEliminationSeedPositions(participantCount);
  const plan: DoubleEliminationNode[] = [];

  for (let round = 1; round <= totalWinnerRounds; round += 1) {
    const matchCount = participantCount / (2 ** round);

    for (let position = 1; position <= matchCount; position += 1) {
      const sources = round === 1
        ? [
          { type: 'seed', seed: seedPositions[(position - 1) * 2] },
          { type: 'seed', seed: seedPositions[((position - 1) * 2) + 1] },
        ]
        : [
          { type: 'winner', matchId: getDoubleEliminationMatchId('winners', round - 1, (position * 2) - 1) },
          { type: 'winner', matchId: getDoubleEliminationMatchId('winners', round - 1, position * 2) },
        ];

      plan.push(createDoubleEliminationNode('winners', round, position, sources));
    }
  }

  if (totalWinnerRounds === 1) {
    const openingFinalId = getDoubleEliminationMatchId('winners', 1, 1);

    plan.push(createDoubleEliminationNode('finals', 1, 1, [
      { type: 'winner', matchId: openingFinalId },
      { type: 'loser', matchId: openingFinalId },
    ]));
    plan.push(createDoubleEliminationNode('finals', 2, 1, [
      { type: 'winner', matchId: openingFinalId },
      { type: 'loser', matchId: openingFinalId },
    ]));

    return plan;
  }

  const totalLoserRounds = (totalWinnerRounds * 2) - 2;

  for (let round = 1; round <= totalLoserRounds; round += 1) {
    const matchCount = participantCount / (2 ** (Math.floor((round + 1) / 2) + 1));
    const isOddRound = round % 2 === 1;

    for (let position = 1; position <= matchCount; position += 1) {
      let sources: DoubleEliminationSource[];

      if (round === 1) {
        sources = [
          { type: 'loser', matchId: getDoubleEliminationMatchId('winners', 1, (position * 2) - 1) },
          { type: 'loser', matchId: getDoubleEliminationMatchId('winners', 1, position * 2) },
        ];
      } else if (isOddRound) {
        sources = [
          { type: 'winner', matchId: getDoubleEliminationMatchId('losers', round - 1, (position * 2) - 1) },
          { type: 'winner', matchId: getDoubleEliminationMatchId('losers', round - 1, position * 2) },
        ];
      } else {
        const sourceWinnerRound = Math.floor(round / 2) + 1;
        sources = [
          { type: 'winner', matchId: getDoubleEliminationMatchId('losers', round - 1, position) },
          { type: 'loser', matchId: getDoubleEliminationMatchId('winners', sourceWinnerRound, position) },
        ];
      }

      plan.push(createDoubleEliminationNode('losers', round, position, sources));
    }
  }

  plan.push(createDoubleEliminationNode('finals', 1, 1, [
    { type: 'winner', matchId: getDoubleEliminationMatchId('winners', totalWinnerRounds, 1) },
    { type: 'winner', matchId: getDoubleEliminationMatchId('losers', totalLoserRounds, 1) },
  ]));
  plan.push(createDoubleEliminationNode('finals', 2, 1, [
    { type: 'winner', matchId: getDoubleEliminationMatchId('winners', totalWinnerRounds, 1) },
    { type: 'winner', matchId: getDoubleEliminationMatchId('losers', totalLoserRounds, 1) },
  ]));

  return plan;
}

function getPairKey(player1Id, player2Id) {
  return [player1Id, player2Id].sort((a, b) => a - b).join('-');
}

function getSwissScores(participants, existingMatches) {
  return normalizeParticipants(participants).map((participant) => {
    const wins = existingMatches.filter((match) => match.winnerId === participant.id).length;

    return {
      wins,
      ...participant,
    };
  });
}

function sortSwissParticipants(participants, existingMatches) {
  return [...getSwissScores(participants, existingMatches)].sort((a, b) => {
    if (b.wins !== a.wins) {
      return b.wins - a.wins;
    }

    const seedPreferenceComparison = compareParticipantsBySeedPreference(a, b);
    if (seedPreferenceComparison !== 0) {
      return seedPreferenceComparison;
    }

    return b.elo - a.elo || a.id - b.id;
  });
}

function pairWithoutRematches(participants, blockedPairs) {
  const memo = new Map();

  function search(remainingParticipants) {
    if (remainingParticipants.length === 0) {
      return [];
    }

    const memoKey = remainingParticipants.map((participant) => participant.id).join(',');
    if (memo.has(memoKey)) {
      return memo.get(memoKey);
    }

    const [firstParticipant, ...otherParticipants] = remainingParticipants;

    for (let index = 0; index < otherParticipants.length; index++) {
      const secondParticipant = otherParticipants[index];
      const pairKey = getPairKey(firstParticipant.id, secondParticipant.id);

      if (blockedPairs.has(pairKey)) {
        continue;
      }

      const nextParticipants = [
        ...otherParticipants.slice(0, index),
        ...otherParticipants.slice(index + 1),
      ];
      const restOfPairs = search(nextParticipants);

      if (restOfPairs) {
        const pairings = [
          {
            player1Id: firstParticipant.id,
            player2Id: secondParticipant.id,
          },
          ...restOfPairs,
        ];
        memo.set(memoKey, pairings);
        return pairings;
      }
    }

    memo.set(memoKey, null);
    return null;
  }

  return search(participants);
}

function toRoundMatches(round, pairings) {
  return pairings.map((match) => ({
    round,
    ...match,
  }));
}

function generateSwissRound(participants, existingMatches = [], blockedPairs = new Set()) {
  const normalizedMatches = normalizeMatches(existingMatches);
  const sortedParticipants = sortSwissParticipants(participants, normalizedMatches);
  const currentRound = normalizedMatches.length > 0 ? Math.max(...normalizedMatches.map((match) => match.round)) + 1 : 1;
  const blockedPairKeys = new Set(blockedPairs);

  if (sortedParticipants.length % 2 !== 0) {
    for (let byeIndex = sortedParticipants.length - 1; byeIndex >= 0; byeIndex--) {
      const byeParticipant = sortedParticipants[byeIndex];
      const remainingParticipants = [
        ...sortedParticipants.slice(0, byeIndex),
        ...sortedParticipants.slice(byeIndex + 1),
      ];
      const pairings = pairWithoutRematches(remainingParticipants, blockedPairKeys);

      if (pairings) {
        return [
          {
            round: currentRound,
            player1Id: byeParticipant.id,
            player2Id: null,
          },
          ...toRoundMatches(currentRound, pairings),
        ];
      }
    }

    return [];
  }

  const pairings = pairWithoutRematches(sortedParticipants, blockedPairKeys);

  if (!pairings) {
    return [];
  }

  return toRoundMatches(currentRound, pairings);
}

function buildSwissBlockedPairs(existingMatches) {
  const blockedPairs = new Set();
  const normalizedMatches = normalizeMatches(existingMatches);

  normalizedMatches.forEach((match) => {
    if (match.player1Id != null && match.player2Id != null) {
      blockedPairs.add(getPairKey(match.player1Id, match.player2Id));
    }
  });

  return blockedPairs;
}

function generateSingleEliminationMatches(participants) {
  const matches = [];
  const seededParticipants = assignEffectiveSeeds(participants);
  const bracketPositions = buildSingleEliminationSeedPositions(seededParticipants.length);
  const participantsBySeed = new Map(seededParticipants.map((participant) => [participant.effectiveSeed, participant]));

  for (let position = 0; position < bracketPositions.length; position += 2) {
    const player1 = participantsBySeed.get(bracketPositions[position]);
    const player2 = participantsBySeed.get(bracketPositions[position + 1]);

    matches.push({
      round: 1,
      player1Id: player1.id,
      player2Id: player2.id,
    });
  }

  return matches;
}

function generateDoubleEliminationMatches(participants) {
  const seededParticipants = assignEffectiveSeeds(participants);
  const participantsBySeed = new Map(seededParticipants.map((participant) => [participant.effectiveSeed, participant]));
  const openingRound = buildDoubleEliminationPlan(seededParticipants.length)
    .filter((node) => node.bracket === 'winners' && node.round === 1);

  return openingRound.map((match) => {
    const [player1Source, player2Source] = match.sources;
    if (player1Source.type !== 'seed' || player2Source.type !== 'seed') {
      throw new Error('Double-elimination opening matches must originate from bracket seeds');
    }

    const player1 = participantsBySeed.get(player1Source.seed);
    const player2 = participantsBySeed.get(player2Source.seed);

    return {
      bracket: match.bracket,
      round: match.round,
      position: match.position,
      player1Id: player1.id,
      player2Id: player2.id,
    };
  });
}

function generateRoundRobinMatches(participants) {
  const matches = [];
  const workingParticipants = sortParticipantsForSetup(participants);

  if (workingParticipants.length % 2 !== 0) {
    workingParticipants.push({ id: null });
  }

  const totalRounds = workingParticipants.length - 1;
  const matchCountPerRound = workingParticipants.length / 2;

  for (let round = 1; round <= totalRounds; round++) {
    for (let index = 0; index < matchCountPerRound; index++) {
      const player1 = workingParticipants[index];
      const player2 = workingParticipants[workingParticipants.length - 1 - index];

      if (player1.id !== null && player2.id !== null) {
        matches.push({
          round,
          player1Id: player1.id,
          player2Id: player2.id,
        });
      }
    }

    const fixedParticipant = workingParticipants[0];
    const rotatingParticipants = workingParticipants.slice(1);
    rotatingParticipants.unshift(rotatingParticipants.pop());
    workingParticipants.splice(0, workingParticipants.length, fixedParticipant, ...rotatingParticipants);
  }

  return matches;
}

function generateLeagueMatches(participants) {
  return generateRoundRobinMatches(participants);
}

function generateSwissMatches(participants, existingMatches = []) {
  const normalizedMatches = normalizeMatches(existingMatches);
  const blockedPairs = buildSwissBlockedPairs(normalizedMatches);
  return generateSwissRound(participants, normalizedMatches, blockedPairs);
}

module.exports = {
  assignEffectiveSeeds,
  buildDoubleEliminationPlan,
  getDoubleEliminationMatchId,
  generateDoubleEliminationMatches,
  generateSingleEliminationMatches,
  generateRoundRobinMatches,
  generateLeagueMatches,
  generateSwissMatches,
  sortParticipantsForSetup,
};
