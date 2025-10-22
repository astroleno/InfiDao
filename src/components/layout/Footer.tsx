export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-white border-t border-gray-200 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand Section */}
          <div className="col-span-1 md:col-span-2">
            <div className="flex items-center mb-4">
              <div className="w-8 h-8 bg-gradient-to-br from-amber-500 to-orange-600 rounded-lg flex items-center justify-center mr-3">
                <span className="text-white font-bold">六</span>
              </div>
              <h3 className="text-lg font-bold text-gray-900 font-classic">六经注我</h3>
            </div>
            <p className="text-gray-600 text-sm mb-4 max-w-md">
              融合人工智能与传统文化，打造沉浸式的经典学习体验。通过智能注释和知识图谱，
              让千年智慧在数字时代焕发新的生机。
            </p>
            <div className="flex items-center space-x-4">
              <a href="#" className="text-gray-400 hover:text-gray-600 transition-colors">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.164 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.604-3.369-1.341-3.369-1.341-.454-1.155-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.161 22 16.416 22 12c0-5.523-4.477-10-10-10z"/>
                </svg>
              </a>
              <a href="#" className="text-gray-400 hover:text-gray-600 transition-colors">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M23 3a10.9 10.9 0 01-3.14 1.53 4.48 4.48 0 00-7.86 3v1A10.66 10.66 0 013 4s-4 9 5 13a11.64 11.64 0 01-7 2c9 5 20 0 20-11.5a4.5 4.5 0 00-.08-.83A7.72 7.72 0 0023 3z"/>
                </svg>
              </a>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="text-sm font-semibold text-gray-900 mb-4">快速链接</h4>
            <ul className="space-y-2">
              <li>
                <a href="#" className="text-sm text-gray-600 hover:text-primary-600 transition-colors">
                  使用指南
                </a>
              </li>
              <li>
                <a href="#" className="text-sm text-gray-600 hover:text-primary-600 transition-colors">
                  经典典籍
                </a>
              </li>
              <li>
                <a href="#" className="text-sm text-gray-600 hover:text-primary-600 transition-colors">
                  学习社区
                </a>
              </li>
              <li>
                <a href="#" className="text-sm text-gray-600 hover:text-primary-600 transition-colors">
                  研究论文
                </a>
              </li>
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h4 className="text-sm font-semibold text-gray-900 mb-4">资源</h4>
            <ul className="space-y-2">
              <li>
                <a href="#" className="text-sm text-gray-600 hover:text-primary-600 transition-colors">
                  开发文档
                </a>
              </li>
              <li>
                <a href="#" className="text-sm text-gray-600 hover:text-primary-600 transition-colors">
                  API 接口
                </a>
              </li>
              <li>
                <a href="#" className="text-sm text-gray-600 hover:text-primary-600 transition-colors">
                  数据来源
                </a>
              </li>
              <li>
                <a href="#" className="text-sm text-gray-600 hover:text-primary-600 transition-colors">
                  联系我们
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-8 pt-8 border-t border-gray-200">
          <div className="flex flex-col md:flex-row items-center justify-between">
            <p className="text-sm text-gray-500">
              © {currentYear} 六经注我. 保留所有权利.
            </p>
            <div className="flex items-center space-x-6 mt-4 md:mt-0">
              <a href="#" className="text-sm text-gray-500 hover:text-gray-700 transition-colors">
                隐私政策
              </a>
              <a href="#" className="text-sm text-gray-500 hover:text-gray-700 transition-colors">
                使用条款
              </a>
              <a href="#" className="text-sm text-gray-500 hover:text-gray-700 transition-colors">
                Cookie 设置
              </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}