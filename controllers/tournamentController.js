const ejs = require('ejs');
const path = require('path');
const { shuffleArray, calculateUpdatedElo, generateBracketImage } = require('../utils');

// Create a new tournament
exports.createTournament = async (req, res, db) => {
  const { name, type } = req.body;

  try {
    await db.run('INSERT INTO tournaments (name, type) VALUES (?, ?)', [name, type], function (err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.status(200).json({ id: this.lastID, name, type });
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Add a participant to a tournament
exports.addParticipant = async (req, res, db) => {
  const { member_id } = req.body;
  const tournament_id = req.params.id;

  try {
    await db.run('INSERT INTO participants (member_id, tournament_id) VALUES (?, ?)', [member_id, tournament_id], function (err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.status(200).json({ id: this.lastID, member_id, tournament_id });
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get participants in a tournament
exports.getParticipants = (req, res, db) => {
  const tournament_id = req.params.id;
  db.all('SELECT * FROM participants WHERE tournament_id = ?', [tournament_id], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.status(200).json(rows);
  });
};

// Generate matches for a single elimination tournament with byes based on ELO scores and random match-ups
exports.generateMatches = async (req, res, db) => {
  const tournament_id = req.params.id;

  try {
    // Get the list of participants for the tournament
    const participants = await new Promise((resolve, reject) => {
      db.all('SELECT p.*, m.name, m.elo_score FROM participants p JOIN members m ON p.member_id = m.id WHERE p.tournament_id = ? ORDER BY m.elo_score DESC', [tournament_id], (err, rows) => {
        if (err) {
          reject(err);
        }
        resolve(rows);
      });
    });

    // Calculate the number of byes needed
    const nextPowerOfTwo = 2 ** Math.ceil(Math.log2(participants.length));
    const byes = nextPowerOfTwo - participants.length;

    // Assign byes to the highest ELO players
    const byeParticipants = participants.splice(0, byes);
    for (const participant of byeParticipants) {
      participant.bye = true;
    }

    // Shuffle the remaining participants
    const randomizedParticipants = shuffleArray(participants);

    // Merge the two participant lists
    const finalParticipants = byeParticipants.concat(randomizedParticipants);

    // Create an array of match rounds
    const rounds = Math.log2(nextPowerOfTwo);
    const matches = [];

    // Generate matches for each round
    for (let round = 1; round <= rounds; round++) {
      const roundMatches = [];

      // Calculate the number of matches for the current round
      const numMatches = finalParticipants.length / (2 ** round);

      for (let i = 0; i < numMatches; i++) {
        // Assign participants for the match
        const participant1 = finalParticipants.shift();
        const participant2 = finalParticipants.shift();

        // Check if either participant has a bye
        if (participant1.bye || participant2.bye) {
          // Re-add the non-bye participant to the finalParticipants array for the next round
          if (participant1.bye) {
            finalParticipants.push(participant2);
          } else {
            finalParticipants.push(participant1);
          }
        } else {
          console.log(`Insert match: ${participant1.name} vs ${participant2.name}, round ${round} of ${numMatches}, TournamentID-${tournament_id}`);
          // Insert a match into the matches table
          const insertResult = await db.run('INSERT INTO matches (tournament_id, round, participant1_id, participant2_id) VALUES (?, ?, ?, ?)', [tournament_id, round, participant1.id, participant2.id], function (err) {
            if (err) {
              throw err;
            }

            // Add the match to the roundMatches array
            const match = { id: this.lastID, tournament_id, round, participant1_id: participant1.id, participant2_id: participant2.id }
            roundMatches.push(match);
          });
        }
      }

      matches.push(roundMatches);
    }

    res.status(200).json(matches);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

async function advanceRound(db, tournamentId) {
  // Find the latest round
  const latestRoundResult = await new Promise((resolve, reject) => {
    db.get('SELECT MAX(round) as latestRound FROM matches WHERE tournament_id = ?', [tournamentId], (err, row) => {
      if (err) {
        reject(err);
      }
      resolve(row);
    });
  });

  const latestRound = latestRoundResult.latestRound;

  // Get the total number of matches in the latest round
  const matchesInLatestRoundResult = await new Promise((resolve, reject) => {
    db.get('SELECT COUNT(*) as matchCount FROM matches WHERE tournament_id = ? AND round = ?', [tournamentId, latestRound], (err, row) => {
      if (err) {
        reject(err);
      }
      resolve(row);
    });
  });

  const totalMatchesInLatestRound = matchesInLatestRoundResult.matchCount;

  // Get the number of completed matches in the latest round
  const completedMatchesInLatestRoundResult = await new Promise((resolve, reject) => {
    db.get('SELECT COUNT(*) as completedMatchCount FROM matches WHERE tournament_id = ? AND round = ? AND winner_id IS NOT NULL', [tournamentId, latestRound], (err, row) => {
      if (err) {
        reject(err);
      }
      resolve(row);
    });
  });

  const completedMatchesInLatestRound = completedMatchesInLatestRoundResult.completedMatchCount;

  // Check if all matches in the latest round are completed
  if (completedMatchesInLatestRound === totalMatchesInLatestRound) {
    // Get the winners of the completed matches in the latest round
    const winners = await new Promise((resolve, reject) => {
      db.all('SELECT winner_id FROM matches WHERE tournament_id = ? AND round = ?', [tournamentId, latestRound], (err, rows) => {
        if (err) {
          reject(err);
        }
        resolve(rows);
      });
    });

    // Calculate the next round number
    const nextRound = latestRound + 1;

    if (winners.length === 1) {
      // final winner, don't generate more matches
      return;
    }

    // Generate matches for the next round
    for (let i = 0; i < winners.length; i += 2) {
      const participant1Id = winners[i].winner_id;
      const participant2Id = winners[i + 1] ? winners[i + 1].winner_id : null;

      await db.run(
        'INSERT INTO matches (tournament_id, round, participant1_id, participant2_id) VALUES (?, ?, ?, ?)',
        [tournamentId, nextRound, participant1Id, participant2Id]
      );
    }
  }
}

// Update a match result and update participant ELO scores
exports.updateMatch = async (req, res, db) => {
  const tournament_id = req.params.id;
  const match_id = req.params.match_id;
  const { winner_id } = req.body;

  try {
    // Get the match details
    const match = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM matches WHERE id = ?', [match_id], (err, row) => {
        if (err) {
          reject(err);
        }
        resolve(row);
      });
    });

    if (!match) {
      res.status(404).json({ error: 'Match not found' });
      return;
    }

    const loser_id = winner_id === match.participant1_id ? match.participant2_id : match.participant1_id;

    // Get the ELO scores of the participants
    const [winner, loser] = await Promise.all([
      new Promise((resolve, reject) => {
        db.get('SELECT * FROM members WHERE id = ?', [winner_id], (err, row) => {
          if (err) {
            reject(err);
          }
          resolve(row);
        });
      }),
      new Promise((resolve, reject) => {
        db.get('SELECT * FROM members WHERE id = ?', [loser_id], (err, row) => {
          if (err) {
            reject(err);
          }
          resolve(row);
        });
      })
    ]);

    // Calculate the new ELO scores
    const [newWinnerElo, newLoserElo] = calculateUpdatedElo(winner.elo_score, loser.elo_score);

    // Update the ELO scores in the members table
    await Promise.all([
      db.run('UPDATE members SET elo_score = ? WHERE id = ?', [newWinnerElo, winner.id]),
      db.run('UPDATE members SET elo_score = ? WHERE id = ?', [newLoserElo, loser.id])
    ]);

    // Update the match result
    await db.run('UPDATE matches SET winner_id = ? WHERE id = ?', [winner_id, match_id]);

    // Check if the tournament should advance to the next round
    await advanceRound(db, tournament_id);

    res.status(200).json({ message: 'Match result and ELO scores updated' });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

async function getBracketData(db, tournamentId) {
  return new Promise((resolve, reject) => {
    const bracket = {};

    db.serialize(() => {
      db.get('SELECT * FROM tournaments WHERE id = ?', [tournamentId], (err, row) => {
        if (err) {
          reject(err);
        } else if (!row) {
          resolve(null);
        } else {
          bracket.id = row.id;
          bracket.name = row.name;
          bracket.participants = [];
          bracket.matches = [];
        }
      });

      db.all('SELECT p.*, m.name, m.elo_score FROM participants p JOIN members m ON p.member_id = m.id WHERE p.tournament_id = ? ORDER BY m.elo_score DESC', [tournamentId], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          rows.forEach((row) => {
            bracket.participants.push({
              id: row.id,
              name: row.name,
              elo: row.elo_score,
            });
          });
        }
      });

      db.all('SELECT * FROM matches WHERE tournament_id = ?', [tournamentId], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          rows.forEach((row) => {
            bracket.matches.push({
              id: row.id,
              round: row.round,
              participant1_id: row.participant1_id,
              participant2_id: row.participant2_id,
              winner_id: row.winner_id,
            });
          });
          resolve(bracket);
        }
      });
    });
  });
}

async function generateBracketHtml(matches) {
  const templatePath = path.join(__dirname, '..', 'bracket.ejs');
  const html = await ejs.renderFile(templatePath, { matches });

  return html;
}

// Get the bracket for a tournament
exports.getBracket = async (req, res, db) => {
  const tournamentId = req.params.id;
  const bracket = await getBracketData(db, tournamentId);

  if (!bracket) {
    return res.status(404).json({ message: 'Tournament not found' });
  }

  const outputFormat = req.query.format || 'json';

  if (outputFormat === 'html') {
    const bracketHtml = await generateBracketHtml(bracket);
    res.send(bracketHtml);
  } else if (outputFormat === 'image') {
    try {
      const bracketHtml = await generateBracketHtml(bracket);
      const imageData = await generateBracketImage(bracketHtml);
      const buffer = Buffer.from(imageData.split(',')[1], 'base64');
      res.set('Content-Type', 'image/png');
      res.send(buffer);
    } catch (error) {
      console.error('Error generating bracket image:', error.message);
      res.status(500).json({ message: 'Error generating bracket image' });
    }
  } else {
    res.json(bracket);
  }
};

exports.getMatches = async (req, res, db) => {
  const tournamentId = req.params.id;
  const status = req.query.status;

  try {
    switch (status) {
      case 'pending':
        db.all('SELECT * FROM matches WHERE tournament_id = ? AND winner_id IS NULL',
          [tournamentId], function (err, rows) {
            if (err) {
              throw err;
            }
            res.json(rows);
          });
        break;
      case 'completed':
        db.all('SELECT * FROM matches WHERE tournament_id = ? AND winner_id IS NOT NULL',
          [tournamentId], function (err, rows) {
            if (err) {
              throw err;
            }
            res.json(rows);
          });
        break;
      case 'all':
      default:
        db.all('SELECT * FROM matches WHERE tournament_id = ?',
          [tournamentId], function (err, rows) {
            if (err) {
              throw err;
            }
            res.json(rows);
          });
        break;
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
