'use strict'

let db = null

const RUN_STATUSES = new Set(['pending', 'running', 'completed', 'failed', 'cancelled'])
const FILE_ACTIONS = new Set(['new', 'changed', 'unchanged', 'deleted', 'failed', 'excluded'])
const LOG_LEVELS = new Set(['debug', 'info', 'warn', 'error'])

function open (dbInstance) {
  if (!dbInstance || typeof dbInstance.prepare !== 'function') {
    throw new Error('logsManager: a sql.js Database instance is required')
  }
  db = dbInstance
  return db
}

function close () {
  db = null
}

function ensureDb () {
  if (!db) throw new Error('logsManager: not initialized - call open() first')
}

function toPositiveInteger (value, fieldName, { required = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw new Error(`${fieldName} is required`)
    return null
  }

  const number = Number(value)
  if (!Number.isInteger(number) || number <= 0) {
    throw new Error(`${fieldName} must be a positive integer`)
  }
  return number
}

function normalizePagination (pagination = {}) {
  pagination = pagination || {}
  const page = toPositiveInteger(pagination.page, 'page') ?? 1
  const rawPageSize = toPositiveInteger(pagination.pageSize, 'pageSize') ?? 50
  const pageSize = Math.min(rawPageSize, 500)
  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize
  }
}

function assertAllowedValue (value, allowed, fieldName) {
  if (value === undefined || value === null || value === '') return null
  if (!allowed.has(value)) {
    throw new Error(`${fieldName} must be one of: ${Array.from(allowed).join(', ')}`)
  }
  return value
}

function getSingleNumber (sql, params = []) {
  const stmt = db.prepare(sql)
  if (params.length > 0) stmt.bind(params)
  let value = 0
  if (stmt.step()) {
    const row = stmt.getAsObject()
    value = Number(row.total ?? 0)
  }
  stmt.free()
  return value
}

function getRows (sql, params = []) {
  const stmt = db.prepare(sql)
  if (params.length > 0) stmt.bind(params)
  const rows = []
  while (stmt.step()) {
    rows.push(stmt.getAsObject())
  }
  stmt.free()
  return rows
}

function buildRunWhere (filters = {}) {
  filters = filters || {}
  const whereClauses = []
  const params = []

  const jobId = toPositiveInteger(filters.jobId, 'jobId')
  const status = assertAllowedValue(filters.status, RUN_STATUSES, 'status')

  if (jobId !== null) {
    whereClauses.push('r.job_id = ?')
    params.push(jobId)
  }

  if (status !== null) {
    whereClauses.push('r.status = ?')
    params.push(status)
  }

  return {
    whereSql: whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '',
    params,
    indexName: jobId !== null ? 'ix_backup_run_job_started' : 'ix_backup_run_status_started'
  }
}

function buildRunChildWhere (runId, filterValue, allowedValues, fieldName, columnName) {
  const id = toPositiveInteger(runId, 'runId', { required: true })
  const value = assertAllowedValue(filterValue, allowedValues, fieldName)
  const whereClauses = ['run_id = ?']
  const params = [id]

  if (value !== null) {
    whereClauses.push(`${columnName} = ?`)
    params.push(value)
  }

  return {
    whereSql: `WHERE ${whereClauses.join(' AND ')}`,
    params
  }
}

function listRuns (filters = {}, pagination = {}) {
  ensureDb()

  const { page, pageSize, offset } = normalizePagination(pagination)
  const { whereSql, params, indexName } = buildRunWhere(filters)
  const fromSql = `backup_run AS r INDEXED BY ${indexName}`

  const total = getSingleNumber(
    `SELECT COUNT(*) AS total FROM ${fromSql} ${whereSql}`,
    params
  )

  const rows = getRows(`
    SELECT
      r.*,
      j.name AS job_name
    FROM ${fromSql}
    INNER JOIN backup_job AS j ON j.id = r.job_id
    ${whereSql}
    ORDER BY r.started_at DESC, r.id DESC
    LIMIT ? OFFSET ?
  `, [...params, pageSize, offset])

  return { total, page, pageSize, rows }
}

function getRun (runId) {
  ensureDb()

  const id = toPositiveInteger(runId, 'runId', { required: true })
  const rows = getRows(`
    SELECT
      r.*,
      j.name AS job_name
    FROM backup_run AS r
    INNER JOIN backup_job AS j ON j.id = r.job_id
    WHERE r.id = ?
    LIMIT 1
  `, [id])

  return rows[0] ?? null
}

function listFiles (runId, options = {}) {
  ensureDb()
  options = options || {}

  const { page, pageSize, offset } = normalizePagination(options)
  const { whereSql, params } = buildRunChildWhere(
    runId,
    options.action,
    FILE_ACTIONS,
    'action',
    'action'
  )

  const total = getSingleNumber(
    `SELECT COUNT(*) AS total FROM file_record INDEXED BY ix_file_record_run_action ${whereSql}`,
    params
  )

  const rows = getRows(`
    SELECT *
    FROM file_record INDEXED BY ix_file_record_run_action
    ${whereSql}
    ORDER BY action ASC, relative_path ASC, id ASC
    LIMIT ? OFFSET ?
  `, [...params, pageSize, offset])

  return { total, page, pageSize, rows }
}

function listEntries (runId, options = {}) {
  ensureDb()
  options = options || {}

  const { page, pageSize, offset } = normalizePagination(options)
  const { whereSql, params } = buildRunChildWhere(
    runId,
    options.level,
    LOG_LEVELS,
    'level',
    'level'
  )

  const total = getSingleNumber(
    `SELECT COUNT(*) AS total FROM run_log INDEXED BY ix_run_log_run_ts ${whereSql}`,
    params
  )

  const rows = getRows(`
    SELECT *
    FROM run_log INDEXED BY ix_run_log_run_ts
    ${whereSql}
    ORDER BY ts ASC, id ASC
    LIMIT ? OFFSET ?
  `, [...params, pageSize, offset])

  return { total, page, pageSize, rows }
}

module.exports = {
  open,
  close,
  listRuns,
  getRun,
  listFiles,
  listEntries
}
