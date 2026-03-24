export {};

function normalizeParticipant(participant) {
  if (participant && typeof participant.get === 'function') {
    return participant.get({ plain: true });
  }

  return participant;
}

function normalizeParticipants(participants) {
  return participants.map(normalizeParticipant);
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
  if (participants.length === 0) {
    return [];
  }

  const [firstParticipant, ...remainingParticipants] = participants;

  for (let index = 0; index < remainingParticipants.length; index++) {
    const secondParticipant = remainingParticipants[index];
    const pairKey = getPairKey(firstParticipant.id, secondParticipant.id);

    if (blockedPairs.has(pairKey)) {
      continue;
    }

    const nextParticipants = [
      ...remainingParticipants.slice(0, index),
      ...remainingParticipants.slice(index + 1),
    ];
    const restOfPairs = pairWithoutRematches(nextParticipants, blockedPairs);

    if (restOfPairs) {
      return [
        {
          player1Id: firstParticipant.id,
          player2Id: secondParticipant.id,
        },
        ...restOfPairs,
      ];
    }
  }

  return null;
}

function toRoundMatches(round, pairings) {
  return pairings.map((match) => ({
    round,
    ...match,
  }));
}

function generateSwissRound(participants, existingMatches = [], blockedPairs = new Set()) {
  const sortedParticipants = sortSwissParticipants(participants, existingMatches);
  const currentRound = existingMatches.length > 0 ? Math.max(...existingMatches.map((match) => match.round)) + 1 : 1;
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

function buildSwissBlockedPairs(participants, existingMatches, currentRound) {
  const blockedPairs = new Set();

  for (let round = 1; round < currentRound; round++) {
    const historicalMatches = existingMatches.filter((match) => match.round < round);
    const roundMatches = generateSwissRound(participants, historicalMatches, blockedPairs);

    roundMatches.forEach((match) => {
      if (match.player2Id !== null) {
        blockedPairs.add(getPairKey(match.player1Id, match.player2Id));
      }
    });
  }

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
  const currentRound = existingMatches.length > 0 ? Math.max(...existingMatches.map((match) => match.round)) + 1 : 1;
  const blockedPairs = buildSwissBlockedPairs(participants, existingMatches, currentRound);
  return generateSwissRound(participants, existingMatches, blockedPairs);
}

module.exports = {
  assignEffectiveSeeds,
  generateSingleEliminationMatches,
  generateRoundRobinMatches,
  generateLeagueMatches,
  generateSwissMatches,
  sortParticipantsForSetup,
};
