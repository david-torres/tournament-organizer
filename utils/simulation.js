async function createMemberIfNotExists(client, name) {
  try {
    const existingMember = await client.searchMembers(name);

    if ('rows' in existingMember && existingMember['rows'].length > 0) {
      console.log(`Fetched member ${name}`);
      return existingMember['rows'][0];
    }

    console.log(`Created member ${name}`);
    return client.createMember(name);
  } catch (error) {
    console.error(`Error creating member: ${error.message}`);
    throw error;
  }
}

function displayMatchResults(matches) {
  console.log('\nMatch results:');
  console.log('------------------------------------');
  matches.forEach((match) => {
    const player2Name = match.player2 ? match.player2.member.name : 'BYE';
    const winnerName = match.winner ? match.winner.member.name : 'BYE';
    const winnerElo = match.winner ? `(${match.winner.member.elo})` : '';

    console.log(
      `Round ${match.round} | Match ID: ${match.id} | ${match.player1.member.name} vs ${player2Name} | Winner: ${winnerName} ${winnerElo}`
    );
  });
  console.log('------------------------------------\n');
}

module.exports = {
  createMemberIfNotExists,
  displayMatchResults,
};

