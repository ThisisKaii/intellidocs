import { readFileSync } from 'fs'
import { gunzipSync } from 'zlib'
import path from 'path'

import { presetBlueprintSchema } from '../../../schemas/formattingSchemas'
import type { EditorJson } from '../../types/index'
import { closestBasePreset, extractPresetBlueprint } from '../extractPresetBlueprint'

const FIXTURES = path.resolve(__dirname, '../../../../tests/fixtures/import_baselines/editor_json')

function converted(name: string): EditorJson {
  return JSON.parse(gunzipSync(readFileSync(path.join(FIXTURES, `${name}.json.gz`))).toString('utf-8')) as EditorJson
}

const THESIS_PAGE = { page_size: 'letter' as const, orientation: 'portrait' as const, margins: { top: 1, bottom: 1, left: 1.5, right: 1 } }

describe('reading a preset from a formatted document', () => {
  it('takes the UCLM thesis look from the thesis itself', () => {
    const blueprint = extractPresetBlueprint(converted('V2 INTELLIDOCS (2).docx'), THESIS_PAGE, 'number')
    expect(presetBlueprintSchema.parse(blueprint)).toEqual(blueprint)
    expect(blueprint.margins).toEqual({ top: 1, bottom: 1, left: 1.5, right: 1 })
    expect(blueprint.fontFamily).toBe("'Times New Roman', serif")
    expect(blueprint.baseFontSize).toBe('11pt')
    expect(blueprint.bodyAlign).toBe('justify')
    expect(blueprint.headings.level1).toMatchObject({ textAlign: 'center', fontSize: '12pt', fontWeight: 700, textTransform: 'uppercase' })
    expect(blueprint.headings.level2).toMatchObject({ fontWeight: 700 })
    expect(blueprint.sections.slice(0, 1)).toEqual([{ level: 1, text: 'CHAPTER I' }])
    expect(closestBasePreset(blueprint)).toBe('uclm_capstone')
  })

  it('reads an IEEE paper as closest to the IEEE preset', () => {
    const blueprint = extractPresetBlueprint(converted('ieee_sample_paper.docx'), {
      page_size: 'letter',
      orientation: 'portrait',
      margins: { top: 0.75, bottom: 1, left: 0.625, right: 0.625 },
    })
    expect(presetBlueprintSchema.safeParse(blueprint).success).toBe(true)
    expect(closestBasePreset(blueprint)).toBe('ieee')
  })
})
