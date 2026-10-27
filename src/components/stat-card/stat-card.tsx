import { Card } from '@astryxdesign/core/Card'
import { HStack } from '@astryxdesign/core/HStack'
import { Text } from '@astryxdesign/core/Text'
import { Token } from '@astryxdesign/core/Token'
import { VStack } from '@astryxdesign/core/VStack'
import { percentChange } from '../../lib/period-comparison'

export interface StatChange {
  /** The figure the change is measured on for the current period. */
  current: number
  /** The same figure for the previous period, or null if unknown. */
  previous: number | null
  /** A collection gap falls in either period. */
  isIncomplete: boolean
  /** Length of each period, e.g. 14. */
  days: number
}

function ChangeLine({ current, previous, isIncomplete, days }: StatChange) {
  const against = `vs previous ${days} days`

  if (isIncomplete) {
    return (
      <HStack gap={2} vAlign="center" wrap="wrap">
        <Token
          size="sm"
          color="yellow"
          label="Incomplete data"
          description={`Collection missed days in this or the previous ${days} days, so a change would be misleading`}
        />
      </HStack>
    )
  }

  const change = previous === null ? null : percentChange(current, previous)
  if (change === null) return null

  const direction = change > 0 ? 'Up' : change < 0 ? 'Down' : 'No change'
  const arrow = change > 0 ? '↑' : change < 0 ? '↓' : ''

  return (
    <HStack gap={2} vAlign="center" wrap="wrap">
      <Token
        size="sm"
        color={change > 0 ? 'green' : change < 0 ? 'red' : 'gray'}
        label={`${arrow}${Math.abs(change)}%`}
        description={
          change === 0
            ? `No change ${against}`
            : `${direction} ${Math.abs(change)}% ${against}`
        }
      />
      <Text type="supporting">{against}</Text>
    </HStack>
  )
}

export function StatCard({
  label,
  value,
  change,
}: {
  label: string
  value: number
  change?: StatChange
}) {
  return (
    <Card>
      <VStack gap={2}>
        <Text type="supporting">{label}</Text>
        <Text size="3xl" weight="bold" hasTabularNumbers>
          {value.toLocaleString()}
        </Text>
        {change && <ChangeLine {...change} />}
      </VStack>
    </Card>
  )
}
