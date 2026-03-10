import { useState, useEffect, useCallback, lazy, Suspense } from 'react'
import type { Teacher, Subject, SubjectCategory, Assignment, CreateInput } from './types'

import { useAuth } from './hooks/useAuth'
import { useTeachers } from './hooks/useTeachers'
import { useSubjects } from './hooks/useSubjects'
import { useAssignments } from './hooks/useAssignments'

import { LoadingSpinner } from './components/common/LoadingSpinner'
import { ErrorAlert } from './components/common/ErrorAlert'

import { TeacherForm } from './components/teacher/TeacherForm'
import { TeacherList } from './components/teacher/TeacherList'
import { TeacherCsvImport } from './components/teacher/TeacherCsvImport'

import { SubjectForm } from './components/subject/SubjectForm'
import { SubjectList } from './components/subject/SubjectList'
import { SubjectCsvImport } from './components/subject/SubjectCsvImport'

import { AssignmentForm } from './components/assignment/AssignmentForm'
import { AssignmentBulkForm } from './components/assignment/AssignmentBulkForm'
import { AssignmentList } from './components/assignment/AssignmentList'

import { useSettings } from './hooks/useSettings'
import { buildClassOptions, SUBJECT_CATEGORIES } from './utils/constants'

// 遅延ロード: 時間割ビューと設定パネル
const ScheduleViewContainer = lazy(() =>
  import('./components/schedule/ScheduleViewContainer').then((m) => ({ default: m.ScheduleViewContainer })),
)
const SettingsPanel = lazy(() =>
  import('./components/settings/SettingsPanel').then((m) => ({ default: m.SettingsPanel })),
)

// ============================================================
// タブ定義
// ============================================================

type Tab = 'schedule' | 'teachers' | 'subjects' | 'assignments' | 'settings'

const TABS: { id: Tab; label: string }[] = [
  { id: 'teachers', label: '教員管理' },
  { id: 'subjects', label: '科目管理' },
  { id: 'assignments', label: '授業割当' },
  { id: 'schedule', label: '時間割' },
  { id: 'settings', label: '設定' },
]

const VALID_TABS = new Set<string>(TABS.map((t) => t.id))

function getTabFromHash(): Tab {
  const hash = window.location.hash.replace('#', '')
  return VALID_TABS.has(hash) ? (hash as Tab) : 'teachers'
}

function useHashTab() {
  const [activeTab, setActiveTab] = useState<Tab>(getTabFromHash)

  useEffect(() => {
    const onHashChange = () => setActiveTab(getTabFromHash())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const navigate = useCallback((tab: Tab) => {
    window.location.hash = tab
    setActiveTab(tab)
  }, [])

  return { activeTab, navigate }
}

// ============================================================
// 教員管理セクション
// ============================================================

function TeacherSection() {
  const { teachers, loading, error, clearError, addTeacher, updateTeacher, deleteTeacher } =
    useTeachers()
  const { subjects } = useSubjects()

  const [editTarget, setEditTarget] = useState<Teacher | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [showCsvImport, setShowCsvImport] = useState(false)
  const [filterDepartment, setFilterDepartment] = useState<SubjectCategory | ''>('')

  const filteredTeachers = filterDepartment
    ? teachers.filter((t) => t.department === filterDepartment)
    : teachers

  const openCreate = () => {
    setEditTarget(null)
    setShowForm(true)
    setShowCsvImport(false)
  }
  const openEdit = (t: Teacher) => {
    setEditTarget(t)
    setShowForm(true)
    setShowCsvImport(false)
  }
  const closeForm = () => {
    setShowForm(false)
    setShowCsvImport(false)
    setEditTarget(null)
  }

  const handleSubmit = async (data: CreateInput<Teacher>) => {
    if (editTarget) {
      await updateTeacher(editTarget.id, data)
    } else {
      await addTeacher(data)
    }
    closeForm()
  }

  const handleCsvImport = async (items: CreateInput<Teacher>[]) => {
    for (const t of items) {
      await addTeacher(t)
    }
  }

  if (loading) return <LoadingSpinner message="教員データを読み込み中..." />

  return (
    <div className="space-y-4">
      {error && <ErrorAlert message={error.message} onDismiss={clearError} />}

      {showCsvImport ? (
        <TeacherCsvImport onImport={handleCsvImport} onClose={closeForm} />
      ) : showForm ? (
        <div className="card p-6 sm:p-8">
          <TeacherForm
            initialValues={editTarget ?? undefined}
            subjects={subjects}
            onSubmit={handleSubmit}
            onCancel={closeForm}
          />
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <select
                value={filterDepartment}
                onChange={(e) => setFilterDepartment(e.target.value as SubjectCategory | '')}
                className="input py-2 text-sm min-w-[160px]"
              >
                <option value="">すべての教科</option>
                {SUBJECT_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
              {filterDepartment && (
                <span className="text-xs text-gray-500">
                  {filteredTeachers.length}件
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setShowCsvImport(true); setShowForm(false) }}
                className="btn-secondary"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
                  <path d="M7.25 10.25a.75.75 0 0 0 1.5 0V4.56l1.97 1.97a.75.75 0 1 0 1.06-1.06l-3.25-3.25a.75.75 0 0 0-1.06 0L4.22 5.47a.75.75 0 0 0 1.06 1.06l1.97-1.97v5.69Z" />
                  <path d="M3.5 9.75a.75.75 0 0 0-1.5 0v1.5A2.75 2.75 0 0 0 4.75 14h6.5A2.75 2.75 0 0 0 14 11.25v-1.5a.75.75 0 0 0-1.5 0v1.5c0 .69-.56 1.25-1.25 1.25h-6.5c-.69 0-1.25-.56-1.25-1.25v-1.5Z" />
                </svg>
                CSV一括登録
              </button>
              <button type="button" onClick={openCreate} className="btn-primary">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
                  <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z" />
                </svg>
                教員を追加
              </button>
            </div>
          </div>
          <TeacherList
            teachers={filteredTeachers}
            subjects={subjects}
            onEdit={openEdit}
            onDelete={deleteTeacher}
          />
        </>
      )}
    </div>
  )
}

// ============================================================
// 科目管理セクション
// ============================================================

function SubjectSection() {
  const { subjects, loading, error, clearError, addSubject, updateSubject, deleteSubject } =
    useSubjects()

  const [editTarget, setEditTarget] = useState<Subject | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [showCsvImport, setShowCsvImport] = useState(false)

  const openCreate = () => {
    setEditTarget(null)
    setShowForm(true)
    setShowCsvImport(false)
  }
  const openEdit = (s: Subject) => {
    setEditTarget(s)
    setShowForm(true)
    setShowCsvImport(false)
  }
  const closeForm = () => {
    setShowForm(false)
    setShowCsvImport(false)
    setEditTarget(null)
  }

  const handleSubmit = async (data: CreateInput<Subject>) => {
    if (editTarget) {
      await updateSubject(editTarget.id, data)
    } else {
      await addSubject(data)
    }
    closeForm()
  }

  const handleCsvImport = async (subjects: CreateInput<Subject>[]) => {
    for (const s of subjects) {
      await addSubject(s)
    }
  }

  if (loading) return <LoadingSpinner message="科目データを読み込み中..." />

  return (
    <div className="space-y-4">
      {error && <ErrorAlert message={error.message} onDismiss={clearError} />}

      {showCsvImport ? (
        <SubjectCsvImport onImport={handleCsvImport} onClose={closeForm} />
      ) : showForm ? (
        <div className="card p-6 sm:p-8">
          <SubjectForm
            initialValues={editTarget ?? undefined}
            onSubmit={handleSubmit}
            onCancel={closeForm}
          />
        </div>
      ) : (
        <>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => { setShowCsvImport(true); setShowForm(false) }}
              className="btn-secondary"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
                <path d="M7.25 10.25a.75.75 0 0 0 1.5 0V4.56l1.97 1.97a.75.75 0 1 0 1.06-1.06l-3.25-3.25a.75.75 0 0 0-1.06 0L4.22 5.47a.75.75 0 0 0 1.06 1.06l1.97-1.97v5.69Z" />
                <path d="M3.5 9.75a.75.75 0 0 0-1.5 0v1.5A2.75 2.75 0 0 0 4.75 14h6.5A2.75 2.75 0 0 0 14 11.25v-1.5a.75.75 0 0 0-1.5 0v1.5c0 .69-.56 1.25-1.25 1.25h-6.5c-.69 0-1.25-.56-1.25-1.25v-1.5Z" />
              </svg>
              CSV一括登録
            </button>
            <button type="button" onClick={openCreate} className="btn-primary">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
                <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z" />
              </svg>
              科目を追加
            </button>
          </div>
          <SubjectList
            subjects={subjects}
            onEdit={openEdit}
            onDelete={deleteSubject}
          />
        </>
      )}
    </div>
  )
}

// ============================================================
// 授業割当セクション
// ============================================================

function AssignmentSection() {
  const {
    assignments,
    loading,
    error,
    clearError,
    addAssignment,
    updateAssignment,
    deleteAssignment,
  } = useAssignments()
  const { teachers } = useTeachers()
  const { subjects } = useSubjects()

  const [editTarget, setEditTarget] = useState<Assignment | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [showBulkForm, setShowBulkForm] = useState(false)

  const openCreate = () => {
    setEditTarget(null)
    setShowForm(true)
    setShowBulkForm(false)
  }
  const openBulk = () => {
    setShowBulkForm(true)
    setShowForm(false)
    setEditTarget(null)
  }
  const openEdit = (a: Assignment) => {
    setEditTarget(a)
    setShowForm(true)
    setShowBulkForm(false)
  }
  const closeForm = () => {
    setShowForm(false)
    setShowBulkForm(false)
    setEditTarget(null)
  }

  const handleSubmit = async (data: CreateInput<Assignment>) => {
    if (editTarget) {
      await updateAssignment(editTarget.id, data)
    } else {
      await addAssignment(data)
    }
    closeForm()
  }

  const handleBulkSubmit = async (inputs: CreateInput<Assignment>[]) => {
    for (const input of inputs) {
      await addAssignment(input)
    }
    closeForm()
  }

  if (loading) return <LoadingSpinner message="授業割当データを読み込み中..." />

  return (
    <div className="space-y-4">
      {error && <ErrorAlert message={error.message} onDismiss={clearError} />}

      {showBulkForm ? (
        <div className="card p-6 sm:p-8">
          <AssignmentBulkForm
            teachers={teachers}
            subjects={subjects}
            existingAssignments={assignments}
            onSubmit={handleBulkSubmit}
            onCancel={closeForm}
          />
        </div>
      ) : showForm ? (
        <div className="card p-6 sm:p-8">
          <AssignmentForm
            initialValues={editTarget ?? undefined}
            teachers={teachers}
            subjects={subjects}
            onSubmit={handleSubmit}
            onCancel={closeForm}
          />
        </div>
      ) : (
        <>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={openBulk} className="btn-secondary">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
                <path d="M7.25 10.25a.75.75 0 0 0 1.5 0V4.56l1.97 1.97a.75.75 0 1 0 1.06-1.06l-3.25-3.25a.75.75 0 0 0-1.06 0L4.22 5.47a.75.75 0 0 0 1.06 1.06l1.97-1.97v5.69Z" />
                <path d="M3.5 9.75a.75.75 0 0 0-1.5 0v1.5A2.75 2.75 0 0 0 4.75 14h6.5A2.75 2.75 0 0 0 14 11.25v-1.5a.75.75 0 0 0-1.5 0v1.5c0 .69-.56 1.25-1.25 1.25h-6.5c-.69 0-1.25-.56-1.25-1.25v-1.5Z" />
              </svg>
              一括登録
            </button>
            <button type="button" onClick={openCreate} className="btn-primary">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
                <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z" />
              </svg>
              授業割当を追加
            </button>
          </div>
          <AssignmentList
            assignments={assignments}
            teachers={teachers}
            subjects={subjects}
            onEdit={openEdit}
            onDelete={deleteAssignment}
          />
        </>
      )}
    </div>
  )
}

// ============================================================
// 時間割セクション
// ============================================================

function ScheduleTab({ classOptions, settings }: { classOptions: import('./utils/constants').ClassOption[]; settings: import('./hooks/useSettings').AppSettings }) {
  const { teachers } = useTeachers()
  const { subjects } = useSubjects()
  const { assignments } = useAssignments()

  return (
    <ScheduleViewContainer
      teachers={teachers}
      subjects={subjects}
      assignments={assignments}
      classOptions={classOptions}
      schedulerOptions={{
        maxTeacherPeriodsPerDay: settings.maxTeacherPeriodsPerDay,
        maxIterations: settings.maxIterations,
      }}
    />
  )
}

// ============================================================
// App ルートコンポーネント
// ============================================================

function App() {
  const { loading: authLoading, error: authError } = useAuth()
  const { activeTab, navigate: setActiveTab } = useHashTab()
  const { settings, updateSettings, resetSettings, DEFAULT_SETTINGS } = useSettings()
  const classOptions = buildClassOptions(settings.classesPerGrade)

  if (authLoading) {
    return <LoadingSpinner message="認証中..." />
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 認証エラー時は警告バナー（アプリ自体はブロックしない） */}
      {authError && (
        <div className="bg-yellow-50 border-b border-yellow-200 px-4 py-2 text-sm text-yellow-800">
          認証に失敗しました（Firestore への保存が制限される場合があります）。Firebase コンソールで匿名認証を有効にしてください。
        </div>
      )}

      {/* ヘッダー */}
      <header className="bg-primary-700 text-white shadow-md">
        <div className="mx-auto max-w-7xl px-4 py-4">
          <h1 className="text-xl font-bold tracking-tight">時間割作成アプリ</h1>
          <p className="mt-0.5 text-xs text-primary-200">高校向け時間割管理システム</p>
        </div>
      </header>

      {/* タブナビゲーション */}
      <nav className="border-b border-gray-200 bg-white shadow-sm" aria-label="メインナビゲーション">
        <div className="mx-auto max-w-7xl px-2 sm:px-4 overflow-x-auto">
          <div className="flex space-x-1" role="tablist">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                aria-controls={`panel-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className={[
                  'px-4 py-3.5 text-sm font-medium transition-colors border-b-2 focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus:outline-none',
                  activeTab === tab.id
                    ? 'border-primary-600 text-primary-600'
                    : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700',
                ].join(' ')}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* メインコンテンツ */}
      <main className="mx-auto max-w-7xl px-2 sm:px-4 py-4 sm:py-8" id={`panel-${activeTab}`} role="tabpanel" aria-label={TABS.find(t => t.id === activeTab)?.label}>
        {activeTab === 'teachers' && <TeacherSection />}
        {activeTab === 'subjects' && <SubjectSection />}
        {activeTab === 'assignments' && <AssignmentSection />}
        {activeTab === 'schedule' && (
          <Suspense fallback={<LoadingSpinner message="時間割モジュールを読み込み中..." />}>
            <ScheduleTab classOptions={classOptions} settings={settings} />
          </Suspense>
        )}
        {activeTab === 'settings' && (
          <Suspense fallback={<LoadingSpinner message="読み込み中..." size="sm" />}>
            <SettingsPanel
              settings={settings}
              defaults={DEFAULT_SETTINGS}
              onUpdate={updateSettings}
              onReset={resetSettings}
            />
          </Suspense>
        )}
      </main>
    </div>
  )
}

export default App
