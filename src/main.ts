import './style.css'
import { diffLines } from 'diff'
import logoUrl from './assets/json-tool-logo.svg'
import {
  diffJson,
  escapeToJsonString,
  formatJson,
  minifyJson,
  parseJson,
  repairJsonString,
  searchJson,
  sortJsonText,
  unescapeFromJsonString,
  validateJson,
} from './lib/json-tools'

type OutputState = {
  text: string
  isJson: boolean
}

type DiffRow = {
  kind: 'same' | 'added' | 'removed' | 'changed'
  leftNo: number | null
  rightNo: number | null
  leftText: string
  rightText: string
}

const app = document.querySelector<HTMLDivElement>('#app')
if (!app) throw new Error('App root not found')

const faviconEl = document.querySelector<HTMLLinkElement>("link[rel~='icon']")
if (faviconEl) {
  faviconEl.href = logoUrl
}
document.title = 'JSON 工具站'

app.innerHTML = `
  <main class="page">
    <nav class="tabs">
      <button class="tab-btn active" data-tab-btn="tools">JSON 工具</button>
      <button class="tab-btn" data-tab-btn="diff">JSON Diff</button>
      <div class="theme-switch">
        <button class="theme-btn active" data-theme-btn="biz">商务浅灰</button>
        <button class="theme-btn" data-theme-btn="dark">深色护眼</button>
      </div>
    </nav>

    <section class="tab-page active tools-layout" data-tab-page="tools">
      <section class="panel editor-panel">
        <div class="panel-head">
          <span></span>
          <div class="icon-actions">
            <button class="icon-btn" data-action="upload" title="上传文件" data-tip="上传文件">↑</button>
            <button class="icon-btn" data-action="clear" title="清空" data-tip="清空">×</button>
            <button class="icon-btn" data-action="format" title="格式化" data-tip="格式化">{ }</button>
            <button class="icon-btn" data-action="validate" title="校验" data-tip="校验">✓</button>
          </div>
        </div>

        <div class="actions wrap">
          <button data-action="format">格式化</button>
          <button data-action="minify">压缩</button>
          <button data-action="validate">校验</button>
          <button data-action="repair">修复</button>
          <button data-action="sort">键排序</button>
          <button data-action="escape">转义</button>
          <button data-action="unescape">反转义</button>
        </div>

        <textarea id="input-text" class="input-large" spellcheck="false" placeholder='请粘贴 JSON / YAML / XML / CSV 内容'></textarea>

        <div class="search-box">
          <input id="search-keyword" type="text" placeholder="在 JSON 中搜索键或值" />
          <button data-action="search">搜索</button>
        </div>
        <div id="search-result" class="result-box muted"></div>
      </section>

      <div class="editor-divider" id="tools-divider" aria-label="调整左右宽度" role="separator">
        <span class="divider-handle"></span>
      </div>

      <section class="panel editor-panel">
        <div class="panel-head">
          <span></span>
          <div class="icon-actions">
            <button class="icon-btn" data-action="view-text" title="文本视图" data-tip="文本视图">T</button>
            <button class="icon-btn" data-action="view-tree" title="树视图" data-tip="树视图">◫</button>
            <button class="icon-btn" data-action="copy" title="复制" data-tip="复制">⧉</button>
            <button class="icon-btn" data-action="download" title="下载" data-tip="下载">↓</button>
          </div>
        </div>
        <pre id="output-text" class="output"></pre>
        <div id="output-tree" class="tree hidden"></div>
        <p id="status" class="status">就绪。</p>
      </section>
    </section>

    <section class="tab-page" data-tab-page="diff">
      <section class="panel diff-panel">
        <div class="panel-head">
          <h2>JSON 对比</h2>
          <div class="actions compact">
            <button data-action="diff-format-left">格式化左侧</button>
            <button data-action="diff-format-right">格式化右侧</button>
            <button data-action="compare">开始对比</button>
          </div>
        </div>

        <div class="diff-input-grid">
          <textarea id="diff-left-text" class="input-large" spellcheck="false" placeholder='左侧 JSON'></textarea>
          <textarea id="diff-right-text" class="input-large" spellcheck="false" placeholder='右侧 JSON'></textarea>
        </div>

        <div class="diff-nav">
          <span id="diff-summary" class="diff-summary">双向对比：共 0 处不同</span>
          <button data-action="diff-first">第一个</button>
          <button data-action="diff-prev">上一个</button>
          <button data-action="diff-next">下一个</button>
          <button data-action="diff-last">最后一个</button>
        </div>

        <div id="diff-view" class="diff-view"></div>
        <div id="diff-paths" class="result-box muted"></div>
      </section>
    </section>

    <input id="file-input" type="file" class="hidden" accept=".json,.txt,.yaml,.yml,.xml,.csv" />
  </main>
`

const inputEl = document.querySelector<HTMLTextAreaElement>('#input-text')!
const outputTextEl = document.querySelector<HTMLElement>('#output-text')!
const outputTreeEl = document.querySelector<HTMLDivElement>('#output-tree')!
const statusEl = document.querySelector<HTMLParagraphElement>('#status')!
const searchKeywordEl = document.querySelector<HTMLInputElement>('#search-keyword')!
const searchResultEl = document.querySelector<HTMLDivElement>('#search-result')!
const diffLeftEl = document.querySelector<HTMLTextAreaElement>('#diff-left-text')!
const diffRightEl = document.querySelector<HTMLTextAreaElement>('#diff-right-text')!
const diffViewEl = document.querySelector<HTMLDivElement>('#diff-view')!
const diffSummaryEl = document.querySelector<HTMLSpanElement>('#diff-summary')!
const diffPathsEl = document.querySelector<HTMLDivElement>('#diff-paths')!
const fileInputEl = document.querySelector<HTMLInputElement>('#file-input')!
const toolsLayoutEl = document.querySelector<HTMLElement>('.tools-layout')!
const toolsDividerEl = document.querySelector<HTMLDivElement>('#tools-divider')!

let output: OutputState = { text: '', isJson: false }
let diffRows: DiffRow[] = []
let diffAnchorRowIndices: number[] = []
let diffCursor = 0

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function setActiveTab(tab: 'tools' | 'diff'): void {
  document.querySelectorAll<HTMLButtonElement>('[data-tab-btn]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tabBtn === tab)
  })
  document.querySelectorAll<HTMLElement>('[data-tab-page]').forEach((page) => {
    page.classList.toggle('active', page.dataset.tabPage === tab)
  })
}

function setTheme(theme: 'biz' | 'dark'): void {
  document.documentElement.dataset.theme = theme
  document.querySelectorAll<HTMLButtonElement>('[data-theme-btn]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.themeBtn === theme)
  })
  localStorage.setItem('json-util-theme', theme)
}

function setupToolsDivider(): void {
  let dragging = false
  let startX = 0
  let startLeftPx = 0

  const onMove = (event: PointerEvent): void => {
    if (!dragging) return

    const containerWidth = toolsLayoutEl.clientWidth
    const gapPx = 14
    const usable = Math.max(1, containerWidth - gapPx)
    const moved = event.clientX - startX
    const leftPx = startLeftPx + moved
    const percent = (leftPx / usable) * 100
    const clamped = Math.max(25, Math.min(75, percent))
    toolsLayoutEl.style.setProperty('--tools-left', `${clamped}%`)
  }

  const onUp = (): void => {
    if (!dragging) return
    dragging = false
    document.body.classList.remove('is-dragging-divider')
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    const current = toolsLayoutEl.style.getPropertyValue('--tools-left')
    if (current) {
      localStorage.setItem('json-util-tools-left', current)
    }
  }

  toolsDividerEl.addEventListener('pointerdown', (event) => {
    if (window.innerWidth <= 960) return
    dragging = true
    startX = event.clientX
    const computed = getComputedStyle(toolsLayoutEl).getPropertyValue('--tools-left').trim() || '50%'
    const containerWidth = Math.max(1, toolsLayoutEl.clientWidth - 14)
    const pct = Number.parseFloat(computed.replace('%', '')) || 50
    startLeftPx = (pct / 100) * containerWidth
    document.body.classList.add('is-dragging-divider')
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  })

  const saved = localStorage.getItem('json-util-tools-left')
  if (saved) {
    toolsLayoutEl.style.setProperty('--tools-left', saved)
  }
}

function setStatus(message: string, type: 'ok' | 'error' | 'info' = 'info'): void {
  statusEl.textContent = message
  statusEl.className = `status ${type}`
}

function highlightJsonText(text: string): string {
  const escaped = text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')

  return escaped.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\btrue\b|\bfalse\b|\bnull\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    (match) => {
      let cls = 'json-number'
      if (match.startsWith('"')) {
        cls = match.endsWith(':') ? 'json-key' : 'json-string'
      } else if (match === 'true' || match === 'false') {
        cls = 'json-bool'
      } else if (match === 'null') {
        cls = 'json-null'
      }
      return `<span class="${cls}">${match}</span>`
    },
  )
}

function renderOutputText(): void {
  if (output.isJson) {
    outputTextEl.innerHTML = highlightJsonText(output.text)
    outputTextEl.classList.add('json-highlight')
  } else {
    outputTextEl.textContent = output.text
    outputTextEl.classList.remove('json-highlight')
  }
}

function setOutput(text: string, isJson: boolean): void {
  output = { text, isJson }
  renderOutputText()
  outputTreeEl.innerHTML = ''
  outputTextEl.classList.remove('hidden')
  outputTreeEl.classList.add('hidden')
}

function splitLines(text: string): string[] {
  return text.replace(/\r\n/g, '\n').split('\n')
}

function lineNumberCell(value: number | null): string {
  return value === null ? '' : String(value)
}

function renderDiffTable(rows: DiffRow[]): void {
  const html = rows
    .map((row, rowIndex) => {
      const leftText = row.leftText === '' ? '&nbsp;' : escapeHtml(row.leftText)
      const rightText = row.rightText === '' ? '&nbsp;' : escapeHtml(row.rightText)
      return `<div class="diff-row ${row.kind}" data-row-index="${rowIndex}">
        <div class="cell ln left-ln">${lineNumberCell(row.leftNo)}</div>
        <div class="cell code left-code">${leftText}</div>
        <div class="cell mid-gap"></div>
        <div class="cell ln right-ln">${lineNumberCell(row.rightNo)}</div>
        <div class="cell code right-code">${rightText}</div>
      </div>`
    })
    .join('')

  diffViewEl.innerHTML = `<div class="diff-table">${html}<svg class="diff-connectors"></svg></div>`
}

function renderDiffConnectors(): void {
  const table = diffViewEl.querySelector<HTMLDivElement>('.diff-table')
  const svg = diffViewEl.querySelector<SVGElement>('.diff-connectors')
  if (!table || !svg) return

  const changedRows = table.querySelectorAll<HTMLDivElement>('.diff-row.added, .diff-row.removed, .diff-row.changed')
  const tableWidth = table.scrollWidth
  const tableHeight = table.scrollHeight
  svg.setAttribute('viewBox', `0 0 ${tableWidth} ${tableHeight}`)
  svg.setAttribute('width', String(tableWidth))
  svg.setAttribute('height', String(tableHeight))

  const paths: string[] = []
  changedRows.forEach((row) => {
    const leftCode = row.querySelector<HTMLDivElement>('.left-code')
    const rightCode = row.querySelector<HTMLDivElement>('.right-code')
    if (!leftCode || !rightCode) return

    const y = row.offsetTop + row.clientHeight / 2
    const x1 = leftCode.offsetLeft + leftCode.clientWidth
    const x2 = rightCode.offsetLeft
    const dx = Math.max(18, (x2 - x1) * 0.45)
    const rowIndex = row.dataset.rowIndex ?? ''

    paths.push(
      `<path class="diff-connector ${row.classList.contains('changed') ? 'changed' : row.classList.contains('added') ? 'added' : 'removed'}" data-row-index="${rowIndex}" d="M ${x1} ${y} C ${x1 + dx} ${y}, ${x2 - dx} ${y}, ${x2} ${y}" />`,
    )
  })

  svg.innerHTML = paths.join('')
}

function markDiffCursor(): void {
  const rows = diffViewEl.querySelectorAll<HTMLDivElement>('.diff-row')
  const connectors = diffViewEl.querySelectorAll<SVGPathElement>('.diff-connector')
  rows.forEach((row) => row.classList.remove('active'))
  connectors.forEach((path) => path.classList.remove('active'))

  if (diffAnchorRowIndices.length === 0) {
    diffSummaryEl.textContent = '双向对比：共 0 处不同'
    return
  }

  const anchorRow = diffAnchorRowIndices[diffCursor]
  const active = diffViewEl.querySelector<HTMLDivElement>(`.diff-row[data-row-index="${anchorRow}"]`)
  if (!active) return

  active.classList.add('active')
  const activeConnector = diffViewEl.querySelector<SVGPathElement>(`.diff-connector[data-row-index="${anchorRow}"]`)
  activeConnector?.classList.add('active')
  active.scrollIntoView({ block: 'center', behavior: 'smooth' })

  const leftLine = active.querySelector<HTMLElement>('.left-ln')?.textContent?.trim() ?? ''
  const rightLine = active.querySelector<HTMLElement>('.right-ln')?.textContent?.trim() ?? ''
  const fromLine = leftLine || rightLine
  const toLine = rightLine || leftLine
  const lineText = fromLine || toLine ? `（行 ${fromLine || '-'}-${toLine || '-'}）` : ''
  diffSummaryEl.textContent = `双向对比：共 ${diffAnchorRowIndices.length} 处不同，当前第 ${diffCursor + 1} 个${lineText}`
}

function buildRowsFromTexts(leftText: string, rightText: string): DiffRow[] {
  const rows: DiffRow[] = []
  let leftNo = 1
  let rightNo = 1

  const parts = diffLines(leftText, rightText)
  const toLines = (value: string): string[] => {
    const list = splitLines(value)
    if (list.length > 0 && list[list.length - 1] === '') list.pop()
    return list
  }

  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i]

    if (part.removed) {
      const removedLines = toLines(part.value)
      const next = parts[i + 1]

      if (next?.added) {
        const addedLines = toLines(next.value)
        const max = Math.max(removedLines.length, addedLines.length)

        for (let j = 0; j < max; j += 1) {
          const leftLine = removedLines[j]
          const rightLine = addedLines[j]
          rows.push({
            kind: leftLine !== undefined && rightLine !== undefined ? 'changed' : leftLine !== undefined ? 'removed' : 'added',
            leftNo: leftLine !== undefined ? leftNo++ : null,
            rightNo: rightLine !== undefined ? rightNo++ : null,
            leftText: leftLine ?? '',
            rightText: rightLine ?? '',
          })
        }
        i += 1
      } else {
        removedLines.forEach((line) => {
          rows.push({ kind: 'removed', leftNo: leftNo++, rightNo: null, leftText: line, rightText: '' })
        })
      }
      continue
    }

    if (part.added) {
      toLines(part.value).forEach((line) => {
        rows.push({ kind: 'added', leftNo: null, rightNo: rightNo++, leftText: '', rightText: line })
      })
      continue
    }

    toLines(part.value).forEach((line) => {
      rows.push({ kind: 'same', leftNo: leftNo++, rightNo: rightNo++, leftText: line, rightText: line })
    })
  }

  return rows
}

function renderJsonDiff(leftInput: string, rightInput: string): void {
  const leftFormatted = formatJson(leftInput, 2)
  const rightFormatted = formatJson(rightInput, 2)
  diffLeftEl.value = leftFormatted
  diffRightEl.value = rightFormatted

  diffRows = buildRowsFromTexts(leftFormatted, rightFormatted)
  diffAnchorRowIndices = []
  diffRows.forEach((row, idx) => {
    if (row.kind !== 'same') diffAnchorRowIndices.push(idx)
  })

  diffCursor = 0
  renderDiffTable(diffRows)
  renderDiffConnectors()
  markDiffCursor()

  const semanticDiffs = diffJson(parseJson(leftFormatted), parseJson(rightFormatted))
  if (semanticDiffs.length === 0) {
    diffPathsEl.textContent = '未发现 JSON 路径差异。'
  } else {
    diffPathsEl.innerHTML = semanticDiffs.slice(0, 150).map((item) => `<code>${escapeHtml(item.path)}</code>`).join(' ')
  }
}

function renderTreeNode(value: unknown, key?: string): string {
  const label = key ? `<span class="k">${escapeHtml(key)}</span>: ` : ''

  if (Array.isArray(value)) {
    const items = value.map((item, index) => `<li>${renderTreeNode(item, String(index))}</li>`).join('')
    return `${label}<details open><summary>[${value.length}]</summary><ul>${items}</ul></details>`
  }

  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => `<li>${renderTreeNode(v, k)}</li>`)
      .join('')
    return `${label}<details open><summary>{${Object.keys(value as object).length}}</summary><ul>${entries}</ul></details>`
  }

  return `${label}<span class="v">${escapeHtml(JSON.stringify(value))}</span>`
}

function renderTreeFromOutput(): void {
  if (!output.isJson) {
    setStatus('树视图仅支持 JSON 输出。', 'error')
    return
  }

  const parsed = parseJson(output.text)
  outputTreeEl.innerHTML = `<ul><li>${renderTreeNode(parsed, '$')}</li></ul>`
  outputTextEl.classList.add('hidden')
  outputTreeEl.classList.remove('hidden')
}

function requireInput(): string {
  const input = inputEl.value.trim()
  if (!input) throw new Error('输入内容为空。')
  return input
}

function handleAction(action: string): void {
  try {
    switch (action) {
      case 'format':
        setOutput(formatJson(requireInput(), 2), true)
        setStatus('JSON 已格式化。', 'ok')
        break
      case 'minify':
        setOutput(minifyJson(requireInput()), true)
        setStatus('JSON 已压缩。', 'ok')
        break
      case 'validate': {
        const result = validateJson(requireInput())
        if (!result.valid) throw new Error(result.error ?? 'JSON 不合法。')
        setStatus('JSON 校验通过。', 'ok')
        break
      }
      case 'repair': {
        const repaired = repairJsonString(requireInput())
        setOutput(formatJson(repaired), true)
        inputEl.value = repaired
        setStatus('输入已修复并转为 JSON。', 'ok')
        break
      }
      case 'sort':
        setOutput(sortJsonText(requireInput()), true)
        setStatus('已递归完成键排序。', 'ok')
        break
      case 'escape':
        setOutput(escapeToJsonString(requireInput()), false)
        setStatus('已完成转义。', 'ok')
        break
      case 'unescape':
        setOutput(unescapeFromJsonString(requireInput()), false)
        setStatus('已完成反转义。', 'ok')
        break
      case 'search': {
        const matches = searchJson(parseJson(requireInput()), searchKeywordEl.value)
        searchResultEl.innerHTML = matches.length === 0 ? '未找到匹配路径。' : matches.map((p) => `<code>${escapeHtml(p)}</code>`).join(' ')
        break
      }
      case 'copy':
        if (!output.text) throw new Error('输出内容为空。')
        navigator.clipboard.writeText(output.text)
        setStatus('输出已复制到剪贴板。', 'ok')
        break
      case 'download': {
        if (!output.text) throw new Error('输出内容为空。')
        const blob = new Blob([output.text], { type: 'text/plain;charset=utf-8' })
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = output.isJson ? 'output.json' : 'output.txt'
        a.click()
        URL.revokeObjectURL(a.href)
        setStatus('输出已下载。', 'ok')
        break
      }
      case 'upload':
        fileInputEl.click()
        break
      case 'clear':
        inputEl.value = ''
        diffLeftEl.value = ''
        diffRightEl.value = ''
        diffViewEl.innerHTML = ''
        diffPathsEl.textContent = ''
        searchResultEl.textContent = ''
        setOutput('', false)
        setStatus('已清空输入与输出。')
        break
      case 'view-text':
        outputTextEl.classList.remove('hidden')
        outputTreeEl.classList.add('hidden')
        break
      case 'view-tree':
        renderTreeFromOutput()
        setStatus('已切换到树视图。', 'ok')
        break
      case 'diff-format-left':
        diffLeftEl.value = formatJson(diffLeftEl.value, 2)
        setStatus('左侧 JSON 已格式化。', 'ok')
        break
      case 'diff-format-right':
        diffRightEl.value = formatJson(diffRightEl.value, 2)
        setStatus('右侧 JSON 已格式化。', 'ok')
        break
      case 'compare':
        renderJsonDiff(diffLeftEl.value, diffRightEl.value)
        setStatus('已完成左右并排 JSON 对比。', 'ok')
        break
      case 'diff-first':
        if (diffAnchorRowIndices.length > 0) {
          diffCursor = 0
          markDiffCursor()
        }
        break
      case 'diff-prev':
        if (diffAnchorRowIndices.length > 0) {
          diffCursor = Math.max(0, diffCursor - 1)
          markDiffCursor()
        }
        break
      case 'diff-next':
        if (diffAnchorRowIndices.length > 0) {
          diffCursor = Math.min(diffAnchorRowIndices.length - 1, diffCursor + 1)
          markDiffCursor()
        }
        break
      case 'diff-last':
        if (diffAnchorRowIndices.length > 0) {
          diffCursor = diffAnchorRowIndices.length - 1
          markDiffCursor()
        }
        break
      default:
        break
    }
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), 'error')
  }
}

document.querySelectorAll<HTMLButtonElement>('button[data-tab-btn]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tabBtn
    if (tab === 'tools' || tab === 'diff') setActiveTab(tab)
  })
})

document.querySelectorAll<HTMLButtonElement>('button[data-theme-btn]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const theme = btn.dataset.themeBtn
    if (theme === 'biz' || theme === 'dark') setTheme(theme)
  })
})

document.querySelectorAll<HTMLButtonElement>('button[data-action]').forEach((button) => {
  button.addEventListener('click', () => {
    const action = button.dataset.action
    if (action) handleAction(action)
  })
})

fileInputEl.addEventListener('change', async () => {
  const file = fileInputEl.files?.[0]
  if (!file) return
  inputEl.value = await file.text()
  setStatus(`已加载文件：${file.name}。`, 'ok')
})

window.addEventListener('resize', () => {
  if (diffRows.length > 0) {
    renderDiffConnectors()
    markDiffCursor()
  }
})

inputEl.value = '{"name":"json util","version":1,"features":["format","validate"]}'
setOutput(formatJson(inputEl.value), true)

diffLeftEl.value = '{"name":"json util","version":1,"features":["format","validate"]}'
diffRightEl.value = '{"name":"json util","version":2,"features":["format","validate","diff"],"license":"MIT"}'
renderJsonDiff(diffLeftEl.value, diffRightEl.value)

const savedTheme = localStorage.getItem('json-util-theme')
setTheme(savedTheme === 'dark' ? 'dark' : 'biz')
setupToolsDivider()

setStatus('就绪，可开始格式化、校验或转换。')

