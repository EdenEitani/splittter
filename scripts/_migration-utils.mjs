import fs from 'node:fs'

export function requireEnv(name) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required env var: ${name}`)
  }
  return value
}

export function ensureDir(path) {
  if (!fs.existsSync(path)) {
    fs.mkdirSync(path, { recursive: true })
  }
}

export function writeJson(path, data) {
  fs.writeFileSync(path, JSON.stringify(data, null, 2))
}

export function readJson(path) {
  return JSON.parse(fs.readFileSync(path, 'utf8'))
}

export function parseJsonField(value, fallback) {
  if (value == null) return fallback
  if (typeof value === 'object') return value
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

export function asIsoDate(date) {
  if (!date) return null
  if (typeof date === 'string') return date.slice(0, 10)
  return new Date(date).toISOString().slice(0, 10)
}

export function asIsoTimestamp(value) {
  if (!value) return new Date().toISOString()
  if (typeof value === 'string') return new Date(value).toISOString()
  return new Date(value).toISOString()
}
