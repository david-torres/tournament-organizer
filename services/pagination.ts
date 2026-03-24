export {};

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

function toPositiveInteger(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function getPagination(query: any = {}) {
  const page = toPositiveInteger(query.page);
  const limit = toPositiveInteger(query.limit);

  if ((query.page !== undefined && page === null) || (query.limit !== undefined && limit === null)) {
    return {
      error: 'Pagination parameters `page` and `limit` must be positive integers',
    };
  }

  const resolvedPage = page ?? DEFAULT_PAGE;
  const resolvedLimit = Math.min(limit ?? DEFAULT_LIMIT, MAX_LIMIT);

  return {
    page: resolvedPage,
    limit: resolvedLimit,
    offset: (resolvedPage - 1) * resolvedLimit,
  };
}

function setPaginationHeaders(res, totalCount, page, limit) {
  const totalPages = Math.max(1, Math.ceil(totalCount / limit));

  res.setHeader('X-Page', String(page));
  res.setHeader('X-Limit', String(limit));
  res.setHeader('X-Total-Count', String(totalCount));
  res.setHeader('X-Total-Pages', String(totalPages));
}

module.exports = {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  getPagination,
  setPaginationHeaders,
};
