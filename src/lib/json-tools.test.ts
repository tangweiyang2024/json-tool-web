import { describe, expect, it } from 'vitest'
import {
  csvToJson,
  diffJson,
  escapeToJsonString,
  formatJson,
  jsonToCsv,
  jsonToXml,
  jsonToYaml,
  minifyJson,
  repairJsonString,
  searchJson,
  sortJsonText,
  unescapeFromJsonString,
  validateJson,
  xmlToJson,
  yamlToJson,
} from './json-tools'

describe('json-tools', () => {
  it('formats and minifies json', () => {
    expect(formatJson('{"b":2,"a":1}')).toContain('\n')
    expect(minifyJson('{"a":1, "b":2}')).toBe('{"a":1,"b":2}')
  })

  it('supports comment json input', () => {
    const withComments = `{
      // single line
      "name": "tool", /* inline block */
      "version": 1,
    }`

    expect(formatJson(withComments)).toContain('"name": "tool"')
    expect(validateJson(withComments).valid).toBe(true)
  })

  it('validates invalid json', () => {
    const result = validateJson('{a:1}')
    expect(result.valid).toBe(false)
    expect(result.error).toBeTruthy()
  })

  it('repairs malformed json', () => {
    const repaired = repairJsonString('{name: "alice",}')
    expect(JSON.parse(repaired)).toEqual({ name: 'alice' })
  })

  it('sorts keys recursively', () => {
    const sorted = sortJsonText('{"z":1,"a":{"y":2,"b":1}}')
    expect(sorted.indexOf('"a"')).toBeLessThan(sorted.indexOf('"z"'))
    expect(sorted.indexOf('"b"')).toBeLessThan(sorted.indexOf('"y"'))
  })

  it('converts json and yaml both ways', () => {
    const yamlText = jsonToYaml('{"name":"tool","enabled":true}')
    expect(yamlText).toContain('name: tool')

    const jsonText = yamlToJson('name: tool\nenabled: true')
    expect(jsonText).toContain('"enabled": true')
  })

  it('converts json and xml both ways', () => {
    const xmlText = jsonToXml('{"root":{"id":1}}')
    expect(xmlText).toContain('<root>')

    const jsonText = xmlToJson('<root><id>1</id></root>')
    expect(jsonText).toContain('"id": 1')
  })

  it('converts json and csv both ways', () => {
    const csvText = jsonToCsv('[{"name":"alice","age":20}]')
    expect(csvText).toContain('name,age')

    const jsonText = csvToJson('name,age\nalice,20')
    expect(jsonText).toContain('"name": "alice"')
  })

  it('searches keys and values', () => {
    const matches = searchJson(
      { user: { name: 'alice', role: 'admin' }, list: ['guest'] },
      'ad',
    )
    expect(matches).toContain('$.user.role')
  })

  it('diffs two json documents', () => {
    const diff = diffJson(
      { name: 'alice', role: 'user' },
      { name: 'alice', role: 'admin', active: true },
    )

    expect(diff.some((item) => item.path === '$.role' && item.type === 'changed')).toBe(true)
    expect(diff.some((item) => item.path === '$.active' && item.type === 'added')).toBe(true)
  })

  it('escapes and unescapes text', () => {
    const escaped = escapeToJsonString('line1\nline2')
    expect(escaped).toBe('"line1\\nline2"')
    expect(unescapeFromJsonString(escaped)).toBe('line1\nline2')
    expect(unescapeFromJsonString('line1\\nline2')).toBe('line1\nline2')
  })
})
