function shuffleParticipants(participants) {
  for (let i = participants.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [participants[i], participants[j]] = [participants[j], participants[i]];
  }
}

function getPairKey(player1Id, player2Id) {
  return [player1Id, player2Id].sort((a, b) => a - b).join('-');
}

function getSwissScores(participants, existingMatches) {
  return participants.map((participant) => {
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

    return b.elo - a.elo;
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

function generateSingleEliminationMatches(participants) {
  const matches = [];
  let matchIndex = 0;

  const randomizedParticipants = [...participants];
  shuffleParticipants(randomizedParticipants);

  for (let position = 1; position <= randomizedParticipants.length / 2; position++) {
    const player1 = randomizedParticipants[matchIndex++];
    const player2 = randomizedParticipants[matchIndex++];

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
  const workingParticipants = [...participants];

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

function generateSwissMatches(participants, existingMatches = []) {
  const currentRound = existingMatches.length > 0 ? Math.max(...existingMatches.map((match) => match.round)) + 1 : 1;
  const blockedPairs = buildSwissBlockedPairs(participants, existingMatches, currentRound);
  return generateSwissRound(participants, existingMatches, blockedPairs);
}

module.exports = {
  generateSingleEliminationMatches,
  generateRoundRobinMatches,
  generateSwissMatches,
};
