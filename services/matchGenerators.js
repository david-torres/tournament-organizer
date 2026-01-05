function shuffleParticipants(participants) {
  for (let i = participants.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [participants[i], participants[j]] = [participants[j], participants[i]];
  }
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
  const rounds = workingParticipants.length % 2 === 0 ? workingParticipants.length - 1 : workingParticipants.length;
  const numberOfMatches = workingParticipants.length / 2;

  if (workingParticipants.length % 2 !== 0) {
    workingParticipants.push({ id: null });
  }

  for (let round = 1; round <= rounds; round++) {
    for (let match = 1; match <= numberOfMatches; match++) {
      const player1 = workingParticipants[match - 1];
      const player2 = workingParticipants[workingParticipants.length - match];

      if (player1.id !== player2.id && player1.id !== null && player2.id !== null) {
        matches.push({
          round,
          player1Id: player1.id,
          player2Id: player2.id,
        });
      }
    }

    const firstParticipant = workingParticipants.shift();
    const secondParticipant = workingParticipants.shift();
    workingParticipants.push(firstParticipant);
    workingParticipants.unshift(secondParticipant);
  }

  return matches;
}

function generateSwissMatches(participants, existingMatches = []) {
  const sortedParticipants = [...participants];

  sortedParticipants.sort((a, b) => {
    const aScore = existingMatches.filter((m) => m.winnerId === a.id).length;
    const bScore = existingMatches.filter((m) => m.winnerId === b.id).length;

    if (bScore !== aScore) {
      return bScore - aScore;
    }
    return b.elo - a.elo;
  });

  const matches = [];
  const paired = new Set();
  const currentRound = existingMatches.length > 0 ? Math.max(...existingMatches.map((m) => m.round)) + 1 : 1;

  if (sortedParticipants.length % 2 !== 0) {
    const byePlayer = sortedParticipants.pop();
    matches.push({
      round: currentRound,
      player1Id: byePlayer.id,
      player2Id: null,
    });
    paired.add(byePlayer.id);
  }

  for (let i = 0; i < sortedParticipants.length; i++) {
    if (paired.has(sortedParticipants[i].id)) continue;

    for (let j = i + 1; j < sortedParticipants.length; j++) {
      const player1 = sortedParticipants[i];
      const player2 = sortedParticipants[j];

      if (!paired.has(player2.id)) {
        matches.push({
          round: currentRound,
          player1Id: player1.id,
          player2Id: player2.id,
        });
        paired.add(player1.id);
        paired.add(player2.id);
        break;
      }
    }
  }

  return matches;
}

module.exports = {
  generateSingleEliminationMatches,
  generateRoundRobinMatches,
  generateSwissMatches,
};

