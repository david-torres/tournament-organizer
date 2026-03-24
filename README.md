# Tournament Organizer API

A REST API for creating and managing tournaments, participants, and matches, with support for Elo ratings and bracket visualization.

## Tournament Types Supported
- Double elimination
- Single-elimination
- Round robin
- Swiss
- League
- Ladder

## Features

- Generate seeded or organizer-controlled matches, including standard single-elimination and double-elimination brackets
- Store operational match details including scores, scheduling metadata, and controlled result correction for league and ladder play
- Track member Elo scores across matches and tournaments
- Leagues for regularly starting with a fresh Elo score and configurable Elo decay after a period of non-participation
- Ladders for ongoing ad hoc challenge matches ranked by participant Elo
- Generate a bracket graphic for visualizing the tournament

## Getting Started

### Prerequisites

- Node.js
- npm

### Installation

1. Clone the repository:

    git clone https://github.com/david-torres/tournament-organizer.git

    cd tournament-organizer

2. Install dependencies:

    npm install

3. Set up environment variables (optional):

    Create a `.env` file in the root directory with the following variables:
    
    ```
    NODE_ENV=development
    DB_USERNAME=your_db_username
    DB_PASSWORD=your_db_password
    DB_NAME=your_database_name
    DB_HOST=localhost
    DB_PORT=5432
    DB_DIALECT=sqlite
    DB_STORAGE=./data/tournaments.db
    PORT=3000
    ```
    
    For SQLite (default), you typically only need:
    ```
    NODE_ENV=development
    DB_DIALECT=sqlite
    DB_STORAGE=./data/tournaments.db
    PORT=3000
    ```

4. Initialize the database (optional, if starting fresh):

    npm run init-db

5. Start the API server:

    npm start

    Or:

    npm run build
    node dist/server.js

The API server will be running at `http://localhost:3000` (or the port specified in your `PORT` environment variable).

## API Endpoints

| Method | Endpoint                               | Description                                        |
|--------|----------------------------------------|----------------------------------------------------|
| GET    | /members                               | Get a list of members                              |
| GET    | /members/search?name=NAME              | Search for a member by name                        |
| POST   | /members                               | Create a new member                                |
| GET    | /tournaments                           | List tournaments, optionally filtered by status/type |
| POST   | /tournaments                           | Create a new tournament                            |
| GET    | /tournaments/latest                    | Get the most current active tournament             |
| GET    | /tournaments/:id                       | Get a single tournament                            |
| PATCH  | /tournaments/:id                       | Update tournament metadata or archive it           |
| POST   | /tournaments/:id/reset                 | Reset a non-active tournament back to pending      |
| DELETE | /tournaments/:id                       | Delete a non-active tournament                     |
| GET    | /tournaments/:id/participants          | Get a list of tournament participants              |
| PATCH  | /tournaments/:id/participants/:participant_id | Update pending participant setup fields such as `seed` |
| GET    | /tournaments/:id/standings             | Get computed standings and tie-break metadata      |
| POST   | /tournaments/:id/participants          | Add a member to a pending tournament               |
| POST   | /tournaments/:id/start                 | Start a tournament and generate its initial matches or season fixtures |
| GET    | /tournaments/:id/matches               | Get the list of matches for a tournament           |
| GET    | /tournaments/:id/matches?status=STATUS | Get matches filtered by status (pending/completed)  |
| POST   | /tournaments/:id/matches               | Create a manual ladder match, or a league match only when no scheduled fixtures exist |
| PATCH  | /tournaments/:id/matches/:match_id     | Update match scheduling data or record a result    |
| POST   | /tournaments/:id/matches/:match_id/correct | Safely correct a completed league or ladder result |
| GET    | /tournaments/:id/bracket               | Get the bracket data for a tournament              |
| POST   | /tournaments/:id/league                | Compatibility endpoint to finalize a fully played league season |
| POST   | /tournaments/:id/decay-elo             | Decay Elo scores for a league or ladder            |

Lifecycle notes:

- Heavy list endpoints are paginated by default with `page` and `limit` query params. Current defaults are `page=1`, `limit=50`, with `limit` capped at `100`.
- Paginated list responses keep the existing array body shape and expose metadata through the `X-Page`, `X-Limit`, `X-Total-Count`, and `X-Total-Pages` response headers.
- `PATCH /tournaments/:id` supports `name`, `size` for pending elimination tournaments, and `status: "archived"` for non-active tournaments.
- `POST /tournaments/:id/participants` accepts an optional `seed`, and `PATCH /tournaments/:id/participants/:participant_id` lets organizers adjust seeds while the tournament is still pending.
- Single-elimination and double-elimination `start` use bracket seeding placement instead of randomizing entrants, round-robin/league setup respects the explicit seed order when generating fixtures, and ladder `start` simply opens the tournament for ad hoc match entry.
- Double-elimination tournaments require a full power-of-two field before they can start, track winners/losers/finals bracket segments on matches, and support a grand-final reset when the losers-bracket finalist wins the first final.
- `GET /tournaments/latest` skips archived tournaments.
- `GET /tournaments/:id/standings` works for every tournament type and exposes the tie-break order used for ranking.
- `PATCH /tournaments/:id/matches/:match_id` now supports scheduling metadata (`scheduled_at`, `location`, `notes`), scores, draws for round-robin/league/ladder play, and forfeits.
- `POST /tournaments/:id/reset` deletes existing matches, clears the winner, and returns the tournament to `pending`.
- `DELETE /tournaments/:id` and `POST /tournaments/:id/reset` reject in-progress tournaments.
- League tournaments now generate a full round-robin fixture list on `POST /tournaments/:id/start` and automatically complete when the last scheduled fixture is reported.
- League standings and winners are now decided by season results (`wins`, head-to-head group wins, then Sonneborn-Berger), not by manually ending the season based on current Elo.
- Ladder tournaments keep the ongoing manual-match flow: `POST /tournaments/:id/start` creates no fixtures, standings rank by current participant Elo, and ad hoc matches can be created throughout the active ladder.
- `POST /tournaments/:id/matches` is no longer the normal league flow; once scheduled fixtures exist, ad hoc league match creation is rejected, but ladder tournaments continue to allow it.
- `POST /tournaments/:id/matches/:match_id/correct` is the safe correction flow for league and ladder matches. It rolls back the stored Elo snapshot for that match and rejects corrections once later related matches have been completed.
- Round robin winners are now persisted from computed standings using head-to-head group wins, and Swiss winners use standings tie-breaks (`wins`, `buchholz`, `sonneborn_berger`, direct head-to-head for two-way ties, then fewer byes).
- Bracket HTML and image renders are cached in-process per tournament state, so repeated requests for unchanged brackets avoid rerendering.

## Bracket Visualization

You can get a JSON, HTML, or PNG representation of the tournament bracket by calling:

JSON (default)

    GET http://localhost:3000/tournaments/:id/bracket
    GET http://localhost:3000/tournaments/:id/bracket?format=json

HTML

    GET http://localhost:3000/tournaments/:id/bracket?format=html

PNG

    GET http://localhost:3000/tournaments/:id/bracket?format=image

For double-elimination tournaments, bracket JSON is segmented into `winners`, `losers`, and `finals` sections keyed by round number.

## Running the Simulation Script

You can run the `simulate-tournament.ts` source script via the compiled `dist/simulate-tournament.js` entrypoint to simulate the entire flow of adding members, creating a tournament, participants joining, generating matches, and randomly assigning winners until the tournament is complete. Helpers have been added to package.json and can be run using npm:

Single Elimination:

    npm run sim-single-elim

Double Elimination:

    npm run sim-double-elim

Round Robin:

    npm run sim-round-robin

Swiss:

    npm run sim-swiss

League:

    npm run sim-league

Ladder:

    npm run sim-ladder

Run every supported simulation:

    npm run sim-all

## AI Disclosure

A large amount of this code was generated by ChatGPT (GPT-4). That said, it was pretty buggy and broken and I had to fix it up a fair amount to get it usable. See the [prompt](gpt-prompt.txt).

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
