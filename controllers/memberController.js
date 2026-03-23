const { Member } = require('../models');

const INITIAL_ELO = 1200;

exports.createMember = async (req, res) => {
  const { name } = req.body;

  try {
    const newMember = await Member.create({ name, elo: INITIAL_ELO });
    res.status(200).json(newMember);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getMembers = async (req, res) => {
  try {
    const members = await Member.findAll();
    res.status(200).json(members);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.searchMembers = async (req, res) => {
  const { name } = req.query;

  try {
    const members = await Member.findAll({ where: { name } });
    res.status(200).json({ rows: members });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
