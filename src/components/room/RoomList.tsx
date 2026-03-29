import { useState, useMemo } from 'react'
import type { Room, Assignment } from '../../types'
import { DAY_LABELS, DAYS } from '../../utils/constants'

interface RoomListProps {
  rooms: Room[]
  assignments: Assignment[]
  onEdit: (room: Room) => void
  onDelete: (id: string) => void
}

export function RoomList({ rooms, assignments, onEdit, onDelete }: RoomListProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // 種別順 → 名前順にソート
  const sorted = useMemo(() => {
    return [...rooms].sort((a, b) => {
      const catA = a.category ?? ''
      const catB = b.category ?? ''
      if (catA !== catB) return catA.localeCompare(catB, 'ja')
      return a.name.localeCompare(b.name, 'ja')
    })
  }, [rooms])

  const handleDeleteConfirm = async (id: string) => {
    await onDelete(id)
    setDeletingId(null)
  }

  if (rooms.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-gray-400">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          className="h-12 w-12 text-gray-300"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 0h.008v.008h-.008V7.5Z"
          />
        </svg>
        <p className="text-sm">教室・施設が登録されていません</p>
      </div>
    )
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {sorted.map((room) => {
        const isDeleting = deletingId === room.id
        const usedCount = assignments.filter((a) => a.roomId === room.id).length
        const allDays: typeof DAYS[number][] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']
        const availDays = room.availableDays ?? allDays

        return (
          <div key={room.id} className="card flex flex-col gap-4 p-5">
            {/* 名前・種別 */}
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-base font-semibold text-gray-900">{room.name}</p>
                  {room.category && (
                    <span className="badge bg-gray-100 text-gray-600 text-xs">
                      {room.category}
                    </span>
                  )}
                </div>
                {room.memo && (
                  <p className="mt-0.5 line-clamp-1 text-xs text-gray-400">{room.memo}</p>
                )}
              </div>
              {/* アクションボタン */}
              <div className="flex shrink-0 gap-1">
                <button
                  type="button"
                  onClick={() => onEdit(room)}
                  className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                  title="編集"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
                    <path d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L6.75 6.774a2.75 2.75 0 0 0-.596.892l-.79 2.291a.75.75 0 0 0 .918.968l2.332-.737a2.75 2.75 0 0 0 .915-.586l4.263-4.263a1.75 1.75 0 0 0 0-2.475Z" />
                    <path d="M4.75 3.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h6.5c.69 0 1.25-.56 1.25-1.25V9a.75.75 0 0 1 1.5 0v2.25A2.75 2.75 0 0 1 11.25 14h-6.5A2.75 2.75 0 0 1 2 11.25v-6.5A2.75 2.75 0 0 1 4.75 2H7a.75.75 0 0 1 0 1.5H4.75Z" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => setDeletingId(room.id)}
                  className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500"
                  title="削除"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
                    <path
                      fillRule="evenodd"
                      d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5ZM6.05 6a.75.75 0 0 1 .787.713l.275 5.5a.75.75 0 0 1-1.498.075l-.275-5.5A.75.75 0 0 1 6.05 6Zm3.9 0a.75.75 0 0 1 .712.787l-.275 5.5a.75.75 0 0 1-1.498-.075l.275-5.5a.75.75 0 0 1 .786-.711Z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              </div>
            </div>

            {/* 利用可能日 */}
            <div>
              <p className="mb-1.5 text-xs font-medium text-gray-500">利用可能日</p>
              <div className="flex gap-1.5">
                {DAYS.map((day) => {
                  const available = availDays.includes(day)
                  return (
                    <span
                      key={day}
                      className={[
                        'flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold',
                        available
                          ? 'bg-primary-100 text-primary-700'
                          : 'bg-gray-100 text-gray-300',
                      ].join(' ')}
                    >
                      {DAY_LABELS[day]}
                    </span>
                  )
                })}
                {(room.excludedSlots?.length ?? 0) > 0 && (
                  <span className="ml-1 self-center text-xs text-red-400">
                    （{room.excludedSlots!.length}コマ除外）
                  </span>
                )}
              </div>
            </div>

            {/* 使用中の授業数 */}
            {usedCount > 0 && (
              <p className="text-xs text-gray-500">
                {usedCount}件の授業割当で使用中
              </p>
            )}

            {/* 削除確認 */}
            {isDeleting && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                <p className="mb-1 text-xs font-medium text-red-700">
                  「{room.name}」を削除しますか？
                </p>
                {usedCount > 0 && (
                  <p className="mb-2 text-[11px] text-red-600">
                    この施設を使用している授業割当が{usedCount}件あります。
                  </p>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setDeletingId(null)}
                    className="btn-secondary flex-1 py-1 text-xs"
                  >
                    キャンセル
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteConfirm(room.id)}
                    className="btn-danger flex-1 py-1 text-xs"
                  >
                    削除する
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
