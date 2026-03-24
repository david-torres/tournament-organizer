export {};

const { loadSourceModule } = require('../runtime/loadSourceModule');
const { Member } = loadSourceModule('models');
const { getPagination, setPaginationHeaders } = require('../services/pagination');

const INITIAL_ELO = 1200;

async function createMember(req, res) {
  const { name } = req.body;

  try {
    const newMember = await Member.create({ name, elo: INITIAL_ELO });
    res.status(200).json(newMember);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function getMembers(req, res) {
  try {
    const pagination = getPagination(req.query);
    if (pagination.error) {
      return res.status(400).json({ error: pagination.error });
    }

    const { rows: members, count } = await Member.findAndCountAll({
      order: [['id', 'DESC']],
      limit: pagination.limit,
      offset: pagination.offset,
    });

    setPaginationHeaders(res, count, pagination.page, pagination.limit);
    res.status(200).json(members);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function searchMembers(req, res) {
  const { name } = req.query;

  try {
    const pagination = getPagination(req.query);
    if (pagination.error) {
      return res.status(400).json({ error: pagination.error });
    }

    const { rows: members, count } = await Member.findAndCountAll({
      where: { name },
      order: [['id', 'DESC']],
      limit: pagination.limit,
      offset: pagination.offset,
    });

    setPaginationHeaders(res, count, pagination.page, pagination.limit);
    res.status(200).json({ rows: members });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

module.exports = {
  createMember,
  getMembers,
  searchMembers,
};
