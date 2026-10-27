import { describe, expect, it } from 'vitest'
import {
  DEMO_DATABASE_NAME,
  DEMO_WORKER_NAME,
  demoWorkerConfig,
} from './configure-demo-worker'

describe('demoWorkerConfig', () => {
  const built = {
    name: 'cbcruk-github-traffic-dashboard',
    main: 'index.mjs',
    d1_databases: [
      { binding: 'DB', database_name: 'github-traffic-dashboard' },
    ],
    triggers: { crons: ['*/10 * * * *'] },
  }

  it('renames the Worker and its database and turns on demo mode', () => {
    expect(demoWorkerConfig(built)).toEqual({
      ...built,
      name: DEMO_WORKER_NAME,
      vars: { DEMO_MODE: 'true' },
      d1_databases: [{ binding: 'DB', database_name: DEMO_DATABASE_NAME }],
    })
  })

  it('keeps other variables', () => {
    expect(demoWorkerConfig({ ...built, vars: { A: '1' } }).vars).toEqual({
      A: '1',
      DEMO_MODE: 'true',
    })
  })

  it('refuses a config without the DB binding', () => {
    expect(() => demoWorkerConfig({ ...built, d1_databases: [] })).toThrow()
  })
})
