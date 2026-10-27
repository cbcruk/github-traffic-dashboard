import { Download } from 'lucide-react'
import { DropdownMenu } from '@astryxdesign/core/DropdownMenu'
import { Icon } from '@astryxdesign/core/Icon'
import { downloadFile, toCsv, toJson, type ExportTable } from '../../lib/export'

/**
 * Download what the page shows as CSV or JSON. `build` runs on selection, so
 * the file reflects the filters at that moment.
 */
export function ExportMenu({
  filename,
  build,
  isDisabled,
}: {
  /** Without extension. */
  filename: string
  build: () => ExportTable
  isDisabled?: boolean
}) {
  return (
    <DropdownMenu
      button={{
        label: 'Export',
        icon: <Icon icon={Download} size="sm" />,
        isDisabled,
      }}
      alignment="end"
      menuWidth={160}
      items={[
        {
          label: 'CSV',
          onClick: () =>
            downloadFile(`${filename}.csv`, toCsv(build()), 'text/csv'),
        },
        {
          label: 'JSON',
          onClick: () =>
            downloadFile(
              `${filename}.json`,
              toJson(build(), new Date()),
              'application/json',
            ),
        },
      ]}
    />
  )
}
