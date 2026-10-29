/**
 * On phones, `.sg-table` rows are shown as stacked cards (see assets/css/main.css), with each value
 * labelled by its column heading. This copies every header's text onto the matching body/footer cells
 * as `data-label`, honouring colspans, and keeps it current as tables render, paginate or change.
 */
function labelTable(table: HTMLTableElement) {
  const heads: string[] = []
  for (const th of table.querySelectorAll<HTMLTableCellElement>(':scope > thead > tr:last-child > th')) {
    heads.push(th.textContent?.trim() ?? '')
    for (let i = 1; i < th.colSpan; i++) heads.push('')
  }
  if (!heads.length) return
  for (const row of table.querySelectorAll<HTMLTableRowElement>(':scope > tbody > tr, :scope > tfoot > tr')) {
    let col = 0
    for (const cell of row.cells) {
      const label = cell.colSpan === 1 ? (heads[col] ?? '') : ''
      if (label && cell.getAttribute('data-label') !== label) cell.setAttribute('data-label', label)
      else if (!label && cell.hasAttribute('data-label')) cell.removeAttribute('data-label')
      col += cell.colSpan
    }
  }
}

export default defineNuxtPlugin(() => {
  let queued = false
  const run = () => {
    queued = false
    document.querySelectorAll<HTMLTableElement>('table.sg-table').forEach(labelTable)
  }
  const schedule = () => {
    if (queued) return
    queued = true
    requestAnimationFrame(run)
  }
  // Only structural/text changes matter; attribute writes above don't retrigger the observer.
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true, characterData: true })
  schedule()
})
