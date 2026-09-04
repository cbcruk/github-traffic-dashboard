import { createContext, useContext, useId } from 'react'
import { ResponsiveContainer, Tooltip } from 'recharts'
import { HStack } from '@astryxdesign/core/HStack'
import { VStack } from '@astryxdesign/core/VStack'
import { Text } from '@astryxdesign/core/Text'
import type { ComponentProps, CSSProperties } from 'react'
import './chart.css'

export interface ChartSeriesConfig {
  label: string
  /** A CSS color value, normally a design token reference. */
  color: string
}

export type ChartConfig = Record<string, ChartSeriesConfig>

const ChartConfigContext = createContext<ChartConfig | null>(null)

function useChartConfig(): ChartConfig {
  const config = useContext(ChartConfigContext)

  if (!config) {
    throw new Error('Chart parts must be rendered inside a <ChartContainer />')
  }

  return config
}

/**
 * Publishes each series colour as `--color-<key>` scoped to this chart, so
 * Recharts props can reference them as `fill="var(--color-views)"`.
 */
function ChartStyle({ id, config }: { id: string; config: ChartConfig }) {
  const declarations = Object.entries(config)
    .map(([key, series]) => `  --color-${key}: ${series.color};`)
    .join('\n')

  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `[data-chart="${id}"] {\n${declarations}\n}`,
      }}
    />
  )
}

export function ChartContainer({
  config,
  height,
  children,
}: {
  config: ChartConfig
  height: number | string
  children: ComponentProps<typeof ResponsiveContainer>['children']
}) {
  const chartId = `chart-${useId().replace(/:/g, '')}`

  return (
    <ChartConfigContext.Provider value={config}>
      <VStack
        data-chart={chartId}
        className="app-chart"
        width="100%"
        height={height}
      >
        <ChartStyle id={chartId} config={config} />
        <ResponsiveContainer>{children}</ResponsiveContainer>
      </VStack>
    </ChartConfigContext.Provider>
  )
}

export const ChartTooltip = Tooltip

export function ChartTooltipContent({
  active,
  payload,
  label,
}: ComponentProps<typeof Tooltip>) {
  const config = useChartConfig()

  if (!active || !payload?.length) {
    return null
  }

  const entries = payload.filter((item) => item.type !== 'none')

  return (
    <VStack className="app-chart-tooltip" gap={1.5}>
      {label ? (
        <Text type="supporting" color="primary" weight="medium">
          {label}
        </Text>
      ) : null}
      <VStack gap={1.5}>
        {entries.map((item) => {
          const key = String(item.dataKey ?? item.name ?? '')
          const series = config[key]

          return (
            <HStack key={key} gap={2} vAlign="stretch">
              <span
                className="app-chart-tooltip-swatch"
                style={
                  {
                    '--app-chart-swatch-color': item.color,
                  } as CSSProperties
                }
              />
              <HStack gap={4} hAlign="between" width="100%" vAlign="center">
                <Text type="supporting">{series?.label ?? key}</Text>
                <Text
                  type="supporting"
                  color="primary"
                  weight="medium"
                  hasTabularNumbers
                >
                  {typeof item.value === 'number'
                    ? item.value.toLocaleString()
                    : String(item.value ?? '')}
                </Text>
              </HStack>
            </HStack>
          )
        })}
      </VStack>
    </VStack>
  )
}
