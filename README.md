# Tournament Organizer API

A REST API for creating and managing tournaments (single-elimination or round-robin), participants, and matches, with support for Elo ratings and bracket visualization.

## Features

- Create new members (participants)
- Create single-elimination tournaments
- Create round-robin tournaments
- Allow members to join tournaments
- Generate randomized matches, supporting byes for players with the highest Elo scores
- Track member Elo scores across matches and tournaments
- Generate a bracket graphic for visualizing the tournament

## Getting Started

### Prerequisites

- Node.js (v14 or newer)
- npm (v6 or newer)

### Installation

1. Clone the repository:

    git clone https://github.com/david-torres/tournament-organizer.git

    cd tournament-organizer

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
| POST   | /tournaments/:id/start                 | Generate matches to start a tournament             |
| GET    | /tournaments/:id/matches               | Get the list of matches for a tournament           |
| PATCH  | /tournaments/:id/matches/:id           | Update a match (set the winner)                    |
| GET    | /tournaments/:id/bracket               | Get the bracket data for a tournament              |

## Bracket Visualization

You can get an HTML or PNG representation of the tournament bracket by calling:

HTML

    wget http://localhost:3000/tournaments/:id/bracket?format=html

PNG

    wget http://localhost:3000/tournaments/:id/bracket?format=image

## Running the Simulation Script

You can run the `simulate-tournament.js` script to simulate the entire flow of adding members, creating a tournament, participants joining, generating matches, and randomly assigning winners until the tournament is complete:

    node simulate-tournament.js

## AI Disclosure

A large amount of this code was generated by ChatGPT (GPT-4). That said, it was pretty buggy and broken and I had to fix it up a fair amount to get it usable. See the [prompt](gpt-prompt.txt).

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
