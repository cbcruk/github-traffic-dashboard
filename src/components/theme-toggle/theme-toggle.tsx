import { Moon, Sun } from 'lucide-react'
import { IconButton } from '@astryxdesign/core/IconButton'
import { useThemeMode } from '../theme-provider'

export function ThemeToggle() {
  const { resolvedMode, setMode, isReady } = useThemeMode()

  if (!isReady) {
    return (
      <IconButton
        label="Toggle theme"
        variant="ghost"
        icon={<Sun aria-hidden />}
        isDisabled
      />
    )
  }

  const isDark = resolvedMode === 'dark'

  return (
    <IconButton
      label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      tooltip={isDark ? 'Light theme' : 'Dark theme'}
      variant="ghost"
      icon={isDark ? <Sun aria-hidden /> : <Moon aria-hidden />}
      onClick={() => setMode(isDark ? 'light' : 'dark')}
    />
  )
}
