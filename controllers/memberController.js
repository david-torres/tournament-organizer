// Imports
const { Member } = require('../models');

// Create a new member
exports.createMember = async (req, res) => {
  const { name } = req.body;
  const elo_score = 1200;

  try {
    const newMember = await Member.create({ name, elo_score });
    res.status(200).json(newMember);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get a list of all members
exports.getMembers = async (req, res) => {
  try {
    const members = await Member.findAll();
    res.status(200).json(members);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// search for members by name
exports.searchMembers = async (req, res) => {
  const { name } = req.query;

  try {
    const members = await Member.findAll({ where: { name } });
    res.status(200).json({ "rows": members });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
