CREATE TABLE members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  elo_score INTEGER NOT NULL DEFAULT 1200
);

CREATE TABLE tournaments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL
);

CREATE TABLE participants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id INTEGER NOT NULL,
  tournament_id INTEGER NOT NULL,
  FOREIGN KEY (member_id) REFERENCES members (id),
  FOREIGN KEY (tournament_id) REFERENCES tournaments (id)
);

CREATE TABLE matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_id INTEGER NOT NULL,
  round INTEGER NOT NULL,
  participant1_id INTEGER NOT NULL,
  participant2_id INTEGER NOT NULL,
  winner_id INTEGER,
  FOREIGN KEY (tournament_id) REFERENCES tournaments (id),
  FOREIGN KEY (participant1_id) REFERENCES members (id),
  FOREIGN KEY (participant2_id) REFERENCES members (id),
  FOREIGN KEY (winner_id) REFERENCES members (id)
);
