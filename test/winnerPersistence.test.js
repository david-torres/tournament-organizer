const test = require('node:test');
const assert = require('node:assert/strict');

const {
  advanceSingleElimination,
  advanceRoundRobin,
  advanceSwiss,
} = require('../services/tournamentAdvancers');
const tournamentController = require('../controllers/tournament/tournamentController');
const models = require('../models');

async function seedSingleEliminationTournament() {
  await models.sequelize.sync({ force: true });

  const tournament = await models.Tournament.create({
    name: `Winner Persistence ${Date.now()}`,
    type: 'single_elimination',
    size: 2,
    status: 'in_progress',
  });

  const winnerMember = await models.Member.create({
    name: `Winner Member ${Date.now()}`,
    elo: 1200,
  });

  const loserMember = await models.Member.create({
    name: `Loser Member ${Date.now()}`,
    elo: 1200,
  });

  const winnerParticipant = await models.Participant.create({
    memberId: winnerMember.id,
    tournamentId: tournament.id,
  });

  const loserParticipant = await models.Participant.create({
    memberId: loserMember.id,
    tournamentId: tournament.id,
  });

  await models.Match.create({
    round: 1,
    player1Id: winnerParticipant.id,
    player2Id: loserParticipant.id,
    winnerId: winnerParticipant.id,
    tournamentId: tournament.id,
  });

  return { tournament, winnerParticipant };
}

async function createParticipant(tournament, name, options = {}) {
  const member = await models.Member.create({
    name: `${name} ${Date.now()}`,
    elo: options.memberElo ?? 1200,
  });

  return models.Participant.create({
    memberId: member.id,
    tournamentId: tournament.id,
    elo: options.participantElo ?? 1200,
  });
}

function createRes() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

test('single-elimination advancement persists tournament winnerId after the final match', async () => {
  const { tournament, winnerParticipant } = await seedSingleEliminationTournament();

  await advanceSingleElimination(tournament);

  const refreshedTournament = await models.Tournament.findByPk(tournament.id);

  assert.equal(refreshedTournament.status, 'completed');
  assert.equal(refreshedTournament.winnerId, winnerParticipant.id);
});

test('round-robin advancement persists the standings winner using head-to-head resolution', async () => {
  await models.sequelize.sync({ force: true });

  const tournament = await models.Tournament.create({
    name: `Round Robin Winner ${Date.now()}`,
    type: 'round_robin',
    size: 4,
    status: 'in_progress',
  });

  const participantA = await createParticipant(tournament, 'Round Robin A');
  const participantB = await createParticipant(tournament, 'Round Robin B');
  const participantC = await createParticipant(tournament, 'Round Robin C');
  const participantD = await createParticipant(tournament, 'Round Robin D');

  await models.Match.bulkCreate([
    { round: 1, player1Id: participantA.id, player2Id: participantD.id, winnerId: participantA.id, tournamentId: tournament.id },
    { round: 1, player1Id: participantB.id, player2Id: participantC.id, winnerId: participantB.id, tournamentId: tournament.id },
    { round: 2, player1Id: participantA.id, player2Id: participantC.id, winnerId: participantA.id, tournamentId: tournament.id },
    { round: 2, player1Id: participantD.id, player2Id: participantB.id, winnerId: participantB.id, tournamentId: tournament.id },
    { round: 3, player1Id: participantA.id, player2Id: participantB.id, winnerId: participantA.id, tournamentId: tournament.id },
    { round: 3, player1Id: participantC.id, player2Id: participantD.id, winnerId: participantD.id, tournamentId: tournament.id },
  ]);

  const loadedTournament = await models.Tournament.findByPk(tournament.id, {
    include: { model: models.Participant, as: 'participants' },
  });

  await advanceRoundRobin(loadedTournament);

  const refreshedTournament = await models.Tournament.findByPk(tournament.id);

  assert.equal(refreshedTournament.status, 'completed');
  assert.equal(refreshedTournament.winnerId, participantA.id);
});

test('swiss advancement persists the standings winner using computed tie-breaks instead of Elo fallback', async () => {
  await models.sequelize.sync({ force: true });

  const tournament = await models.Tournament.create({
    name: `Swiss Winner ${Date.now()}`,
    type: 'swiss',
    size: 4,
    status: 'in_progress',
  });

  const participantA = await createParticipant(tournament, 'Swiss A', { participantElo: 1200 });
  const participantB = await createParticipant(tournament, 'Swiss B', { participantElo: 2200 });
  const participantC = await createParticipant(tournament, 'Swiss C', { participantElo: 1200 });
  const participantD = await createParticipant(tournament, 'Swiss D', { participantElo: 1200 });

  await models.Match.bulkCreate([
    { round: 1, player1Id: participantA.id, player2Id: participantB.id, winnerId: participantA.id, tournamentId: tournament.id },
    { round: 1, player1Id: participantC.id, player2Id: participantD.id, winnerId: participantC.id, tournamentId: tournament.id },
    { round: 2, player1Id: participantA.id, player2Id: participantC.id, winnerId: participantC.id, tournamentId: tournament.id },
    { round: 2, player1Id: participantB.id, player2Id: participantD.id, winnerId: participantB.id, tournamentId: tournament.id },
    { round: 3, player1Id: participantA.id, player2Id: participantD.id, winnerId: participantA.id, tournamentId: tournament.id },
    { round: 3, player1Id: participantB.id, player2Id: participantC.id, winnerId: participantB.id, tournamentId: tournament.id },
  ]);

  const loadedTournament = await models.Tournament.findByPk(tournament.id, {
    include: { model: models.Participant, as: 'participants' },
  });

  await advanceSwiss(loadedTournament);

  const refreshedTournament = await models.Tournament.findByPk(tournament.id);

  assert.equal(refreshedTournament.status, 'completed');
  assert.equal(refreshedTournament.winnerId, participantA.id);
});

test('league endTournament should write the winning participant id, not the member id', async () => {
  const originalFindByPk = models.Tournament.findByPk;
  let recordedUpdate = null;

  models.Tournament.findByPk = async () => ({
    id: 77,
    type: 'league',
    status: 'in_progress',
    participants: [
      {
        id: 21,
        elo: 1800,
        member: {
          id: 101,
          name: 'Winner',
          elo: 1800,
        },
      },
      {
        id: 22,
        elo: 1200,
        member: {
          id: 102,
          name: 'Runner Up',
          elo: 1200,
        },
      },
    ],
    update: async (values) => {
      recordedUpdate = values;
      return values;
    },
  });

  try {
    const req = {
      params: {
        id: '77',
      },
    };
    const res = createRes();

    await tournamentController.endTournament(req, res);

    assert.equal(res.statusCode, 200);
    assert.deepStrictEqual(recordedUpdate, {
      status: 'completed',
      winnerId: 21,
    });
  } finally {
    models.Tournament.findByPk = originalFindByPk;
  }
});

test('Tournament winnerId should survive a reload from sqlite', async () => {
  await models.sequelize.sync({ force: true });

  const tournament = await models.Tournament.create({
    name: `Reloaded Winner ${Date.now()}`,
    type: 'league',
    status: 'completed',
  });

  await tournament.update({ winnerId: 999 });

  const reloadedTournament = await models.Tournament.findByPk(tournament.id);

  assert.equal(reloadedTournament.winnerId, 999);
});
