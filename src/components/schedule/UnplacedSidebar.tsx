import type { Teacher, Subject, Assignment } from '../../types'
import type { UnplacedTask } from '../../utils/scheduler'
import { getClassLabel } from '../../utils/constants'

// ============================================================
// 型定義
// ============================================================

export interface UnplacedSidebarProps {
  unplacedTasks: UnplacedTask[]
  assignments: Assignment[]
  subjects: Subject[]
  teachers: Teacher[]
}

// ============================================================
// 未配置カード（ドラッグ可能）
// ============================================================

function UnplacedCard({
  task,
  assignment,
  subject,
  teacherNames,
}: {
  task: UnplacedTask
  assignment: Assignment | undefined
  subject: Subject | undefined
  teacherNames: string[]
}) {
  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('text/unplaced-assignment-id', task.assignmentId)
    e.dataTransfer.effectAllowed = 'move'
  }

  const borderColor = subject?.color ?? '#64748b'

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      className="rounded-lg border border-gray-200 bg-white p-3 cursor-grab active:cursor-grabbing shadow-sm hover:shadow transition-shadow"
      style={{ borderLeftWidth: 4, borderLeftColor: borderColor }}
    >
      <div className="text-sm font-semibold text-gray-800">
        {subject?.name ?? '不明な科目'}
      </div>
      <div className="mt-0.5 text-xs text-gray-500">
        {getClassLabel(task.classId)}
      </div>
      {teacherNames.length > 0 && (
        <div className="mt-0.5 text-xs text-gray-400">
          {teacherNames.join(', ')}
        </div>
      )}
      {assignment && assignment.teacherIds.length > 1 && (
        <span className="badge bg-purple-100 text-purple-700 mt-1">TT</span>
      )}
      <div className="mt-1.5 text-[10px] text-red-400 leading-tight">
        {task.reason}
      </div>
    </div>
  )
}

// ============================================================
// UnplacedSidebar
// ============================================================

export function UnplacedSidebar({
  unplacedTasks,
  assignments,
  subjects,
  teachers,
}: UnplacedSidebarProps) {
  const assignmentMap = new Map(assignments.map((a) => [a.id, a]))
  const subjectMap = new Map(subjects.map((s) => [s.id, s]))
  const teacherMap = new Map(teachers.map((t) => [t.id, t]))

  if (unplacedTasks.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-green-300 bg-green-50 p-4 text-center">
        <div className="text-sm font-medium text-green-700">
          全ての授業が配置済みです
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="section-heading mb-0">
          未配置の授業
        </h3>
        <span className="badge bg-red-100 text-red-700">
          {unplacedTasks.length}件
        </span>
      </div>
      <p className="text-xs text-gray-400">
        ドラッグして空きコマに配置できます
      </p>
      <div className="space-y-2 max-h-[calc(100vh-280px)] overflow-y-auto pr-1">
        {unplacedTasks.map((task) => {
          const assignment = assignmentMap.get(task.assignmentId)
          const subject = subjectMap.get(task.subjectId)
          const teacherNames = assignment
            ? assignment.teacherIds.map((id) => teacherMap.get(id)?.name ?? '?')
            : []

          return (
            <UnplacedCard
              key={`${task.assignmentId}-${task.classId}`}
              task={task}
              assignment={assignment}
              subject={subject}
              teacherNames={teacherNames}
            />
          )
        })}
      </div>
    </div>
  )
}
