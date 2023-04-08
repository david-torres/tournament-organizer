// Create a new member
exports.createMember = async (req, res, db) => {
  const { name } = req.body;
  const elo_score = 1200;

  try {
    await db.run('INSERT INTO members (name, elo_score) VALUES (?, ?)', [name, elo_score], function (err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.status(200).json({ id: this.lastID, name, elo_score });
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get a list of all members
exports.getMembers = (req, res, db) => {
  db.all('SELECT * FROM members', [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.status(200).json(rows);
  });
};

exports.searchMembers = async(req, res, db) => {
  const { name } = req.query;

  try {
    db.all('SELECT * FROM members WHERE name = ?', [name], (err, rows) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.status(200).json({"rows": rows});
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }

}