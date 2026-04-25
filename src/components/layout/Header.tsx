import { Button } from '@/components/ui/Button';

export function Header() {
  return (
    <header className="bg-white/90 backdrop-blur-sm border-b border-gray-200 shadow-sm sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center">
            <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl flex items-center justify-center mr-3 shadow-lg">
              <span className="text-white font-bold text-xl">六</span>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 font-classic bg-gradient-to-r from-amber-600 to-orange-600 bg-clip-text text-transparent">
                六经注我
              </h1>
              <p className="text-xs text-gray-600 font-medium">AI智能经典注释 · 知识图谱探索</p>
            </div>
          </div>

          {/* Center Section - Navigation */}
          <nav className="hidden lg:flex items-center space-x-8">
            <a href="#" className="text-gray-700 hover:text-primary-600 font-medium transition-colors">
              探索经典
            </a>
            <a href="#" className="text-gray-700 hover:text-primary-600 font-medium transition-colors">
              知识图谱
            </a>
            <a href="#" className="text-gray-700 hover:text-primary-600 font-medium transition-colors">
              学习路径
            </a>
            <a href="#" className="text-gray-700 hover:text-primary-600 font-medium transition-colors">
              我的笔记
            </a>
          </nav>

          {/* Right Section */}
          <div className="flex items-center space-x-3">
            {/* Theme Toggle */}
            <Button variant="ghost" size="sm" className="hidden sm:flex">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            </Button>

            {/* Wiki Explorer */}
            <Button variant="outline" size="sm" className="hidden sm:flex">
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              无限探索
            </Button>

            {/* User Avatar */}
            <div className="relative">
              <Button variant="ghost" size="sm" className="w-9 h-9 p-0">
                <div className="w-full h-full bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                  <span className="text-white text-sm font-medium">学</span>
                </div>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
