import { useEffect, useLayoutEffect, useMemo, useRef, useState, type JSX } from 'react'
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy
} from '@dnd-kit/sortable'
import {
  AppSettings,
  CATEGORY_LABEL,
  PRIORITY_LABEL,
  REASON_LABEL,
  RECURRENCE_LABEL,
  Task,
  TodayReason
} from '@shared/types'
import { autoSortTasks, deadlineDateTime, selectTodayTasks } from '@shared/logic'
import { TaskEditor } from './components/TaskEditor'
import { CompleteDialog } from './components/CompleteDialog'
import { PostponeDialog } from './components/PostponeDialog'
import { SettingsDialog } from './components/SettingsDialog'
import { SortableTaskRow, TaskRow } from './components/TaskRow'
import { liveActualMin, minutesToText } from './format'

function isOverdue(task: Task, now: number): boolean {
  const dt = deadlineDateTime(task)
  return !!dt && dt.getTime() < now
}

function Badges({
  task,
  isToday,
  overdue
}: {
  task: Task
  isToday?: boolean
  overdue?: boolean
}): JSX.Element {
  return (
    <>
      <span className={`badge cat-${task.category}`}>{CATEGORY_LABEL[task.category]}</span>
      <span className={`badge prio-${task.priority}`}>{PRIORITY_LABEL[task.priority]}</span>
      {task.recurrence !== 'NONE' && (
        <span className="badge recur">{RECURRENCE_LABEL[task.recurrence]}</span>
      )}
      {task.status === 'POSTPONED' && <span className="badge status-POSTPONED">後回し</span>}
      {task.status === 'DOING' && <span className="badge status-DOING">進行中</span>}
      {overdue && <span className="badge overdue">締切超過</span>}
      {isToday && !overdue && <span className="badge today">今日中</span>}
    </>
  )
}

function formatTimer(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

export default function App(): JSX.Element {
  const [tasks, setTasks] = useState<Task[]>([])
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [now, setNow] = useState(Date.now())

  const [editor, setEditor] = useState<{ task?: Task } | null>(null)
  const [completeFor, setCompleteFor] = useState<Task | null>(null)
  const [postponeFor, setPostponeFor] = useState<Task | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [toast, setToast] = useState('')
  // 表示は常に1エリアのみ：a1=今取り組み / a2=今日中 / a3=全タスク。他は1行に折りたたみ。
  // （「全体」同時表示は画面に収まらないため廃止）。既定は①。
  const [focus, setFocus] = useState<'a1' | 'a2' | 'a3'>('a1')
  const appRef = useRef<HTMLDivElement>(null)
  // ①②は内容量が限られるため、ウィンドウ高を内容に合わせる（③は件数が多く既定高でスクロール）
  const autosize = focus === 'a1' || focus === 'a2'
  // タグ絞り込み（両方onで両方表示）
  const [showWork, setShowWork] = useState(true)
  const [showPrivate, setShowPrivate] = useState(true)
  const matchCat = (t: Task): boolean =>
    (showWork && t.category === 'WORK') || (showPrivate && t.category === 'PRIVATE')

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  const reload = async (): Promise<void> => {
    setTasks(await window.api.list())
  }
  const reloadSettings = async (): Promise<void> => {
    setSettings(await window.api.getSettings())
  }

  useEffect(() => {
    ;(async () => {
      await reloadSettings()
      try {
        await window.api.generateRecurrences()
      } catch {
        /* noop */
      }
      await reload()
    })()
  }, [])

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const active = useMemo(() => tasks.find((t) => t.status === 'DOING') ?? null, [tasks])

  // 今日中：判定後にタグ絞り込みを適用
  const todayTasks = useMemo(
    () => selectTodayTasks(tasks, new Date(now)).filter((tt) => matchCat(tt.task)),
    [tasks, now, showWork, showPrivate]
  )
  const todayReasonById = useMemo(() => {
    const m = new Map<number, TodayReason>()
    // ハイライト判定はタグに関わらず付けたいので全体から算出
    for (const t of selectTodayTasks(tasks, new Date(now))) m.set(t.task.id, t.reason)
    return m
  }, [tasks, now])

  // 並び替え用に未完了/完了の全件（タグ非絞り込み）を保持
  const allIncomplete = useMemo(
    () => tasks.filter((t) => t.status !== 'DONE').sort((a, b) => a.sortOrder - b.sortOrder),
    [tasks]
  )
  const allCompleted = useMemo(() => tasks.filter((t) => t.status === 'DONE'), [tasks])

  // エリア3：表示はタグ絞り込み後
  const incomplete = useMemo(
    () => allIncomplete.filter(matchCat),
    [allIncomplete, showWork, showPrivate]
  )
  const completed = useMemo(
    () =>
      allCompleted
        .filter(matchCat)
        .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)),
    [allCompleted, showWork, showPrivate]
  )

  const flash = (msg: string): void => {
    setToast(msg)
    window.setTimeout(() => setToast(''), 4000)
  }

  const setStatus = async (id: number, status: Task['status']): Promise<void> => {
    await window.api.setStatus(id, status)
    await reload()
  }

  const doComplete = (task: Task): void => setCompleteFor(task)

  const onCompleted = async (nextTitle: string | null): Promise<void> => {
    setCompleteFor(null)
    await reload()
    if (nextTitle) flash(`次のタスク「${nextTitle}」を進行中にしました。`)
  }

  const del = async (task: Task): Promise<void> => {
    if (confirm(`「${task.title}」を削除しますか？`)) {
      await window.api.remove(task.id)
      await reload()
    }
  }

  const autoSort = async (): Promise<void> => {
    const ordered = autoSortTasks(tasks, new Date(now))
    await window.api.reorder(ordered.map((t) => t.id))
    await reload()
    flash('自動並び替えを実行しました。')
  }

  const onDragEnd = async (e: DragEndEvent): Promise<void> => {
    const { active: a, over } = e
    if (!over || a.id === over.id) return
    // 表示中（絞り込み後）の並びだけを入れ替える
    const visible = incomplete.map((t) => t.id)
    const oldIndex = visible.indexOf(Number(a.id))
    const newIndex = visible.indexOf(Number(over.id))
    if (oldIndex < 0 || newIndex < 0) return
    const newVisible = arrayMove(visible, oldIndex, newIndex)
    // 非表示（絞り込みで隠れた）タスクの位置は保ったまま、表示分のみ差し替え
    const visibleSet = new Set(visible)
    let vi = 0
    const mergedIncomplete = allIncomplete.map((t) =>
      visibleSet.has(t.id) ? newVisible[vi++] : t.id
    )
    // 完了タスクは全件を末尾に付けて全体の並び順を一意に保つ
    await window.api.reorder([...mergedIncomplete, ...allCompleted.map((t) => t.id)])
    await reload()
  }

  const editTask = (task?: Task): void => setEditor({ task })

  // 進行中タスクのタイマー表示（累計＋計測中の経過秒）
  const activeSec = active
    ? active.actualMin * 60 +
      (active.timerStartedAt
        ? Math.max(0, (now - new Date(active.timerStartedAt).getTime()) / 1000)
        : 0)
    : 0

  const collapsed = (area: 'a1' | 'a2' | 'a3'): boolean => focus !== area
  const focusArea = (area: 'a1' | 'a2' | 'a3'): void => setFocus(area)

  // 表示エリア／内容の変化に追従してウィンドウ高を調整する。
  // autosize 中は .app が内容ベースの高さになる（styles.css の .app.autosize）ため、
  // scrollHeight が「自然な高さ」になる。③やそれ以外では既定高に戻す。
  useLayoutEffect(() => {
    const el = appRef.current
    if (!el) return
    if (!autosize) {
      void window.api.setWindowHeight(null)
      return
    }
    let last = 0
    const report = (): void => {
      const h = Math.ceil(el.scrollHeight)
      if (h && h !== last) {
        last = h
        void window.api.setWindowHeight(h)
      }
    }
    report()
    const ro = new ResizeObserver(() => report())
    ro.observe(el)
    return () => ro.disconnect()
  }, [autosize])

  return (
    <div className={'app' + (autosize ? ' autosize' : '')} ref={appRef}>
      <div className="topbar">
        <h1>TaskControlCenter</h1>
        {toast && <span className="reason-tag">{toast}</span>}
        <button className="primary" onClick={() => editTask()}>
          ＋ 新規タスク
        </button>
        <button onClick={autoSort}>自動並び替え</button>
        <button onClick={() => setShowHistory((v) => !v)}>
          {showHistory ? '履歴を隠す' : '完了履歴'}
        </button>
        <button onClick={() => setSettingsOpen(true)}>設定</button>
      </div>

      <div className="subbar">
        <span className="subbar-label">表示：</span>
        <div className="segmented">
          <button className={focus === 'a1' ? 'active' : ''} onClick={() => setFocus('a1')}>
            ① 今取り組み
          </button>
          <button className={focus === 'a2' ? 'active' : ''} onClick={() => setFocus('a2')}>
            ② 今日中{todayTasks.length ? `（${todayTasks.length}）` : ''}
          </button>
          <button className={focus === 'a3' ? 'active' : ''} onClick={() => setFocus('a3')}>
            ③ 全タスク（{incomplete.length}）
          </button>
        </div>

        <div className="tag-filter">
          <span className="subbar-label">タグ：</span>
          <button
            className={'tag-toggle cat-WORK' + (showWork ? ' active' : '')}
            onClick={() => setShowWork((v) => !v)}
          >
            {showWork ? '☑' : '☐'} 仕事
          </button>
          <button
            className={'tag-toggle cat-PRIVATE' + (showPrivate ? ' active' : '')}
            onClick={() => setShowPrivate((v) => !v)}
          >
            {showPrivate ? '☑' : '☐'} 私事
          </button>
        </div>
      </div>

      <div className="areas">
        {/* エリア1：今取り組んでいるタスク */}
        <section
          className={
            'area area-1' +
            (collapsed('a1') ? ' collapsed' : '') +
            (focus === 'a1' ? ' focused' : '')
          }
        >
          <div className="area-head clickable" onClick={() => focusArea('a1')}>
            <span className="caret">{collapsed('a1') ? '▸' : '▾'}</span>
            今取り組んでいるタスク
            {collapsed('a1') && (
              <span className="collapsed-summary">
                {active ? `${active.title}（${formatTimer(activeSec)}）` : '進行中なし'}
              </span>
            )}
          </div>
          {!collapsed('a1') && (
          <div className="area-body">
            {active ? (
              <div className="active-card">
                <div className="active-title">{active.title}</div>
                <div className="active-meta">
                  <span>締切：{active.deadlineDate ?? '締切なし'}{active.deadlinePeriod !== 'NONE' ? ` ${active.deadlinePeriod}` : ''}</span>
                  <span>見込：{minutesToText(active.estimateMin)}</span>
                  <span className={`badge cat-${active.category}`}>{CATEGORY_LABEL[active.category]}</span>
                  <span className={`badge prio-${active.priority}`}>
                    優先度 {PRIORITY_LABEL[active.priority]}
                  </span>
                </div>
                <div className="active-meta">
                  <span>経過時間</span>
                  <span className="timer">{formatTimer(activeSec)}</span>
                </div>
                {active.memo && <div className="active-memo">{active.memo}</div>}
                <div className="active-actions">
                  <button className="primary" onClick={() => doComplete(active)}>
                    完了
                  </button>
                  <button onClick={() => setPostponeFor(active)}>後回し</button>
                  <button onClick={() => editTask(active)}>編集</button>
                </div>
              </div>
            ) : (
              <div className="empty">
                進行中のタスクはありません。
                <br />
                下の「全タスク」から任意のタスクを「進行中」にできます。
              </div>
            )}
          </div>
          )}
        </section>

        {/* エリア2：今日中に終えるべきタスク */}
        <section
          className={
            'area area-2' +
            (collapsed('a2') ? ' collapsed' : '') +
            (focus === 'a2' ? ' focused' : '')
          }
        >
          <div className="area-head clickable" onClick={() => focusArea('a2')}>
            <span className="caret">{collapsed('a2') ? '▸' : '▾'}</span>
            今日中に終えるべきタスク
            <span className="count">{todayTasks.length}</span>
            {!collapsed('a2') && (
              <span className="hint" style={{ marginLeft: 'auto' }}>
                1日の作業可能時間：{minutesToText(settings?.dailyCapacityMin ?? 300)}
              </span>
            )}
          </div>
          {!collapsed('a2') && (
          <div className="area-body">
            {todayTasks.length === 0 && <div className="empty">今日中のタスクはありません。</div>}
            {todayTasks.map(({ task, reason }) => (
              <TaskRow
                key={task.id}
                task={task}
                isToday
                badges={
                  <>
                    <span className="reason-tag">{REASON_LABEL[reason]}</span>
                    <Badges task={task} overdue={reason === 'OVERDUE'} />
                  </>
                }
                actions={
                  <>
                    {task.status !== 'DOING' && (
                      <button className="small primary" onClick={() => setStatus(task.id, 'DOING')}>
                        進行中に
                      </button>
                    )}
                    <button className="small" onClick={() => editTask(task)}>
                      編集
                    </button>
                  </>
                }
              />
            ))}
          </div>
          )}
        </section>

        {/* エリア3：全タスク */}
        <section
          className={
            'area area-3' +
            (collapsed('a3') ? ' collapsed' : '') +
            (focus === 'a3' ? ' focused' : '')
          }
        >
          <div className="area-head clickable" onClick={() => focusArea('a3')}>
            <span className="caret">{collapsed('a3') ? '▸' : '▾'}</span>
            {showHistory ? '完了履歴' : '全タスク'}
            <span className="count">{showHistory ? completed.length : incomplete.length}</span>
            {!collapsed('a3') && (
              <span className="hint" style={{ marginLeft: 'auto' }}>
                ドラッグで並び替え（自動選択の基準になります）
              </span>
            )}
          </div>
          {!collapsed('a3') && (
          <div className="area-body">
            {showHistory ? (
              completed.length === 0 ? (
                <div className="empty">完了したタスクはありません。</div>
              ) : (
                completed.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    badges={<span className="badge">完了</span>}
                    actions={
                      <button className="small danger" onClick={() => del(task)}>
                        削除
                      </button>
                    }
                  />
                ))
              )
            ) : incomplete.length === 0 ? (
              <div className="empty">タスクがありません。「＋ 新規タスク」から追加してください。</div>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                <SortableContext
                  items={incomplete.map((t) => t.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {incomplete.map((task) => {
                    const overdue = isOverdue(task, now)
                    return (
                      <SortableTaskRow
                        key={task.id}
                        task={task}
                        isToday={todayReasonById.has(task.id)}
                        isPostponed={task.status === 'POSTPONED'}
                        badges={<Badges task={task} isToday={todayReasonById.has(task.id)} overdue={overdue} />}
                        actions={
                          <>
                            {task.status !== 'DOING' && (
                              <button
                                className="small primary"
                                onClick={() => setStatus(task.id, 'DOING')}
                              >
                                進行中に
                              </button>
                            )}
                            <button className="small" onClick={() => doComplete(task)}>
                              完了
                            </button>
                            <button className="small" onClick={() => setPostponeFor(task)}>
                              後回し
                            </button>
                            <button className="small" onClick={() => editTask(task)}>
                              編集
                            </button>
                            <button className="small danger" onClick={() => del(task)}>
                              削除
                            </button>
                          </>
                        }
                      />
                    )
                  })}
                </SortableContext>
              </DndContext>
            )}
          </div>
          )}
        </section>
      </div>

      {editor && (
        <TaskEditor
          task={editor.task}
          onClose={() => setEditor(null)}
          onSaved={async () => {
            setEditor(null)
            await reload()
          }}
        />
      )}
      {completeFor && (
        <CompleteDialog
          task={completeFor}
          measuredMin={liveActualMin(completeFor, now)}
          onClose={() => setCompleteFor(null)}
          onDone={onCompleted}
        />
      )}
      {postponeFor && (
        <PostponeDialog
          task={postponeFor}
          onClose={() => setPostponeFor(null)}
          onDone={async () => {
            setPostponeFor(null)
            await reload()
          }}
        />
      )}
      {settingsOpen && settings && (
        <SettingsDialog
          settings={settings}
          onClose={() => setSettingsOpen(false)}
          onSaved={reloadSettings}
          onRestored={reload}
        />
      )}
    </div>
  )
}
