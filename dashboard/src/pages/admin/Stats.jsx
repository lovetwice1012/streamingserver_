import { useQuery } from '@tanstack/react-query';
import { Users, Database, HardDrive, Activity } from 'lucide-react';
import api from '../../lib/api';

export default function AdminStats() {
  const { data: stats, isLoading, error } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: async () => {
      const res = await api.get('/admin/stats');
      console.log('Stats API Response:', res.data);
      return res.data.success ? res.data.stats : res.data;
    }
  });

  const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">読み込み中...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-600">エラーが発生しました</p>
          <p className="text-sm text-red-500 mt-2">{error.message}</p>
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="p-6">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-yellow-600">統計データがありません</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">システム統計</h1>

      {/* サマリーカード */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <Users className="h-8 w-8 text-blue-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">総ユーザー数</p>
              <p className="text-2xl font-semibold text-gray-900">
                {stats.totalUsers || 0}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <Activity className="h-8 w-8 text-green-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">アクティブユーザー</p>
              <p className="text-2xl font-semibold text-gray-900">
                {stats.activeUsers || 0}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <Database className="h-8 w-8 text-purple-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">録画使用量</p>
              <p className="text-2xl font-semibold text-gray-900">
                {stats.storage ? formatBytes(stats.storage.totalRecordingUsed) : '0 B'}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <HardDrive className="h-8 w-8 text-orange-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">配信使用量</p>
              <p className="text-2xl font-semibold text-gray-900">
                {stats.storage ? formatBytes(stats.storage.totalStreamingUsed) : '0 B'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* プラン別ユーザー数 */}
      <div className="bg-white rounded-lg shadow mb-8">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">プラン別ユーザー数</h2>
        </div>
        <div className="p-6">
          <div className="space-y-4">
            {stats.usersByPlan && stats.usersByPlan.length > 0 ? (
              stats.usersByPlan.map((item) => (
                <div key={item.plan} className="flex items-center justify-between">
                  <div className="flex items-center">
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                      {item.plan}
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-2xl font-semibold text-gray-900">
                      {item.count}
                    </span>
                    <span className="text-sm text-gray-500">ユーザー</span>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-gray-500">データがありません</p>
            )}
          </div>
        </div>
      </div>

      {/* ロール別ユーザー数 */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">ロール別ユーザー数</h2>
        </div>
        <div className="p-6">
          <div className="space-y-4">
            {stats.usersByRole && stats.usersByRole.length > 0 ? (
              stats.usersByRole.map((item) => (
                <div key={item.role} className="flex items-center justify-between">
                  <div className="flex items-center">
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                      item.role === 'admin' 
                        ? 'bg-red-100 text-red-800' 
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      {item.role === 'admin' ? '管理者' : 'ユーザー'}
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-2xl font-semibold text-gray-900">
                      {item.count}
                    </span>
                    <span className="text-sm text-gray-500">人</span>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-gray-500">データがありません</p>
            )}
          </div>
        </div>
      </div>

      {/* ストレージ詳細 */}
      {stats.storage && (
        <div className="mt-8 bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">ストレージ詳細</h2>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <p className="text-sm font-medium text-gray-500 mb-2">録画ストレージ</p>
                <p className="text-3xl font-bold text-gray-900">
                  {stats.storage.totalRecordingUsedGB} GB
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  使用中: {formatBytes(stats.storage.totalRecordingUsed)}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500 mb-2">配信データ</p>
                <p className="text-3xl font-bold text-gray-900">
                  {stats.storage.totalStreamingUsedGB} GB
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  使用中: {formatBytes(stats.storage.totalStreamingUsed)}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
