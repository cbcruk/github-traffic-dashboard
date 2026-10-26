import { describe, expect, it } from 'vitest'
import { validateHistorySearch } from './history-search'

describe('validateHistorySearch', () => {
  it('reads a repository and a listed range', () => {
    expect(validateHistorySearch({ repo: 'me/app', range: 90 })).toEqual({
      repo: 'me/app',
      range: 90,
    })
  })

  it('accepts a range given as a string, as a link query has it', () => {
    expect(validateHistorySearch({ range: '7' })).toEqual({
      repo: undefined,
      range: 7,
    })
  })

  it('leaves defaults out of the URL', () => {
    expect(validateHistorySearch({ repo: 'all', range: '30' })).toEqual({
      repo: undefined,
      range: undefined,
    })
  })

  it('falls back to the defaults for values it does not know', () => {
    expect(validateHistorySearch({ repo: 42, range: 45 })).toEqual({
      repo: undefined,
      range: undefined,
    })
  })
})
