import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import {
  AI_PROVIDER_IDS,
  getProviderLabel,
  normalizeProviderId,
  normalizeRoutingMode,
} from './config.mjs'

function nowIso() {
  return new Date().toISOString()
}

function toDbBool(value) {
  return value ? 1 : 0
}

function fromDbBool(value) {
  return Number(value) === 1
}

function stableKey(secret) {
  return createHash('sha256').update(String(secret ?? '')).digest()
}

function parseJsonArray(value) {
  if (!value) {
    return []
  }

  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function maskSecret(value = '') {
  const trimmed = String(value).trim()
  if (!trimmed) {
    return ''
  }
  if (trimmed.length <= 8) {
    return '********'
  }
  return `${trimmed.slice(0, 4)}••••${trimmed.slice(-4)}`
}

function encryptSecret(secret, encryptionKey) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', stableKey(encryptionKey), iv)
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, encrypted]).toString('base64')
}

function decryptSecret(payload, encryptionKey) {
  const raw = Buffer.from(payload, 'base64')
  const iv = raw.subarray(0, 12)
  const tag = raw.subarray(12, 28)
  const encrypted = raw.subarray(28)
  const decipher = createDecipheriv('aes-256-gcm', stableKey(encryptionKey), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
}

function ensureDirectory(directoryPath) {
  if (!existsSync(directoryPath)) {
    mkdirSync(directoryPath, { recursive: true })
  }
}

function runTransaction(db, callback) {
  db.exec('BEGIN')
  try {
    callback()
    db.exec('COMMIT')
  } catch (error) {
    try {
      db.exec('ROLLBACK')
    } catch {
      // Ignore rollback failure and rethrow the original error.
    }
    throw error
  }
}

function candidateRowToModel(row) {
  return {
    provider: row.provider,
    model_id: row.model_id,
    display_name: row.display_name,
    free_candidate: fromDbBool(row.free_candidate),
    verified_available: fromDbBool(row.verified_available),
    supports_streaming: fromDbBool(row.supports_streaming),
    supports_tools: fromDbBool(row.supports_tools),
    supports_vision: fromDbBool(row.supports_vision),
    quality_score: Number(row.quality_score ?? 0),
    reasoning_score: Number(row.reasoning_score ?? 0),
    coding_score: Number(row.coding_score ?? 0),
    speed_score: Number(row.speed_score ?? 0),
    stability_score: Number(row.stability_score ?? 0),
    priority: Number(row.priority ?? 0),
    excluded: fromDbBool(row.excluded),
    last_checked_at: row.last_checked_at ?? null,
    last_error: row.last_error ?? '',
    notes: row.notes ?? '',
    source: row.source ?? 'seed',
  }
}

export function createAiStorage({ dataDir, encryptionKey }) {
  ensureDirectory(dataDir)
  const dbPath = path.join(dataDir, 'artemis.db')
  const db = new DatabaseSync(dbPath)

  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS provider_credentials (
      provider TEXT PRIMARY KEY,
      enabled INTEGER NOT NULL DEFAULT 0,
      auth_type TEXT NOT NULL DEFAULT 'bearer',
      encrypted_key TEXT,
      masked_key TEXT,
      candidate_models_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_test_at TEXT,
      last_test_status TEXT,
      last_test_message TEXT
    );
    CREATE TABLE IF NOT EXISTS provider_status (
      provider TEXT PRIMARY KEY,
      configured INTEGER NOT NULL DEFAULT 0,
      enabled INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'missing',
      detail TEXT NOT NULL DEFAULT '',
      candidate_count INTEGER NOT NULL DEFAULT 0,
      available_count INTEGER NOT NULL DEFAULT 0,
      checked_at TEXT
    );
    CREATE TABLE IF NOT EXISTS model_catalog (
      provider TEXT NOT NULL,
      model_id TEXT NOT NULL,
      display_name TEXT NOT NULL,
      free_candidate INTEGER NOT NULL DEFAULT 0,
      verified_available INTEGER NOT NULL DEFAULT 0,
      supports_streaming INTEGER NOT NULL DEFAULT 0,
      supports_tools INTEGER NOT NULL DEFAULT 0,
      supports_vision INTEGER NOT NULL DEFAULT 0,
      quality_score REAL NOT NULL DEFAULT 0,
      reasoning_score REAL NOT NULL DEFAULT 0,
      coding_score REAL NOT NULL DEFAULT 0,
      speed_score REAL NOT NULL DEFAULT 0,
      stability_score REAL NOT NULL DEFAULT 0,
      priority REAL NOT NULL DEFAULT 0,
      excluded INTEGER NOT NULL DEFAULT 0,
      last_checked_at TEXT,
      last_error TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT 'seed',
      updated_at TEXT NOT NULL,
      PRIMARY KEY (provider, model_id)
    );
    CREATE TABLE IF NOT EXISTS routing_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      routing_mode TEXT NOT NULL DEFAULT 'auto-best-free',
      manual_provider TEXT,
      manual_model TEXT,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS chat_sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      text TEXT NOT NULL,
      provider TEXT,
      model TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS model_attempt_logs (
      id TEXT PRIMARY KEY,
      session_id TEXT,
      message_id TEXT,
      routing_mode TEXT NOT NULL,
      attempt_index INTEGER NOT NULL,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      started_at TEXT NOT NULL,
      first_token_at TEXT,
      ended_at TEXT,
      success INTEGER NOT NULL DEFAULT 0,
      error_type TEXT,
      error_message TEXT,
      status_code INTEGER,
      latency_ms INTEGER,
      fallback_reason TEXT,
      score_at_selection REAL NOT NULL DEFAULT 0
    );
  `)

  db.prepare(`
    INSERT INTO routing_settings (id, routing_mode, manual_provider, manual_model, updated_at)
    VALUES (1, 'auto-best-free', NULL, NULL, ?)
    ON CONFLICT(id) DO NOTHING
  `).run(nowIso())

  const saveProviderStmt = db.prepare(`
    INSERT INTO provider_credentials (
      provider,
      enabled,
      auth_type,
      encrypted_key,
      masked_key,
      candidate_models_json,
      created_at,
      updated_at,
      last_test_at,
      last_test_status,
      last_test_message
    )
    VALUES (@provider, @enabled, @auth_type, @encrypted_key, @masked_key, @candidate_models_json, @created_at, @updated_at, NULL, NULL, NULL)
    ON CONFLICT(provider) DO UPDATE SET
      enabled = excluded.enabled,
      auth_type = excluded.auth_type,
      encrypted_key = excluded.encrypted_key,
      masked_key = excluded.masked_key,
      candidate_models_json = excluded.candidate_models_json,
      updated_at = excluded.updated_at
  `)

  const upsertProviderStatusStmt = db.prepare(`
    INSERT INTO provider_status (
      provider,
      configured,
      enabled,
      status,
      detail,
      candidate_count,
      available_count,
      checked_at
    )
    VALUES (@provider, @configured, @enabled, @status, @detail, @candidate_count, @available_count, @checked_at)
    ON CONFLICT(provider) DO UPDATE SET
      configured = excluded.configured,
      enabled = excluded.enabled,
      status = excluded.status,
      detail = excluded.detail,
      candidate_count = excluded.candidate_count,
      available_count = excluded.available_count,
      checked_at = excluded.checked_at
  `)

  const upsertModelStmt = db.prepare(`
    INSERT INTO model_catalog (
      provider,
      model_id,
      display_name,
      free_candidate,
      verified_available,
      supports_streaming,
      supports_tools,
      supports_vision,
      quality_score,
      reasoning_score,
      coding_score,
      speed_score,
      stability_score,
      priority,
      excluded,
      last_checked_at,
      last_error,
      notes,
      source,
      updated_at
    )
    VALUES (
      @provider, @model_id, @display_name, @free_candidate, @verified_available,
      @supports_streaming, @supports_tools, @supports_vision, @quality_score,
      @reasoning_score, @coding_score, @speed_score, @stability_score, @priority,
      @excluded, @last_checked_at, @last_error, @notes, @source, @updated_at
    )
    ON CONFLICT(provider, model_id) DO UPDATE SET
      display_name = excluded.display_name,
      free_candidate = excluded.free_candidate,
      verified_available = excluded.verified_available,
      supports_streaming = excluded.supports_streaming,
      supports_tools = excluded.supports_tools,
      supports_vision = excluded.supports_vision,
      quality_score = excluded.quality_score,
      reasoning_score = excluded.reasoning_score,
      coding_score = excluded.coding_score,
      speed_score = excluded.speed_score,
      stability_score = excluded.stability_score,
      priority = excluded.priority,
      excluded = CASE WHEN model_catalog.excluded = 1 THEN 1 ELSE excluded.excluded END,
      last_checked_at = excluded.last_checked_at,
      last_error = excluded.last_error,
      notes = excluded.notes,
      source = excluded.source,
      updated_at = excluded.updated_at
  `)

  const insertChatSessionStmt = db.prepare(`
    INSERT INTO chat_sessions (id, title, created_at, updated_at)
    VALUES (@id, @title, @created_at, @updated_at)
    ON CONFLICT(id) DO UPDATE SET title = excluded.title, updated_at = excluded.updated_at
  `)

  const insertChatMessageStmt = db.prepare(`
    INSERT INTO chat_messages (id, session_id, role, text, provider, model, metadata_json, created_at)
    VALUES (@id, @session_id, @role, @text, @provider, @model, @metadata_json, @created_at)
  `)

  const insertAttemptStmt = db.prepare(`
    INSERT INTO model_attempt_logs (
      id, session_id, message_id, routing_mode, attempt_index, provider, model, started_at,
      first_token_at, ended_at, success, error_type, error_message, status_code, latency_ms,
      fallback_reason, score_at_selection
    )
    VALUES (
      @id, @session_id, @message_id, @routing_mode, @attempt_index, @provider, @model, @started_at,
      @first_token_at, @ended_at, @success, @error_type, @error_message, @status_code, @latency_ms,
      @fallback_reason, @score_at_selection
    )
  `)

  function listProviderCredentials() {
    const rows = db.prepare(`
      SELECT provider, enabled, auth_type, masked_key, candidate_models_json, created_at, updated_at,
             last_test_at, last_test_status, last_test_message
      FROM provider_credentials
      ORDER BY provider
    `).all()

    const map = new Map(rows.map((row) => [row.provider, {
      provider: row.provider,
      label: getProviderLabel(row.provider),
      enabled: fromDbBool(row.enabled),
      auth_type: row.auth_type,
      masked_key: row.masked_key ?? '',
      candidate_models: parseJsonArray(row.candidate_models_json),
      created_at: row.created_at,
      updated_at: row.updated_at,
      last_test_at: row.last_test_at ?? null,
      last_test_status: row.last_test_status ?? null,
      last_test_message: row.last_test_message ?? '',
      configured: Boolean(row.masked_key),
    }]))

    return AI_PROVIDER_IDS.map((provider) => map.get(provider) ?? {
      provider,
      label: getProviderLabel(provider),
      enabled: false,
      auth_type: 'bearer',
      masked_key: '',
      candidate_models: [],
      created_at: null,
      updated_at: null,
      last_test_at: null,
      last_test_status: null,
      last_test_message: '',
      configured: false,
    })
  }

  function getProviderCredential(provider) {
    const row = db
      .prepare('SELECT * FROM provider_credentials WHERE provider = ?')
      .get(normalizeProviderId(provider))

    if (!row) {
      return null
    }

    let decryptedKey = ''
    let configured = Boolean(row.encrypted_key)

    if (row.encrypted_key) {
      try {
        decryptedKey = decryptSecret(row.encrypted_key, encryptionKey)
      } catch {
        decryptedKey = ''
        configured = false
      }
    }

    return {
      provider: row.provider,
      label: getProviderLabel(row.provider),
      enabled: fromDbBool(row.enabled),
      auth_type: row.auth_type,
      masked_key: row.masked_key ?? '',
      candidate_models: parseJsonArray(row.candidate_models_json),
      created_at: row.created_at,
      updated_at: row.updated_at,
      last_test_at: row.last_test_at ?? null,
      last_test_status: row.last_test_status ?? null,
      last_test_message: row.last_test_message ?? '',
      configured,
      api_key: decryptedKey,
    }
  }

  function saveProviderCredential(provider, payload = {}) {
    const normalizedProvider = normalizeProviderId(provider)
    const current = getProviderCredential(normalizedProvider)
    const currentSecret = current?.api_key ?? ''
    const nextSecret = typeof payload.apiKey === 'string'
      ? payload.apiKey.trim()
      : currentSecret

    saveProviderStmt.run({
      provider: normalizedProvider,
      enabled: toDbBool(payload.enabled ?? current?.enabled ?? false),
      auth_type: payload.authType ?? current?.auth_type ?? 'bearer',
      encrypted_key: nextSecret ? encryptSecret(nextSecret, encryptionKey) : null,
      masked_key: nextSecret ? maskSecret(nextSecret) : '',
      candidate_models_json: JSON.stringify(
        Array.isArray(payload.candidateModels)
          ? payload.candidateModels
          : current?.candidate_models ?? [],
      ),
      created_at: current?.created_at ?? nowIso(),
      updated_at: nowIso(),
    })

    return getProviderCredential(normalizedProvider)
  }

  function updateProviderTestResult(provider, payload) {
    db.prepare(`
      UPDATE provider_credentials
      SET last_test_at = ?, last_test_status = ?, last_test_message = ?
      WHERE provider = ?
    `).run(
      payload.last_test_at ?? nowIso(),
      payload.last_test_status ?? null,
      payload.last_test_message ?? '',
      normalizeProviderId(provider),
    )
  }

  function upsertProviderStatus(provider, payload) {
    upsertProviderStatusStmt.run({
      provider: normalizeProviderId(provider),
      configured: toDbBool(payload.configured),
      enabled: toDbBool(payload.enabled),
      status: payload.status ?? 'missing',
      detail: payload.detail ?? '',
      candidate_count: Number(payload.candidate_count ?? 0),
      available_count: Number(payload.available_count ?? 0),
      checked_at: payload.checked_at ?? nowIso(),
    })
  }

  function listProviderStatuses() {
    const rows = db.prepare('SELECT * FROM provider_status ORDER BY provider').all()
    const map = new Map(rows.map((row) => [row.provider, {
      provider: row.provider,
      configured: fromDbBool(row.configured),
      enabled: fromDbBool(row.enabled),
      status: row.status,
      detail: row.detail,
      candidate_count: Number(row.candidate_count ?? 0),
      available_count: Number(row.available_count ?? 0),
      checked_at: row.checked_at ?? null,
    }]))

    return AI_PROVIDER_IDS.map((provider) => map.get(provider) ?? {
      provider,
      configured: false,
      enabled: false,
      status: 'missing',
      detail: '아직 설정하지 않았습니다.',
      candidate_count: 0,
      available_count: 0,
      checked_at: null,
    })
  }

  function upsertModels(items) {
    const updatedAt = nowIso()
    runTransaction(db, () => {
      for (const item of items) {
        upsertModelStmt.run({
          provider: normalizeProviderId(item.provider),
          model_id: item.model_id,
          display_name: item.display_name,
          free_candidate: toDbBool(item.free_candidate),
          verified_available: toDbBool(item.verified_available),
          supports_streaming: toDbBool(item.supports_streaming),
          supports_tools: toDbBool(item.supports_tools),
          supports_vision: toDbBool(item.supports_vision),
          quality_score: Number(item.quality_score ?? 0),
          reasoning_score: Number(item.reasoning_score ?? 0),
          coding_score: Number(item.coding_score ?? 0),
          speed_score: Number(item.speed_score ?? 0),
          stability_score: Number(item.stability_score ?? 0),
          priority: Number(item.priority ?? 0),
          excluded: toDbBool(item.excluded),
          last_checked_at: item.last_checked_at ?? null,
          last_error: item.last_error ?? '',
          notes: item.notes ?? '',
          source: item.source ?? 'seed',
          updated_at: updatedAt,
        })
      }
    })
  }

  function listModels({ provider, includeExcluded = true } = {}) {
    const conditions = []
    const values = []

    if (provider) {
      conditions.push('provider = ?')
      values.push(normalizeProviderId(provider))
    }
    if (!includeExcluded) {
      conditions.push('excluded = 0')
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    return db.prepare(`
      SELECT *
      FROM model_catalog
      ${whereClause}
      ORDER BY provider, priority DESC, quality_score DESC, reasoning_score DESC, coding_score DESC
    `).all(...values).map(candidateRowToModel)
  }

  function setModelExcluded(provider, modelId, excluded) {
    db.prepare(`
      UPDATE model_catalog
      SET excluded = ?, updated_at = ?
      WHERE provider = ? AND model_id = ?
    `).run(
      toDbBool(excluded),
      nowIso(),
      normalizeProviderId(provider),
      String(modelId),
    )
  }

  function getRoutingSettings() {
    const row = db.prepare('SELECT * FROM routing_settings WHERE id = 1').get()
    return {
      routing_mode: normalizeRoutingMode(row?.routing_mode),
      manual_provider: row?.manual_provider ?? null,
      manual_model: row?.manual_model ?? null,
      updated_at: row?.updated_at ?? null,
    }
  }

  function saveRoutingSettings(patch = {}) {
    const current = getRoutingSettings()
    db.prepare(`
      UPDATE routing_settings
      SET routing_mode = ?, manual_provider = ?, manual_model = ?, updated_at = ?
      WHERE id = 1
    `).run(
      normalizeRoutingMode(patch.routing_mode ?? current.routing_mode),
      patch.manual_provider ?? current.manual_provider,
      patch.manual_model ?? current.manual_model,
      nowIso(),
    )
    return getRoutingSettings()
  }

  function upsertChatSession(session) {
    insertChatSessionStmt.run({
      id: session.id,
      title: session.title,
      created_at: session.created_at ?? nowIso(),
      updated_at: session.updated_at ?? nowIso(),
    })
  }

  function insertChatMessage(message) {
    insertChatMessageStmt.run({
      id: message.id,
      session_id: message.session_id,
      role: message.role,
      text: message.text,
      provider: message.provider ?? null,
      model: message.model ?? null,
      metadata_json: JSON.stringify(message.metadata ?? {}),
      created_at: message.created_at ?? nowIso(),
    })
  }

  function insertAttemptLogs(items) {
    runTransaction(db, () => {
      for (const item of items) {
        insertAttemptStmt.run({
          id: item.id,
          session_id: item.session_id ?? null,
          message_id: item.message_id ?? null,
          routing_mode: item.routing_mode,
          attempt_index: Number(item.attempt_index),
          provider: normalizeProviderId(item.provider),
          model: item.model,
          started_at: item.started_at,
          first_token_at: item.first_token_at ?? null,
          ended_at: item.ended_at ?? null,
          success: toDbBool(item.success),
          error_type: item.error_type ?? null,
          error_message: item.error_message ?? null,
          status_code: item.status_code ?? null,
          latency_ms: item.latency_ms ?? null,
          fallback_reason: item.fallback_reason ?? null,
          score_at_selection: Number(item.score_at_selection ?? 0),
        })
      }
    })
  }

  function listAttemptLogs({ limit = 100 } = {}) {
    return db.prepare(`
      SELECT *
      FROM model_attempt_logs
      ORDER BY started_at DESC
      LIMIT ?
    `).all(Number(limit))
  }

  function getRecentFailureCounts() {
    const rows = db.prepare(`
      SELECT provider, model, SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS failure_count
      FROM model_attempt_logs
      GROUP BY provider, model
    `).all()

    return new Map(
      rows.map((row) => [`${row.provider}::${row.model}`, Number(row.failure_count ?? 0)]),
    )
  }

  return {
    dbPath,
    listProviderCredentials,
    getProviderCredential,
    saveProviderCredential,
    updateProviderTestResult,
    upsertProviderStatus,
    listProviderStatuses,
    upsertModels,
    listModels,
    setModelExcluded,
    getRoutingSettings,
    saveRoutingSettings,
    upsertChatSession,
    insertChatMessage,
    insertAttemptLogs,
    listAttemptLogs,
    getRecentFailureCounts,
  }
}
