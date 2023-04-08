# Tournament Management API

A REST API for creating and managing single-elimination tournaments, participants, and matches, with support for ELO ratings and bracket visualization.

## Features

- Create new members (participants)
- Create single-elimination tournaments
- Allow members to join tournaments
- Generate randomized matches, supporting byes for players with the highest ELO scores
- Generate a bracket graphic for visualizing the tournament
- Track member ELO scores across matches and tournaments

## Getting Started

### Prerequisites

- Node.js (v14 or newer)
- npm (v6 or newer)

### Installation

1. Clone the repository:

    git clone https://github.com/yourusername/tournament-management-api.git
    cd tournament-management-api

2. Install dependencies:

    npm install

3. Start the API server:

    node app.js


The API server will be running at `http://localhost:3000`.

## API Endpoints

| Method | Endpoint                               | Description                                        |
|--------|----------------------------------------|----------------------------------------------------|
| GET    | /members                               | Get a list of members                              |
| GET    | /members/search?name=NAME              | Search for a member by name                        |
| POST   | /members                               | Create a new member                                |
| POST   | /tournaments                           | Create a new tournament                            |
| GET    | /tournaments/:id/participants          | Get a list of tournament participants              |
| POST   | /tournaments/:id/participants          | Add a member to a tournament                       |
| POST   | /tournaments/:id/generate_matches      | Generate matches for a tournament                  |
| GET    | /tournaments/:id/matches               | Get the list of matches for a tournament           |
| PUT    | /matches/:id                           | Update a match (set the winner)                    |
| GET    | /tournaments/:id/bracket               | Get the bracket data for a tournament              |

## Bracket Visualization

To visualize the bracket of a tournament, open `bracket.html` in your browser, and update the `API_BASE_URL` and `tournamentId` variables in `bracket.js` to match your API server and desired tournament ID.

## Running the Simulation Script

You can run the `simulateTournament.js` script to simulate the entire flow of adding members, creating a tournament, participants joining, generating matches, and randomly assigning winners until the tournament is complete:

    node simulateTournament.js

## AI Disclosure

A large amount of this code was generated by ChatGPT (GPT-4). That said, it was pretty buggy and broken and I had to fix it up a fair amount to get it usable. See the [prompt](gpt-prompt.txt).

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
