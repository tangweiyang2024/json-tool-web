import { jsonrepair } from 'jsonrepair'
import yaml from 'js-yaml'
import { XMLBuilder, XMLParser } from 'fast-xml-parser'
import Papa from 'papaparse'
import stripJsonComments from 'strip-json-comments'

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue }

export type ValidationResult = {
  valid: boolean
  error?: string
}

export type DiffEntry = {
  path: string
  type: 'added' | 'removed' | 'changed'
  left?: unknown
  right?: unknown
}

export function parseJson(input: string): unknown {
  const cleaned = stripJsonComments(input, { trailingCommas: true })
  return JSON.parse(cleaned)
}

export function formatJson(input: string, indent = 2): string {
  return JSON.stringify(parseJson(input), null, indent)
}

export function minifyJson(input: string): string {
  return JSON.stringify(parseJson(input))
}

export function validateJson(input: string): ValidationResult {
  try {
    parseJson(input)
    return { valid: true }
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export function repairJsonString(input: string): string {
  return jsonrepair(input)
}

export function escapeToJsonString(input: string): string {
  return JSON.stringify(input)
}

export function unescapeFromJsonString(input: string): string {
  const text = input.trim()
  if (!text) {
    return ''
  }

  if (text.startsWith('"') && text.endsWith('"')) {
    const parsed = JSON.parse(text)
    if (typeof parsed !== 'string') {
      throw new Error('输入不是 JSON 字符串。')
    }
    return parsed
  }

  const wrapped = `"${text.replace(/"/g, '\\"').replace(/\r/g, '\\r').replace(/\n/g, '\\n')}"`
  return JSON.parse(wrapped)
}

export function sortJsonKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sortJsonKeys(item))
  }

  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => [k, sortJsonKeys(v)])

    return Object.fromEntries(entries)
  }

  return value
}

export function sortJsonText(input: string, indent = 2): string {
  const parsed = parseJson(input)
  const sorted = sortJsonKeys(parsed)
  return JSON.stringify(sorted, null, indent)
}

export function jsonToYaml(input: string): string {
  return yaml.dump(parseJson(input), { noRefs: true })
}

export function yamlToJson(input: string, indent = 2): string {
  const parsed = yaml.load(input)
  return JSON.stringify(parsed, null, indent)
}

export function jsonToXml(input: string): string {
  const parsed = parseJson(input)
  const builder = new XMLBuilder({
    format: true,
    ignoreAttributes: false,
    indentBy: '  ',
    suppressEmptyNode: true,
  })

  if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return builder.build(parsed)
  }

  return builder.build({ root: parsed })
}

export function xmlToJson(input: string, indent = 2): string {
  const parser = new XMLParser({ ignoreAttributes: false })
  const parsed = parser.parse(input)
  return JSON.stringify(parsed, null, indent)
}

export function jsonToCsv(input: string): string {
  const parsed = parseJson(input)

  if (!Array.isArray(parsed)) {
    throw new Error('CSV conversion expects a JSON array of objects.')
  }

  return Papa.unparse(parsed as Record<string, unknown>[])
}

export function csvToJson(input: string, indent = 2): string {
  const parsed = Papa.parse<Record<string, string>>(input, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim(),
  })

  if (parsed.errors.length > 0) {
    throw new Error(parsed.errors[0].message)
  }

  return JSON.stringify(parsed.data, null, indent)
}

export function searchJson(value: unknown, keyword: string): string[] {
  const needle = keyword.trim().toLowerCase()
  if (!needle) return []

  const matches: string[] = []

  const walk = (node: unknown, path: string): void => {
    if (Array.isArray(node)) {
      node.forEach((item, index) => walk(item, `${path}[${index}]`))
      return
    }

    if (node !== null && typeof node === 'object') {
      Object.entries(node as Record<string, unknown>).forEach(([key, val]) => {
        const nextPath = `${path}.${key}`
        if (key.toLowerCase().includes(needle)) {
          matches.push(nextPath)
        }
        walk(val, nextPath)
      })
      return
    }

    const valueText = String(node).toLowerCase()
    if (valueText.includes(needle)) {
      matches.push(path)
    }
  }

  walk(value, '$')

  return Array.from(new Set(matches))
}

export function diffJson(left: unknown, right: unknown): DiffEntry[] {
  const output: DiffEntry[] = []

  const walk = (a: unknown, b: unknown, path: string): void => {
    if (Object.is(a, b)) {
      return
    }

    const aIsArray = Array.isArray(a)
    const bIsArray = Array.isArray(b)

    if (aIsArray && bIsArray) {
      const max = Math.max(a.length, b.length)
      for (let i = 0; i < max; i += 1) {
        const hasA = i < a.length
        const hasB = i < b.length
        const nextPath = `${path}[${i}]`

        if (!hasA && hasB) {
          output.push({ path: nextPath, type: 'added', right: b[i] })
        } else if (hasA && !hasB) {
          output.push({ path: nextPath, type: 'removed', left: a[i] })
        } else {
          walk(a[i], b[i], nextPath)
        }
      }
      return
    }

    const aIsObject = a !== null && typeof a === 'object' && !aIsArray
    const bIsObject = b !== null && typeof b === 'object' && !bIsArray

    if (aIsObject && bIsObject) {
      const keys = new Set([
        ...Object.keys(a as Record<string, unknown>),
        ...Object.keys(b as Record<string, unknown>),
      ])

      keys.forEach((key) => {
        const hasA = Object.prototype.hasOwnProperty.call(a, key)
        const hasB = Object.prototype.hasOwnProperty.call(b, key)
        const nextPath = `${path}.${key}`

        if (!hasA && hasB) {
          output.push({
            path: nextPath,
            type: 'added',
            right: (b as Record<string, unknown>)[key],
          })
        } else if (hasA && !hasB) {
          output.push({
            path: nextPath,
            type: 'removed',
            left: (a as Record<string, unknown>)[key],
          })
        } else {
          walk(
            (a as Record<string, unknown>)[key],
            (b as Record<string, unknown>)[key],
            nextPath,
          )
        }
      })
      return
    }

    output.push({ path, type: 'changed', left: a, right: b })
  }

  walk(left, right, '$')
  return output
}
