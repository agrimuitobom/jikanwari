import { useState } from 'react'

function App() {
  const [activeTab, setActiveTab] = useState<'schedule' | 'teachers' | 'subjects'>('schedule')

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-primary-700 text-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold">時間割作成アプリ</h1>
          <p className="text-primary-100 text-sm mt-1">高校向け時間割管理システム</p>
        </div>
      </header>

      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex space-x-8">
            {(['schedule', 'teachers', 'subjects'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`py-4 px-2 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === tab
                    ? 'border-primary-600 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab === 'schedule' ? '時間割' : tab === 'teachers' ? '教員管理' : '科目管理'}
              </button>
            ))}
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-gray-500 text-center py-12">
            {activeTab === 'schedule' && '時間割ビューがここに表示されます'}
            {activeTab === 'teachers' && '教員管理画面がここに表示されます'}
            {activeTab === 'subjects' && '科目管理画面がここに表示されます'}
          </p>
        </div>
      </main>
    </div>
  )
}

export default App
