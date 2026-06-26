import Anthropic from '@anthropic-ai/sdk'
import { getApiKey } from './secrets'
import { getMeta, setMeta } from './db'
import { DEFAULT_MODEL, EstimateResult, PRIORITY_LABEL, Priority } from '@shared/types'

export interface EstimateContext {
  title: string
  memo: string
  priority: Priority
  similar: { title: string; estimateMin: number | null; actualMin: number }[]
}

export function getModel(): string {
  return getMeta('anthropicModel') || DEFAULT_MODEL
}

export function setModel(model: string): void {
  setMeta('anthropicModel', model || DEFAULT_MODEL)
}

// 構造化出力は強制ツール呼び出しで取得（SDKバージョン非依存で確実にJSONが得られる）
const ESTIMATE_TOOL: Anthropic.Tool = {
  name: 'report_estimate',
  description: 'タスクの所要時間の推定結果を報告する',
  input_schema: {
    type: 'object',
    properties: {
      estimateMin: { type: 'integer', description: '推定される見込時間（分）' },
      rangeMinMin: { type: 'integer', description: '推定範囲の下限（分）' },
      rangeMaxMin: { type: 'integer', description: '推定範囲の上限（分）' },
      rationale: { type: 'string', description: '推定の根拠（日本語、1〜2文）' }
    },
    required: ['estimateMin', 'rangeMinMin', 'rangeMaxMin', 'rationale']
  }
}

export async function estimateDuration(ctx: EstimateContext): Promise<EstimateResult> {
  const apiKey = getApiKey()
  if (!apiKey) {
    throw new Error('Anthropic APIキーが設定されていません。設定画面で登録してください。')
  }
  const client = new Anthropic({ apiKey })

  const similarText = ctx.similar.length
    ? ctx.similar
        .map((s) => `- ${s.title}（見込 ${s.estimateMin ?? '不明'}分 / 実績 ${s.actualMin}分）`)
        .join('\n')
    : '（過去の類似タスクなし）'

  const prompt = [
    'あなたはタスクの所要時間を見積もるアシスタントです。',
    '以下のタスクに必要な作業時間を分単位で推定し、report_estimate ツールで結果を返してください。',
    '実績時間が分かる類似タスクがある場合は、その実績を重視して現実的に見積もってください。',
    '',
    `見出し: ${ctx.title}`,
    `メモ: ${ctx.memo || '(なし)'}`,
    `優先度: ${PRIORITY_LABEL[ctx.priority]}`,
    '',
    '過去の類似タスク（見込時間と実績時間）:',
    similarText
  ].join('\n')

  const res = await client.messages.create({
    model: getModel(),
    max_tokens: 1024,
    tools: [ESTIMATE_TOOL],
    tool_choice: { type: 'tool', name: 'report_estimate' },
    messages: [{ role: 'user', content: prompt }]
  })

  const block = res.content.find((b) => b.type === 'tool_use')
  if (!block || block.type !== 'tool_use') {
    throw new Error('AI推定の結果を取得できませんでした。')
  }
  const input = block.input as Partial<EstimateResult>
  if (typeof input.estimateMin !== 'number') {
    throw new Error('AI推定の結果が不正です。')
  }
  return {
    estimateMin: Math.max(1, Math.round(input.estimateMin)),
    rangeMinMin: Math.max(1, Math.round(input.rangeMinMin ?? input.estimateMin)),
    rangeMaxMin: Math.max(1, Math.round(input.rangeMaxMin ?? input.estimateMin)),
    rationale: input.rationale ?? '過去の類似タスクをもとに推定'
  }
}

/** APIキーの有効性を軽く確認（最小メッセージで検証）。キー未指定なら保存済みキーを使う。 */
export async function testApiKey(apiKey?: string): Promise<boolean> {
  const key = apiKey && apiKey.trim() && apiKey !== '__use_saved__' ? apiKey.trim() : getApiKey()
  if (!key) throw new Error('APIキーがありません。')
  const client = new Anthropic({ apiKey: key })
  await client.messages.create({
    model: getModel(),
    max_tokens: 4,
    messages: [{ role: 'user', content: 'ping' }]
  })
  return true
}
