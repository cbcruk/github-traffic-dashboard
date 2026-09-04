import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react'
import { Theme } from '@astryxdesign/core/theme'
import { neutralTheme } from '@astryxdesign/theme-neutral/built'
import type { ReactNode } from 'react'

export type ThemeMode = 'system' | 'light' | 'dark'
export type ResolvedThemeMode = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'theme'

interface ThemeModeContextValue {
  /** The requested mode, including 'system'. */
  mode: ThemeMode
  /** The mode actually in effect, with 'system' resolved against the OS. */
  resolvedMode: ResolvedThemeMode
  setMode: (mode: ThemeMode) => void
  /** False until the stored preference has been read on the client. */
  isReady: boolean
}

const ThemeModeContext = createContext<ThemeModeContextValue | null>(null)

export function useThemeMode(): ThemeModeContextValue {
  const context = useContext(ThemeModeContext)

  if (!context) {
    throw new Error('useThemeMode must be used within a ThemeProvider')
  }

  return context
}

function readStoredMode(): ThemeMode {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    return stored === 'light' || stored === 'dark' ? stored : 'system'
  } catch {
    return 'system'
  }
}

function prefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Both the server and the first client render start at 'system' so the markup
  // Theme emits matches on hydration. The stored preference is applied in the
  // effect below; the inline script in __root.tsx covers the paint before that.
  const [mode, setModeState] = useState<ThemeMode>('system')
  const [systemMode, setSystemMode] = useState<ResolvedThemeMode>('light')
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    setModeState(readStoredMode())
    setSystemMode(prefersDark() ? 'dark' : 'light')
    setIsReady(true)

    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (event: MediaQueryListEvent) => {
      setSystemMode(event.matches ? 'dark' : 'light')
    }

    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next)

    try {
      if (next === 'system') {
        localStorage.removeItem(THEME_STORAGE_KEY)
      } else {
        localStorage.setItem(THEME_STORAGE_KEY, next)
      }
    } catch {
      // Storage can be unavailable (private mode, blocked cookies); the mode
      // still applies for this session.
    }
  }, [])

  const resolvedMode = mode === 'system' ? systemMode : mode

  return (
    <Theme theme={neutralTheme} mode={mode}>
      <ThemeModeContext.Provider
        value={{ mode, resolvedMode, setMode, isReady }}
      >
        {children}
      </ThemeModeContext.Provider>
    </Theme>
  )
}
