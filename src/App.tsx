import { useState } from 'react'
import type { Teacher, Subject, Assignment, CreateInput } from './types'

import { useTeachers } from './hooks/useTeachers'
import { useSubjects } from './hooks/useSubjects'
import { useAssignments } from './hooks/useAssignments'

import { LoadingSpinner } from './components/common/LoadingSpinner'
import { ErrorAlert } from './components/common/ErrorAlert'

import { TeacherForm } from './components/teacher/TeacherForm'
import { TeacherList } from './components/teacher/TeacherList'

import { SubjectForm } from './components/subject/SubjectForm'
import { SubjectList } from './components/subject/SubjectList'

import { AssignmentForm } from './components/assignment/AssignmentForm'
import { AssignmentList } from './components/assignment/AssignmentList'

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

  const openCreate = () => {
    setEditTarget(null)
    setShowForm(true)
  }
  const openEdit = (s: Subject) => {
    setEditTarget(s)
    setShowForm(true)
  }
  const closeForm = () => {
    setShowForm(false)
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

  if (loading) return <LoadingSpinner message="科目データを読み込み中..." />

  return (
    <div className="space-y-4">
      {error && <ErrorAlert message={error.message} onDismiss={clearError} />}

      {showForm ? (
        <div className="card p-6 sm:p-8">
          <SubjectForm
            initialValues={editTarget ?? undefined}
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
// 時間割プレースホルダー
// ============================================================

function ScheduleSection() {
  return (
    <div className="card flex flex-col items-center gap-3 py-24 text-gray-400">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
        className="h-16 w-16 text-gray-200"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0112 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125h7.5c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125h-7.5zm8.625 1.125c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v6.75c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-6.75z"
        />
      </svg>
      <p className="text-base font-medium">時間割ビュー</p>
      <p className="text-sm">教員・科目・授業割当を登録後、自動生成機能が利用可能になります</p>
    </div>
  )
}

// ============================================================
// App ルートコンポーネント
// ============================================================

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('teachers')

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
