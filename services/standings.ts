export {};

function normalizeParticipant(participant) {
  if (participant && typeof participant.get === 'function') {
    return participant.get({ plain: true });
  }

  return participant;
}

function normalizeMatch(match) {
  if (match && typeof match.get === 'function') {
    return match.get({ plain: true });
  }

  return match;
}

function getCompletedMatches(matches) {
  return matches
    .map(normalizeMatch)
    .filter((match) => match.winnerId !== null && match.winnerId !== undefined);
}

function getParticipantMatches(matches, participantId) {
  return matches.filter((match) => match.player1Id === participantId || match.player2Id === participantId);
}

function getOpponentId(match, participantId) {
  if (match.player1Id === participantId) {
    return match.player2Id;
  }

  if (match.player2Id === participantId) {
    return match.player1Id;
  }

  return null;
}

function buildTieGroupWins(group, matches) {
  const groupIds = new Set(group.map((record) => record.participantId));
  const winsByParticipantId = new Map<number, number>(group.map((record) => [record.participantId, 0]));

  matches.forEach((match) => {
    if (!groupIds.has(match.player1Id) || !groupIds.has(match.player2Id)) {
      return;
    }

    if (!winsByParticipantId.has(match.winnerId)) {
      return;
    }

    winsByParticipantId.set(match.winnerId, (winsByParticipantId.get(match.winnerId) || 0) + 1);
  });

  return winsByParticipantId;
}

function getHeadToHeadResult(leftRecord, rightRecord, matches) {
  const directMatch = matches.find((match) => {
    const participants = [match.player1Id, match.player2Id];
    return participants.includes(leftRecord.participantId) && participants.includes(rightRecord.participantId);
  });

  if (!directMatch) {
    return 0;
  }

  if (directMatch.winnerId === leftRecord.participantId) {
    return -1;
  }

  if (directMatch.winnerId === rightRecord.participantId) {
    return 1;
  }

  return 0;
}

function compareNumbersDesc(leftValue, rightValue) {
  return rightValue - leftValue;
}

function compareNumbersAsc(leftValue, rightValue) {
  return leftValue - rightValue;
}

function compareParticipantIds(leftRecord, rightRecord) {
  return compareNumbersAsc(leftRecord.participantId, rightRecord.participantId);
}

function buildBaseStandings(tournament, participants, matches) {
  const normalizedParticipants = participants.map(normalizeParticipant);
  const completedMatches = getCompletedMatches(matches);

  const winsByParticipantId = new Map<number, number>(
    normalizedParticipants.map((participant) => [
      participant.id,
      completedMatches.filter((match) => match.winnerId === participant.id).length,
    ]),
  );

  return normalizedParticipants.map((participant) => {
    const participantMatches = getParticipantMatches(completedMatches, participant.id);
    const defeatedOpponents = participantMatches
      .filter((match) => match.winnerId === participant.id)
      .map((match) => getOpponentId(match, participant.id))
      .filter((opponentId) => opponentId !== null);
    const opponentIds = participantMatches
      .map((match) => getOpponentId(match, participant.id))
      .filter((opponentId) => opponentId !== null);
    const wins = winsByParticipantId.get(participant.id) || 0;
    const losses = participantMatches.filter((match) => match.winnerId !== participant.id && getOpponentId(match, participant.id) !== null).length;
    const byes = participantMatches.filter((match) => match.player2Id === null && match.winnerId === participant.id).length;
    const member = participant.member || null;

    return {
      participantId: participant.id,
      memberId: member?.id ?? participant.memberId ?? null,
      memberName: member?.name ?? null,
      wins,
      losses,
      byes,
      matchesPlayed: participantMatches.length,
      points: wins,
      buchholz: opponentIds.reduce((total, opponentId) => total + (winsByParticipantId.get(opponentId) || 0), 0),
      sonnebornBerger: defeatedOpponents.reduce((total, opponentId) => total + (winsByParticipantId.get(opponentId) || 0), 0),
      miniLeagueWins: 0,
      lastCompletedRound: participantMatches.reduce((latestRound, match) => Math.max(latestRound, match.round || 0), 0),
      currentElo: tournament.type === 'league'
        ? participant.elo ?? null
        : member?.elo ?? participant.elo ?? null,
      isWinner: tournament.winnerId === participant.id,
    };
  });
}

function sortSingleEliminationStandings(records) {
  return [...records].sort((leftRecord, rightRecord) =>
    compareNumbersDesc(leftRecord.wins, rightRecord.wins)
    || compareNumbersDesc(leftRecord.lastCompletedRound, rightRecord.lastCompletedRound)
    || compareParticipantIds(leftRecord, rightRecord));
}

function sortLeagueStandings(records) {
  return [...records].sort((leftRecord, rightRecord) =>
    compareNumbersDesc(leftRecord.currentElo ?? 0, rightRecord.currentElo ?? 0)
    || compareNumbersDesc(leftRecord.wins, rightRecord.wins)
    || compareNumbersDesc(leftRecord.matchesPlayed, rightRecord.matchesPlayed)
    || compareParticipantIds(leftRecord, rightRecord));
}

function sortRoundRobinStandings(records, matches) {
  const standings = [...records].sort((leftRecord, rightRecord) =>
    compareNumbersDesc(leftRecord.wins, rightRecord.wins)
    || compareParticipantIds(leftRecord, rightRecord));

  let currentIndex = 0;
  while (currentIndex < standings.length) {
    const currentWins = standings[currentIndex].wins;
    const group = [];

    while (currentIndex < standings.length && standings[currentIndex].wins === currentWins) {
      group.push(standings[currentIndex]);
      currentIndex += 1;
    }

    const miniLeagueWinsByParticipantId = buildTieGroupWins(group, matches);
    const sortedGroup = group
      .map((record) => ({
        ...record,
        miniLeagueWins: miniLeagueWinsByParticipantId.get(record.participantId) || 0,
      }))
      .sort((leftRecord, rightRecord) =>
        compareNumbersDesc(leftRecord.miniLeagueWins, rightRecord.miniLeagueWins)
        || compareNumbersDesc(leftRecord.sonnebornBerger, rightRecord.sonnebornBerger)
        || compareParticipantIds(leftRecord, rightRecord));

    standings.splice(currentIndex - group.length, group.length, ...sortedGroup);
  }

  return standings;
}

function sortSwissStandings(records, matches) {
  const standings = [...records].sort((leftRecord, rightRecord) =>
    compareNumbersDesc(leftRecord.wins, rightRecord.wins)
    || compareNumbersDesc(leftRecord.buchholz, rightRecord.buchholz)
    || compareNumbersDesc(leftRecord.sonnebornBerger, rightRecord.sonnebornBerger)
    || compareNumbersAsc(leftRecord.byes, rightRecord.byes)
    || compareParticipantIds(leftRecord, rightRecord));

  let currentIndex = 0;
  while (currentIndex < standings.length) {
    const group = [standings[currentIndex]];
    currentIndex += 1;

    while (
      currentIndex < standings.length
      && standings[currentIndex].wins === group[0].wins
      && standings[currentIndex].buchholz === group[0].buchholz
      && standings[currentIndex].sonnebornBerger === group[0].sonnebornBerger
    ) {
      group.push(standings[currentIndex]);
      currentIndex += 1;
    }

    if (group.length !== 2) {
      continue;
    }

    const [leftRecord, rightRecord] = group;
    const headToHeadResult = getHeadToHeadResult(leftRecord, rightRecord, matches);

    if (headToHeadResult === 0) {
      continue;
    }

    const replacementGroup = headToHeadResult < 0
      ? [leftRecord, rightRecord]
      : [rightRecord, leftRecord];

    standings.splice(currentIndex - group.length, group.length, ...replacementGroup);
  }

  return standings;
}

function getTieBreakOrder(type) {
  const tieBreakOrderByType = {
    single_elimination: ['wins', 'last_completed_round', 'participant_id'],
    round_robin: ['wins', 'head_to_head_group_wins', 'sonneborn_berger', 'participant_id'],
    swiss: ['wins', 'buchholz', 'sonneborn_berger', 'head_to_head_if_two_way_tie', 'fewer_byes', 'participant_id'],
    league: ['elo', 'wins', 'matches_played', 'participant_id'],
  };

  return tieBreakOrderByType[type] || ['participant_id'];
}

function rankStandingsByType(tournament, standings, matches) {
  switch (tournament.type) {
    case 'single_elimination':
      return sortSingleEliminationStandings(standings);
    case 'round_robin':
      return sortRoundRobinStandings(standings, matches);
    case 'swiss':
      return sortSwissStandings(standings, matches);
    case 'league':
      return sortLeagueStandings(standings);
    default:
      return [...standings].sort(compareParticipantIds);
  }
}

function getStandingsForTournament(tournament, participants = [], matches = []) {
  const completedMatches = getCompletedMatches(matches);
  const baseStandings = buildBaseStandings(tournament, participants, completedMatches);
  const sortedStandings = rankStandingsByType(tournament, baseStandings, completedMatches)
    .map((record, index) => ({
      rank: index + 1,
      ...record,
      isWinner: tournament.winnerId != null
        ? tournament.winnerId === record.participantId
        : index === 0 && tournament.status === 'completed',
    }));

  return {
    tournamentId: tournament.id,
    type: tournament.type,
    status: tournament.status,
    tieBreakOrder: getTieBreakOrder(tournament.type),
    standings: sortedStandings,
  };
}

module.exports = {
  getStandingsForTournament,
};
