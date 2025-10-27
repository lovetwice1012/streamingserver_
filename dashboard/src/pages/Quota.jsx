import { useQuery } from '@tanstack/react-query';
import { Gauge, TrendingUp, HardDrive, Calendar } from 'lucide-react';
import api from '../lib/api';

export default function Quota() {
  const { data: quota } = useQuery({
    queryKey: ['quota'],
    queryFn: async () => {
      const res = await api.get('/quota');
      return res.data;
    }
  });

  const formatBytes = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getProgressColor = (percent) => {
    if (percent >= 90) return 'bg-red-500';
    if (percent >= 70) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">クォータ管理</h1>
        <p className="text-gray-600 mt-1">使用状況とクォータ制限</p>
      </div>

      {/* Recording Quota */}
      <div className="card">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">録画クォータ</h2>
            <p className="text-gray-600 mt-1">録画ファイルの保存容量</p>
          </div>
          <div className="p-4 bg-purple-100 rounded-xl">
            <HardDrive className="w-8 h-8 text-purple-600" />
          </div>
        </div>

        <div className="space-y-6">
          <div>
            <div className="flex justify-between items-end mb-3">
              <div>
                <p className="text-4xl font-bold text-gray-900">
                  {quota?.recording.usedGB.toFixed(2) || 0}
                  <span className="text-xl text-gray-500 ml-2">GB</span>
                </p>
                <p className="text-gray-600 mt-1">
                  使用中 / {quota?.recording.limitGB || 1} GB
                </p>
              </div>
              <div className={`badge ${
                parseFloat(quota?.recording.percentUsed) >= 90 ? 'badge-danger' :
                parseFloat(quota?.recording.percentUsed) >= 70 ? 'badge-warning' :
                'badge-success'
              }`}>
                {quota?.recording.percentUsed || 0}% 使用中
              </div>
            </div>

            <div className="w-full h-4 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={`h-full ${getProgressColor(parseFloat(quota?.recording.percentUsed || 0))} transition-all duration-500`}
                style={{ width: `${quota?.recording.percentUsed || 0}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-4 border-t">
            <div>
              <p className="text-sm text-gray-600 mb-1">使用量</p>
              <p className="text-xl font-semibold text-gray-900">
                {formatBytes(Number(quota?.recording.used || 0))}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600 mb-1">残り容量</p>
              <p className="text-xl font-semibold text-gray-900">
                {formatBytes(Number(quota?.recording.limit || 0) - Number(quota?.recording.used || 0))}
              </p>
            </div>
          </div>

          {parseFloat(quota?.recording.percentUsed) >= 80 && (
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm text-yellow-800 font-medium">
                ⚠️ 録画容量が80%を超えています。容量を超えると古い録画から自動削除されます。
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Streaming Quota */}
      <div className="card">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">配信クォータ（月間）</h2>
            <p className="text-gray-600 mt-1">月間のデータ転送量</p>
          </div>
          <div className="p-4 bg-green-100 rounded-xl">
            <TrendingUp className="w-8 h-8 text-green-600" />
          </div>
        </div>

        <div className="space-y-6">
          <div>
            <div className="flex justify-between items-end mb-3">
              <div>
                <p className="text-4xl font-bold text-gray-900">
                  {quota?.streaming.usedGB.toFixed(2) || 0}
                  <span className="text-xl text-gray-500 ml-2">GB</span>
                </p>
                <p className="text-gray-600 mt-1">
                  使用中 / {quota?.streaming.limitGB || 100} GB
                </p>
              </div>
              <div className={`badge ${
                parseFloat(quota?.streaming.percentUsed) >= 90 ? 'badge-danger' :
                parseFloat(quota?.streaming.percentUsed) >= 70 ? 'badge-warning' :
                'badge-success'
              }`}>
                {quota?.streaming.percentUsed || 0}% 使用中
              </div>
            </div>

            <div className="w-full h-4 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={`h-full ${getProgressColor(parseFloat(quota?.streaming.percentUsed || 0))} transition-all duration-500`}
                style={{ width: `${quota?.streaming.percentUsed || 0}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 pt-4 border-t">
            <div>
              <p className="text-sm text-gray-600 mb-1">使用量</p>
              <p className="text-xl font-semibold text-gray-900">
                {formatBytes(Number(quota?.streaming.used || 0))}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600 mb-1">残り容量</p>
              <p className="text-xl font-semibold text-gray-900">
                {formatBytes(Number(quota?.streaming.limit || 0) - Number(quota?.streaming.used || 0))}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600 mb-1">リセット日</p>
              <p className="text-xl font-semibold text-gray-900">
                {quota?.streaming.resetAt ? new Date(quota.streaming.resetAt).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' }) : '-'}
              </p>
            </div>
          </div>

          {parseFloat(quota?.streaming.percentUsed) >= 80 && (
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm text-yellow-800 font-medium">
                ⚠️ 配信クォータが80%を超えています。100%に達すると配信が自動停止されます。
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Info Card */}
      <div className="card bg-blue-50 border-blue-200">
        <div className="flex gap-4">
          <div className="p-3 bg-blue-100 rounded-xl flex-shrink-0">
            <Calendar className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 mb-2">クォータについて</h3>
            <ul className="space-y-1 text-sm text-gray-700">
              <li>• 録画クォータ: 録画ファイルの合計容量の上限です</li>
              <li>• 配信クォータ: 毎月1日にリセットされる配信データ量の上限です</li>
              <li>• 録画容量超過: 自動的に古い録画から削除されます</li>
              <li>• 配信容量超過: 配信が自動的に停止されます</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
