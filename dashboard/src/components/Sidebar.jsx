import { Link, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Video, 
  Gauge, 
  Users, 
  Activity, 
  Database,
  BarChart3,
  Radio,
  CreditCard,
  Settings as SettingsIcon
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';

export default function Sidebar() {
  const location = useLocation();
  const user = useAuthStore((state) => state.user);
  const isAdmin = user?.role === 'admin';

  const navItems = [
    { to: '/dashboard', icon: LayoutDashboard, label: 'ダッシュボード' },
    { to: '/recordings', icon: Video, label: '録画' },
    { to: '/quota', icon: Gauge, label: 'クォータ' },
    { to: '/plans', icon: CreditCard, label: 'プラン' },
    { to: '/settings', icon: SettingsIcon, label: '設定' },
  ];

  const adminNavItems = [
    { to: '/admin/stats', icon: BarChart3, label: '統計' },
    { to: '/admin/users', icon: Users, label: 'ユーザー管理' },
    { to: '/admin/sessions', icon: Activity, label: '配信セッション' },
    { to: '/admin/recordings', icon: Database, label: '全録画' },
    { to: '/admin/plans', icon: SettingsIcon, label: 'プラン管理' },
  ];

  return (
    <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <Radio className="w-8 h-8 text-primary-600" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">Streaming</h1>
            <p className="text-xs text-gray-500">Dashboard</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.to;
          
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                isActive
                  ? 'bg-primary-50 text-primary-700 font-medium'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span>{item.label}</span>
            </Link>
          );
        })}

        {isAdmin && (
          <>
            <div className="pt-4 pb-2 px-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                管理者
              </p>
            </div>
            {adminNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.to;
              
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                    isActive
                      ? 'bg-primary-50 text-primary-700 font-medium'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </>
        )}
      </nav>

      <div className="p-4 border-t border-gray-200">
        <div className="flex items-center gap-3 px-2">
          <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center">
            <span className="text-primary-700 font-semibold">
              {user?.username?.charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">
              {user?.username}
            </p>
            <p className="text-xs text-gray-500">
              {isAdmin ? '管理者' : 'ユーザー'}
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}
