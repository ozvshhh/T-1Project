// 백엔드가 붙기 전까지 쓰는 목 데이터. 3번 작업에서 api.md 2절 모양의 시드로 확장한다.
// 새로고침해도 남도록 localStorage에 둔다(실제 서버의 DB 역할).
import type { User } from '@/api/types'

export const SEED_USER = { email: 'seed@t1.test', password: 'seedpass1234' }

type StoredUser = User & { password: string }

type Db = {
  users: StoredUser[]
  seq: number
}

const STORAGE_KEY = 't1-mock-db'
// 처음 쓸 때 만든다.
let db: Db | null = null

function seed(): Db {
  return { users: [{ id: 'u1', ...SEED_USER }], seq: 1 }
}

function load(): Db {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as Db
  } catch {
    // 저장소를 못 쓰면 메모리로만 돈다.
  }
  return seed()
}

export function getDb(): Db {
  db ??= load()
  return db
}

export function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(getDb()))
  } catch {
    // 위와 같음
  }
}

export function resetDb() {
  db = seed()
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // 위와 같음
  }
}

export function newId() {
  const d = getDb()
  d.seq += 1
  return `id${d.seq}`
}

/** 목 토큰: `mock-<userId>`. 실제 서버의 JWT 자리다. */
export function tokenFor(userId: string) {
  return `mock-${userId}`
}

export function userFromToken(authorization: string | null): StoredUser | null {
  const match = /^Bearer mock-(.+)$/.exec(authorization ?? '')
  if (!match) return null
  return getDb().users.find((u) => u.id === match[1]) ?? null
}
