import { HStack } from '@astryxdesign/core/HStack'
import { StatusDot } from '@astryxdesign/core/StatusDot'
import { Text } from '@astryxdesign/core/Text'
import { Timestamp } from '@astryxdesign/core/Timestamp'
import type { PublicCollectionStatus } from '../../lib/github'

const presentation = {
  ok: { variant: 'success', label: 'Collected' },
  running: { variant: 'accent', label: 'Collecting now, started' },
  degraded: { variant: 'warning', label: 'Last collection incomplete' },
  failed: { variant: 'error', label: 'Collection failing, last started' },
  never: { variant: 'neutral', label: 'Not collected yet' },
} as const

/**
 * Whether the daily collection is working, so a stalled collector shows on
 * the page instead of passing for a quiet week.
 */
export function CollectionStatus({
  status,
}: {
  status: PublicCollectionStatus | null
}) {
  if (!status) return null
  const { variant, label } = presentation[status.status]

  return (
    <HStack gap={2} vAlign="center">
      <StatusDot variant={variant} label={label} />
      <Text type="supporting">
        {label}
        {status.lastStartedAt && status.status !== 'never' && (
          <>
            {' '}
            <Timestamp value={status.lastStartedAt} format="relative" />
          </>
        )}
      </Text>
    </HStack>
  )
}
