// Electronメインプロセス上で実行する統合テスト。
// 一時 userData ディレクトリを使い、実コード（db/repo/recurrence/shared logic）を検証する。
import { app } from 'electron'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdtempSync } from 'node:fs'

import {
  deadlineDateTime,
  selectTodayTasks,
  autoSortTasks,
  pickNextActive,
  nextRecurrenceDate,
  recurrenceTriggerTime
} from '@shared/logic'
import type { Task } from '@shared/types'

import { initDb, getDb } from '../src/main/db'
import {
  createTask,
  getTask,
  setStatus,
  completeTask,
  postponeTask,
  reorderTasks,
  listTasks,
  replaceAllFromImport
} from '../src/main/repo'
import { generateDueRecurrences } from '../src/main/recurrence'

let pass = 0
let fail = 0
const failures: string[] = []
function check(name: string, cond: boolean, detail = ''): void {
  if (cond) {
    pass++
    console.log('  PASS  ' + name)
  } else {
    fail++
    failures.push(name)
    console.log('  FAIL  ' + name + (detail ? '  → ' + detail : ''))
  }
}
function eq(name: string, actual: unknown, expected: unknown): void {
  const a = JSON.stringify(actual)
  const b = JSON.stringify(expected)
  check(name, a === b, `期待 ${b} / 実際 ${a}`)
}

function makeTask(p: Partial<Task>): Task {
  return {
    id: p.id ?? 0,
    title: p.title ?? 't',
    deadlineDate: p.deadlineDate ?? null,
    deadlinePeriod: p.deadlinePeriod ?? 'NONE',
    estimateMin: p.estimateMin ?? null,
    actualMin: p.actualMin ?? 0,
    priority: p.priority ?? 'MID',
    category: p.category ?? 'WORK',
    memo: p.memo ?? '',
    status: p.status ?? 'TODO',
    sortOrder: p.sortOrder ?? 0,
    recurrence: p.recurrence ?? 'NONE',
    recurrenceNextDate: p.recurrenceNextDate ?? null,
    timerStartedAt: p.timerStartedAt ?? null,
    createdAt: p.createdAt ?? '2026-01-01T00:00:00.000Z',
    updatedAt: p.updatedAt ?? '2026-01-01T00:00:00.000Z'
  }
}

function runLogicTests(): void {
  console.log('\n[1] 共有ロジック（純粋関数）')
  const now = new Date('2026-06-26T09:00:00') // 今日=2026-06-26 09:00

  // deadlineDateTime
  eq(
    'AM締切は当日12:00',
    deadlineDateTime(makeTask({ deadlineDate: '2026-06-26', deadlinePeriod: 'AM' }))?.getHours(),
    12
  )
  const pm = deadlineDateTime(makeTask({ deadlineDate: '2026-06-26', deadlinePeriod: 'PM' }))!
  eq('PM締切は翌0:00（時=0）', pm.getHours(), 0)
  eq('PM締切は翌日（日=27）', pm.getDate(), 27)
  check('締切なしはnull', deadlineDateTime(makeTask({})) === null)

  // selectTodayTasks
  const tasks: Task[] = [
    makeTask({ id: 1, title: '超過', deadlineDate: '2026-06-25', deadlinePeriod: 'PM' }),
    makeTask({ id: 2, title: '本日AM', deadlineDate: '2026-06-26', deadlinePeriod: 'AM' }),
    makeTask({ id: 3, title: '本日PM', deadlineDate: '2026-06-26', deadlinePeriod: 'PM' }),
    makeTask({ id: 4, title: '明日大', deadlineDate: '2026-06-27', deadlinePeriod: 'PM', estimateMin: 700 }),
    makeTask({ id: 5, title: '明日小', deadlineDate: '2026-06-27', deadlinePeriod: 'PM', estimateMin: 100 }),
    makeTask({ id: 6, title: '先逆算', deadlineDate: '2026-07-03', deadlinePeriod: 'PM', estimateMin: 3000 }),
    makeTask({ id: 7, title: '先余裕', deadlineDate: '2026-07-03', deadlinePeriod: 'PM', estimateMin: 100 }),
    makeTask({ id: 8, title: '後回し本日', deadlineDate: '2026-06-26', deadlinePeriod: 'PM', status: 'POSTPONED' }),
    makeTask({ id: 9, title: '完了本日', deadlineDate: '2026-06-26', deadlinePeriod: 'PM', status: 'DONE' }),
    makeTask({ id: 10, title: '締切なし' })
  ]
  const today = selectTodayTasks(tasks, now)
  const reasonOf = (id: number): string | undefined =>
    today.find((t) => t.task.id === id)?.reason
  eq('超過→OVERDUE', reasonOf(1), 'OVERDUE')
  eq('本日AM→TODAY_AM', reasonOf(2), 'TODAY_AM')
  eq('本日PM→TODAY_PM', reasonOf(3), 'TODAY_PM')
  eq('明日大→TOMORROW_START', reasonOf(4), 'TOMORROW_START')
  check('明日小は今日中ではない', reasonOf(5) === undefined)
  eq('先・逆算→BACKCALC_START', reasonOf(6), 'BACKCALC_START')
  check('先・余裕は今日中ではない', reasonOf(7) === undefined)
  check('後回しは除外', reasonOf(8) === undefined)
  check('完了は除外', reasonOf(9) === undefined)
  check('締切なしは除外', reasonOf(10) === undefined)
  eq('今日中の先頭は超過(OVERDUE)', today[0]?.task.id, 1)

  // autoSortTasks：バケット順（超過→本日AM→本日PM→着手要→近い→…）
  const unsorted: Task[] = [
    makeTask({ id: 21, title: '遠い', deadlineDate: '2026-09-01', deadlinePeriod: 'PM', sortOrder: 1 }),
    makeTask({ id: 22, title: '超過', deadlineDate: '2026-06-20', deadlinePeriod: 'PM', sortOrder: 2 }),
    makeTask({ id: 23, title: '本日AM', deadlineDate: '2026-06-26', deadlinePeriod: 'AM', sortOrder: 3 })
  ]
  const sorted = autoSortTasks(unsorted, now).map((t) => t.id)
  eq('自動並び替え順 [超過,本日AM,遠い]', sorted, [22, 23, 21])

  // pickNextActive
  const order: Task[] = [
    makeTask({ id: 31, status: 'DONE', sortOrder: 1 }),
    makeTask({ id: 32, status: 'TODO', sortOrder: 2 }),
    makeTask({ id: 33, status: 'POSTPONED', sortOrder: 3 }),
    makeTask({ id: 34, status: 'TODO', sortOrder: 4 })
  ]
  eq('完了#31の次は#32', pickNextActive(order, 1)?.id, 32)
  eq('完了#32の次は後回しを飛ばして#34', pickNextActive(order, 2)?.id, 34)
  check('末尾完了の次はなし', pickNextActive([makeTask({ id: 40, status: 'DONE', sortOrder: 9 })], 9) === null)

  // 繰り返し日付
  eq('毎週 +7日', nextRecurrenceDate('2026-06-26', 'WEEKLY'), '2026-07-03')
  eq('毎月 同日', nextRecurrenceDate('2026-06-15', 'MONTHLY'), '2026-07-15')
  eq('毎月 1/31→2/28(非閏)', nextRecurrenceDate('2026-01-31', 'MONTHLY'), '2026-02-28')
  eq('毎月 月末6/30→7/31', nextRecurrenceDate('2026-06-30', 'MONTHLY'), '2026-07-31')
  const trig = recurrenceTriggerTime('2026-07-03')
  eq('生成トリガは7日前(=6/26)', [trig.getMonth() + 1, trig.getDate(), trig.getHours()], [6, 26, 0])
}

function runDbTests(): void {
  console.log('\n[2] DB / リポジトリ統合')
  // category カラム（マイグレーション/新規スキーマ）
  const cols = (getDb().prepare('PRAGMA table_info(tasks)').all() as { name: string }[]).map(
    (c) => c.name
  )
  check('tasksに category カラムあり', cols.includes('category'))

  // createTask：採番・既定値
  const a = createTask({
    title: 'A',
    deadlineDate: '2026-06-26',
    deadlinePeriod: 'AM',
    estimateMin: 60,
    priority: 'HIGH',
    category: 'PRIVATE',
    memo: 'm',
    recurrence: 'NONE'
  })
  eq('作成時 status=TODO', a.status, 'TODO')
  eq('作成時 actual=0', a.actualMin, 0)
  eq('category 保存', a.category, 'PRIVATE')
  const b = createTask({ title: 'B', deadlineDate: null, deadlinePeriod: 'NONE', estimateMin: 30, priority: 'MID', category: 'WORK', memo: '', recurrence: 'NONE' })
  check('sort_orderは増加', b.sortOrder > a.sortOrder)

  // 進行中タイマー：単一DOING・前のDOINGは未着手へ
  setStatus(a.id, 'DOING')
  check('Aは進行中でtimer開始', getTask(a.id)!.status === 'DOING' && !!getTask(a.id)!.timerStartedAt)
  setStatus(b.id, 'DOING')
  eq('Bを進行中にするとAは未着手に戻る', getTask(a.id)!.status, 'TODO')
  check('Aのtimerは停止', getTask(a.id)!.timerStartedAt === null)
  eq('進行中は1件のみ', listTasks().filter((t) => t.status === 'DOING').length, 1)

  // 実績加算：timer_started_at を90分前に偽装→停止で +90分
  getDb()
    .prepare('UPDATE tasks SET timer_started_at = ? WHERE id = ?')
    .run(new Date(Date.now() - 90 * 60000).toISOString(), b.id)
  setStatus(b.id, 'TODO')
  const bAfter = getTask(b.id)!
  check('進行中→停止で実績が約90分加算', bAfter.actualMin >= 89 && bAfter.actualMin <= 91, `actual=${bAfter.actualMin}`)

  // 完了→次の未着手を自動的に進行中へ
  const x = createTask({ title: 'X', deadlineDate: null, deadlinePeriod: 'NONE', estimateMin: null, priority: 'MID', category: 'WORK', memo: '', recurrence: 'NONE' })
  const y = createTask({ title: 'Y', deadlineDate: null, deadlinePeriod: 'NONE', estimateMin: null, priority: 'MID', category: 'WORK', memo: '', recurrence: 'NONE' })
  setStatus(x.id, 'DOING')
  const res = completeTask(x.id, 120)
  eq('完了タスクはDONE', res.completed.status, 'DONE')
  eq('完了時の実績は手入力値', res.completed.actualMin, 120)
  eq('次の未着手Yが自動的に進行中に', res.next?.id, y.id)
  eq('Yは進行中', getTask(y.id)!.status, 'DOING')

  // 後回し：締切再設定なし→POSTPONED / 再設定→TODO+新締切
  const p1 = createTask({ title: 'P1', deadlineDate: '2026-06-20', deadlinePeriod: 'PM', estimateMin: 30, priority: 'LOW', category: 'WORK', memo: '', recurrence: 'NONE' })
  postponeTask(p1.id, { reschedule: false })
  eq('後回し(再設定なし)→POSTPONED', getTask(p1.id)!.status, 'POSTPONED')
  const p2 = createTask({ title: 'P2', deadlineDate: '2026-06-20', deadlinePeriod: 'PM', estimateMin: 30, priority: 'LOW', category: 'WORK', memo: '', recurrence: 'NONE' })
  postponeTask(p2.id, { reschedule: true, deadlineDate: '2026-12-31', deadlinePeriod: 'AM' })
  const p2a = getTask(p2.id)!
  check('後回し(再設定)→TODO+新締切', p2a.status === 'TODO' && p2a.deadlineDate === '2026-12-31' && p2a.deadlinePeriod === 'AM')

  // 並び替え
  reorderTasks([y.id, x.id, a.id])
  const sub = listTasks().filter((t) => [a.id, x.id, y.id].includes(t.id))
  const yOrder = sub.find((t) => t.id === y.id)!.sortOrder
  const xOrder = sub.find((t) => t.id === x.id)!.sortOrder
  const aOrder = sub.find((t) => t.id === a.id)!.sortOrder
  check('reorderで Y<X<A の順に', yOrder < xOrder && xOrder < aOrder)
}

function runRecurrenceTests(): void {
  console.log('\n[3] 繰り返し自動生成')
  const before = listTasks().filter((t) => t.title === 'WEEKLY-R').length
  createTask({
    title: 'WEEKLY-R',
    deadlineDate: '2026-06-26',
    deadlinePeriod: 'PM',
    estimateMin: 45,
    priority: 'MID',
    category: 'WORK',
    memo: 'r',
    recurrence: 'WEEKLY'
  })
  // 次回=2026-07-03、トリガ=6/26 0:00。now=6/26 9:00で生成されるはず
  const created = generateDueRecurrences(new Date('2026-06-26T09:00:00'))
  check('1件生成された', created === 1, `created=${created}`)
  const after = listTasks().filter((t) => t.title === 'WEEKLY-R')
  eq('WEEKLY-R が2件に', after.length, before + 2)
  const successor = after.find((t) => t.deadlineDate === '2026-07-03')
  check('生成タスクの締切=7/03', !!successor)
  check('生成タスクは未着手', successor?.status === 'TODO')
  check('生成タスクは繰り返し設定を継承', successor?.recurrence === 'WEEKLY')

  // 重複防止：再実行で増えない
  const again = generateDueRecurrences(new Date('2026-06-26T09:00:00'))
  check('再実行で重複生成しない', again === 0, `again=${again}`)
}

function runImportTests(): void {
  console.log('\n[4] バックアップ復元（全置換）')
  const imported: Task[] = [
    makeTask({ id: 999, title: 'IMP-A', status: 'DOING', sortOrder: 1, category: 'PRIVATE' }),
    makeTask({ id: 998, title: 'IMP-B', status: 'TODO', sortOrder: 2 })
  ]
  const count = replaceAllFromImport(imported)
  eq('復元件数=2', count, 2)
  const all = listTasks()
  eq('復元後の全件数=2', all.length, 2)
  const impA = all.find((t) => t.title === 'IMP-A')!
  eq('復元時 DOING→TODO に変換', impA.status, 'TODO')
  eq('復元でcategory保持', impA.category, 'PRIVATE')
}

function runEdgeTests(): void {
  console.log('\n[5] 境界・エッジケース')
  // AM締切は正午を過ぎると「本日AM」ではなく「締切超過」
  const pmNow = new Date('2026-06-26T14:00:00')
  const amToday = [makeTask({ id: 51, deadlineDate: '2026-06-26', deadlinePeriod: 'AM' })]
  eq('本日AMが午後14時にはOVERDUE', selectTodayTasks(amToday, pmNow)[0]?.reason, 'OVERDUE')

  // 残作業＝見込−実績。実績が進んでいれば今日中に入らない
  const now = new Date('2026-06-26T09:00:00')
  const almostDone = [
    makeTask({ id: 52, deadlineDate: '2026-06-27', deadlinePeriod: 'PM', estimateMin: 700, actualMin: 650 })
  ]
  check('残50分なら明日締切でも今日中ではない', selectTodayTasks(almostDone, now).length === 0)

  // 見込未入力＋将来締切は逆算できず今日中ではない
  const noEst = [makeTask({ id: 53, deadlineDate: '2026-08-01', deadlinePeriod: 'PM', estimateMin: null })]
  check('見込未入力の将来締切は今日中ではない', selectTodayTasks(noEst, now).length === 0)

  // 本日締切は見込が大きくても必ず含む（超過でなければTODAY_PM）
  const todayBig = [makeTask({ id: 54, deadlineDate: '2026-06-26', deadlinePeriod: 'PM', estimateMin: 9999 })]
  eq('本日PMは見込過大でもTODAY_PM', selectTodayTasks(todayBig, now)[0]?.reason, 'TODAY_PM')

  // 完了して次の未着手が無ければ next=null
  const lone = createTask({ title: 'LONE', deadlineDate: null, deadlinePeriod: 'NONE', estimateMin: null, priority: 'MID', category: 'WORK', memo: '', recurrence: 'NONE' })
  // 他を全て完了/後回しにしてから単独を完了
  for (const t of listTasks()) {
    if (t.id !== lone.id && t.status !== 'DONE') postponeTask(t.id, { reschedule: false })
  }
  setStatus(lone.id, 'DOING')
  const r = completeTask(lone.id, 10)
  check('次候補が無ければ自動選択はnull', r.next === null)
}

app.whenReady().then(() => {
  try {
    // 実DBを汚さないよう一時ディレクトリを使用
    const dir = mkdtempSync(join(tmpdir(), 'tcc-test-'))
    app.setPath('userData', dir)
    initDb()

    runLogicTests()
    runDbTests()
    runRecurrenceTests()
    runImportTests()
    runEdgeTests()

    console.log(`\n=== 結果: ${pass} PASS / ${fail} FAIL ===`)
    if (fail) console.log('失敗:', failures.join(', '))
    app.exit(fail ? 1 : 0)
  } catch (e) {
    console.error('TEST CRASHED:', e)
    app.exit(2)
  }
})
