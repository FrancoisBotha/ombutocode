const fs = require('fs');
const yaml = require('js-yaml');

// SQLite archive operations (optional dependency)
let archiveDb = null;
// SQLite backlog operations (optional dependency)
let backlogDbModule = null;
let ombutocodeDbModule = null;

/**
 * Set the SQLite archive database module for use in moveBacklogTicketToArchive.
 * @param {Object} dbModule - The archiveDb module with insertTicket function
 */
function setArchiveDb(dbModule) {
  archiveDb = dbModule;
}

/**
 * Get the SQLite archive database module if set.
 * @returns {Object|null} The archiveDb module or null if not set
 */
function getArchiveDb() {
  return archiveDb;
}

/**
 * Set the SQLite backlog database module for use in backlog operations.
 */
function setBacklogDb(dbModule, jcDb) {
  backlogDbModule = dbModule || null;
  ombutocodeDbModule = jcDb || null;
}

/**
 * Get the SQLite backlog database module if set.
 */
function getBacklogDb() {
  return backlogDbModule;
}

/**
 * Check if a ticket's dependencies are resolved.
 * Dependencies are resolved when all dependent tickets have status 'review' or 'done'.
 * @param {Object} ticket - The ticket to check
 * @param {Map<string, string>} ticketStatusById - Map of ticket IDs to their statuses
 * @returns {boolean} - True if all dependencies are resolved
 */
function hasResolvedDependencies(ticket, ticketStatusById) {
  if (!ticketStatusById || typeof ticketStatusById.get !== 'function') return true;

  const dependencies = Array.isArray(ticket?.dependencies) ? ticket.dependencies : [];
  if (dependencies.length === 0) return true;

  for (const dependency of dependencies) {
    const dependencyId = normalizeDependencyId(dependency);
    if (!dependencyId) continue;

    const dependencyStatus = ticketStatusById.get(dependencyId);
    if (dependencyStatus !== 'review' && dependencyStatus !== 'done') {
      return false;
    }
  }

  return true;
}

/**
 * Normalize a dependency ID from various formats.
 * @param {string} dependency - The dependency ID (can be in format 'TICKET-123' or '[TICKET-123]')
 * @returns {string|null} - Normalized dependency ID or null if invalid
 */
function normalizeDependencyId(dependency) {
  if (!dependency || typeof dependency !== 'string') return null;
  const trimmed = dependency.trim();
  if (!trimmed) return null;
  // Handle format like [TICKET-123] or just TICKET-123
  const match = trimmed.match(/^\[?([^\]]+)\]?$/);
  return match ? match[1].trim() : trimmed;
}

function readYamlOrDefault(filePath, fallbackValue, fsImpl = fs, yamlImpl = yaml) {
  try {
    const content = fsImpl.readFileSync(filePath, 'utf-8');
    return yamlImpl.load(content) || fallbackValue;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return fallbackValue;
    }
    throw error;
  }
}

function writeYaml(filePath, data, fsImpl = fs, yamlImpl = yaml) {
  fsImpl.writeFileSync(filePath, yamlImpl.dump(data, { lineWidth: -1, noRefs: true }), 'utf-8');
}

function readBacklog({ backlogPath, fsImpl = fs, yamlImpl = yaml }) {
  // Use SQLite if available and caller isn't using custom fs/yaml (i.e., tests)
  if (backlogDbModule && fsImpl === fs && yamlImpl === yaml) {
    try {
      return backlogDbModule.readBacklogData();
    } catch {
      return { version: 1, updated_at: '', tickets: [] };
    }
  }
  return readYamlOrDefault(backlogPath, { version: 1, updated_at: '', tickets: [] }, fsImpl, yamlImpl);
}

function updateBacklogTicketStatus({
  backlogPath,
  ticketId,
  newStatus,
  now = () => new Date().toISOString(),
  fsImpl = fs,
  yamlImpl = yaml
}) {
  const useDb = backlogDbModule && fsImpl === fs && yamlImpl === yaml;
  const data = readBacklog({ backlogPath, fsImpl, yamlImpl });
  const ticket = Array.isArray(data.tickets)
    ? data.tickets.find((entry) => entry.id === ticketId)
    : null;

  if (!ticket) {
    throw new Error(`Ticket ${ticketId} not found`);
  }

  // Check dependencies when transitioning to in_progress
  if (newStatus === 'in_progress') {
    const ticketStatusById = new Map(
      (data.tickets || []).map((t) => [t.id, t.status])
    );

    if (!hasResolvedDependencies(ticket, ticketStatusById)) {
      const unresolvedDeps = (ticket.dependencies || [])
        .map((dep) => normalizeDependencyId(dep))
        .filter((depId) => {
          if (!depId) return false;
          const status = ticketStatusById.get(depId);
          return status !== 'review' && status !== 'done';
        });

      return {
        success: false,
        ticketId,
        status: ticket.status,
        error: {
          code: 'UNRESOLVED_DEPENDENCIES',
          message: `Cannot start ticket ${ticketId} because it has unmet dependencies: ${unresolvedDeps.join(', ')}. Dependencies must be in 'review' or 'done' status before starting work.`,
          unresolvedDependencies: unresolvedDeps
        }
      };
    }
  }

  const timestamp = now();

  if (useDb) {
    backlogDbModule.updateTicketFields(ticketId, {
      status: newStatus,
      last_updated: timestamp
    });
    if (ombutocodeDbModule) ombutocodeDbModule.saveDb();
  } else {
    ticket.status = newStatus;
    ticket.last_updated = timestamp;
    data.updated_at = timestamp.split('T')[0];
    writeYaml(backlogPath, data, fsImpl, yamlImpl);
  }
  return { success: true, ticketId, status: newStatus };
}

function deleteBacklogTicket({
  backlogPath,
  ticketId,
  now = () => new Date().toISOString(),
  fsImpl = fs,
  yamlImpl = yaml
}) {
  if (!ticketId || typeof ticketId !== 'string') {
    throw new Error('Ticket ID is required');
  }

  const useDb = backlogDbModule && fsImpl === fs && yamlImpl === yaml;

  if (useDb) {
    const deleted = backlogDbModule.deleteTicket(ticketId);
    if (!deleted) throw new Error(`Ticket ${ticketId} not found`);
    if (ombutocodeDbModule) ombutocodeDbModule.saveDb();
    return { success: true, ticketId };
  }

  const data = readBacklog({ backlogPath, fsImpl, yamlImpl });
  if (!Array.isArray(data.tickets)) {
    throw new Error('Invalid backlog data');
  }

  const ticketIndex = data.tickets.findIndex((ticket) => ticket.id === ticketId);
  if (ticketIndex === -1) {
    throw new Error(`Ticket ${ticketId} not found`);
  }

  data.tickets.splice(ticketIndex, 1);
  data.updated_at = now().split('T')[0];
  writeYaml(backlogPath, data, fsImpl, yamlImpl);
  return { success: true, ticketId };
}

function moveBacklogTicketToArchive({
  backlogPath,
  archivePath,
  ticketId,
  now = () => new Date().toISOString(),
  fsImpl = fs,
  yamlImpl = yaml
}) {
  const useDb = backlogDbModule && fsImpl === fs && yamlImpl === yaml;

  const timestamp = now();

  if (useDb) {
    const ticket = backlogDbModule.getTicketById(ticketId);
    if (!ticket) throw new Error(`Ticket ${ticketId} not found in backlog`);

    const archiveTicket = { ...ticket, status: 'archive', last_updated: timestamp };

    // Insert into archive
    if (archiveDb && archiveDb.insertTicket) {
      archiveDb.insertTicket(archiveTicket);
    }
    // Delete from backlog
    backlogDbModule.deleteTicket(ticketId);
    if (ombutocodeDbModule) ombutocodeDbModule.saveDb();
    return { success: true, ticketId };
  }

  // Fallback to YAML
  const backlogData = readBacklog({ backlogPath, fsImpl, yamlImpl });
  const ticketIndex = Array.isArray(backlogData.tickets)
    ? backlogData.tickets.findIndex((ticket) => ticket.id === ticketId)
    : -1;

  if (ticketIndex === -1) {
    throw new Error(`Ticket ${ticketId} not found in backlog`);
  }

  const ticket = { ...backlogData.tickets[ticketIndex] };
  ticket.status = 'archive';
  ticket.last_updated = timestamp;

  // Prefer SQLite archive if available (feature_ARCHIVE_SQLITE)
  if (archiveDb && archiveDb.insertTicket) {
    archiveDb.insertTicket(ticket);
  } else {
    // Fallback to YAML archive for backward compatibility
    const archiveData = readYamlOrDefault(archivePath, { version: 1, updated_at: '', tickets: [] }, fsImpl, yamlImpl);
    archiveData.tickets = Array.isArray(archiveData.tickets) ? archiveData.tickets : [];
    archiveData.tickets.push(ticket);
    archiveData.updated_at = timestamp.split('T')[0];

    // Write archive first so backlog remains untouched if archive persistence fails.
    writeYaml(archivePath, archiveData, fsImpl, yamlImpl);
  }

  backlogData.tickets.splice(ticketIndex, 1);
  backlogData.updated_at = timestamp.split('T')[0];
  writeYaml(backlogPath, backlogData, fsImpl, yamlImpl);
  return { success: true, ticketId };
}

module.exports = {
  readBacklog,
  updateBacklogTicketStatus,
  deleteBacklogTicket,
  moveBacklogTicketToArchive,
  hasResolvedDependencies,
  normalizeDependencyId,
  setArchiveDb,
  getArchiveDb,
  setBacklogDb,
  getBacklogDb
};
