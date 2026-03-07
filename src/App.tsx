import { useState } from 'react'
import type { Teacher, Subject, Assignment, CreateInput } from './types'

import { useAuth } from './hooks/useAuth'
import { useTeachers } from './hooks/useTeachers'
import { useSubjects } from './hooks/useSubjects'
import { useAssignments } from './hooks/useAssignments'

import { LoadingSpinner } from './components/common/LoadingSpinner'
import { ErrorAlert } from './components/common/ErrorAlert'

import { TeacherForm } from './components/teacher/TeacherForm'
import { TeacherList } from './components/teacher/TeacherList'

import { SubjectForm } from './components/subject/SubjectForm'
import { SubjectList } from './components/subject/SubjectList'
import { SubjectCsvImport } from './components/subject/SubjectCsvImport'

import { AssignmentForm } from './components/assignment/AssignmentForm'
import { AssignmentList } from './components/assignment/AssignmentList'

import { ScheduleViewContainer } from './components/schedule/ScheduleViewContainer'

// ============================================================
// タブ定義
// ============================================================

type Tab = 'schedule' | 'teachers' | 'subjects' | 'assignments'

const TABS: { id: Tab; label: string }[] = [
  { id: 'teachers', label: '教員管理' },
  { id: 'subjects', label: '科目管理' },
  { id: 'assignments', label: '授業割当' },
  { id: 'schedule', label: '時間割' },
]

// ============================================================
// 教員管理セクション
// ============================================================

function TeacherSection() {
  const { teachers, loading, error, clearError, addTeacher, updateTeacher, deleteTeacher } =
    useTeachers()
  const { subjects } = useSubjects()

  const [editTarget, setEditTarget] = useState<Teacher | null>(null)
  const [showForm, setShowForm] = useState(false)

  const openCreate = () => {
    setEditTarget(null)
    setShowForm(true)
  }
  const openEdit = (t: Teacher) => {
    setEditTarget(t)
    setShowForm(true)
  }
  const closeForm = () => {
    setShowForm(false)
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

  if (loading) return <LoadingSpinner message="教員データを読み込み中..." />

  return (
    <div className="space-y-4">
      {error && <ErrorAlert message={error.message} onDismiss={clearError} />}

      {showForm ? (
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
          <div className="flex justify-end">
            <button type="button" onClick={openCreate} className="btn-primary">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
                <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z" />
              </svg>
              教員を追加
            </button>
          </div>
          <TeacherList
            teachers={teachers}
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

  const openCreate = () => {
    setEditTarget(null)
    setShowForm(true)
  }
  const openEdit = (a: Assignment) => {
    setEditTarget(a)
    setShowForm(true)
  }
  const closeForm = () => {
    setShowForm(false)
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

  if (loading) return <LoadingSpinner message="授業割当データを読み込み中..." />

  return (
    <div className="space-y-4">
      {error && <ErrorAlert message={error.message} onDismiss={clearError} />}

      {showForm ? (
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
          <div className="flex justify-end">
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

function ScheduleSection() {
  const { teachers } = useTeachers()
  const { subjects } = useSubjects()
  const { assignments } = useAssignments()

  return (
    <ScheduleViewContainer
      teachers={teachers}
      subjects={subjects}
      assignments={assignments}
    />
  )
}

// ============================================================
// App ルートコンポーネント
// ============================================================

function App() {
  const { loading: authLoading, error: authError } = useAuth()
  const [activeTab, setActiveTab] = useState<Tab>('teachers')

  if (authLoading) {
    return <LoadingSpinner message="認証中..." />
  }

  if (authError) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <ErrorAlert message={`認証エラー: ${authError.message}`} />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ヘッダー */}
      <header className="bg-primary-700 text-white shadow-md">
        <div className="mx-auto max-w-7xl px-4 py-4">
          <h1 className="text-xl font-bold tracking-tight">時間割作成アプリ</h1>
          <p className="mt-0.5 text-xs text-primary-200">高校向け時間割管理システム</p>
        </div>
      </header>

      {/* タブナビゲーション */}
      <nav className="border-b border-gray-200 bg-white shadow-sm">
        <div className="mx-auto max-w-7xl px-4">
          <div className="flex space-x-1">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={[
                  'px-4 py-3.5 text-sm font-medium transition-colors border-b-2',
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
      <main className="mx-auto max-w-7xl px-4 py-8">
        {activeTab === 'teachers' && <TeacherSection />}
        {activeTab === 'subjects' && <SubjectSection />}
        {activeTab === 'assignments' && <AssignmentSection />}
        {activeTab === 'schedule' && <ScheduleSection />}
      </main>
    </div>
  )
}

export default App
