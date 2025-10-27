import { useQuery } from '@tanstack/react-query';
import { Activity, Video, HardDrive, TrendingUp, Copy, Check } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import api from '../lib/api';
import { useState } from 'react';
import toast from 'react-hot-toast';

export default function Dashboard() {
  const user = useAuthStore((state) => state.user);
  const [copied, setCopied] = useState(false);

  const { data: quota } = useQuery({
    queryKey: ['quota'],
    queryFn: async () => {
      const res = await api.get('/quota');
      return res.data;
    }
  });

  const { data: recordings } = useQuery({
    queryKey: ['recordings'],
    queryFn: async () => {
      const res = await api.get('/recordings');
      return res.data;
    }
  });

  const copyStreamKey = () => {
    navigator.clipboard.writeText(user.streamKey);
    setCopied(true);
    toast.success('ストリームキーをコピーしました');
    setTimeout(() => setCopied(false), 2000);
  };

  const formatBytes = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">ダッシュボード</h1>
        <p className="text-gray-600 mt-1">配信と録画の概要</p>
      </div>

      {/* Stream Key Card */}
      <div className="card bg-gradient-to-br from-primary-500 to-primary-700 text-white">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-primary-100 text-sm font-medium mb-2">ストリームキー</p>
            <div className="flex items-center gap-3">
              <code className="text-lg font-mono bg-white/20 px-4 py-2 rounded-lg">
                {user?.streamKey}
              </code>
              <button
                onClick={copyStreamKey}
                className="p-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
              >
                {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
              </button>
            </div>
            <p className="text-primary-100 text-sm mt-3">
              RTMP URL: <code className="bg-white/20 px-2 py-1 rounded">rtmp://your-server:1935/live</code>
            </p>
          </div>
          <Activity className="w-12 h-12 opacity-50" />
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-gray-600 text-sm font-medium mb-1">録画数</p>
              <p className="text-3xl font-bold text-gray-900">
                {recordings?.length || 0}
              </p>
            </div>
            <div className="p-3 bg-blue-100 rounded-xl">
              <Video className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-gray-600 text-sm font-medium mb-1">録画使用量</p>
              <p className="text-3xl font-bold text-gray-900">
                {quota?.recording.usedGB.toFixed(2) || 0} GB
              </p>
              <p className="text-sm text-gray-500 mt-1">
                / {quota?.recording.limitGB || 1} GB
              </p>
            </div>
            <div className="p-3 bg-purple-100 rounded-xl">
              <HardDrive className="w-6 h-6 text-purple-600" />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-gray-600 text-sm font-medium mb-1">配信使用量</p>
              <p className="text-3xl font-bold text-gray-900">
                {quota?.streaming.usedGB.toFixed(2) || 0} GB
              </p>
              <p className="text-sm text-gray-500 mt-1">
                / {quota?.streaming.limitGB || 100} GB
              </p>
            </div>
            <div className="p-3 bg-green-100 rounded-xl">
              <TrendingUp className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Quota Progress */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="text-lg font-semibold mb-4">録画クォータ</h3>
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-gray-600">使用状況</span>
                <span className="font-medium">{quota?.recording.percentUsed || 0}%</span>
              </div>
              <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-purple-500 to-purple-600 transition-all duration-500"
                  style={{ width: `${quota?.recording.percentUsed || 0}%` }}
                />
              </div>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">使用量</span>
              <span className="font-medium">{formatBytes(Number(quota?.recording.used || 0))}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">上限</span>
              <span className="font-medium">{formatBytes(Number(quota?.recording.limit || 0))}</span>
            </div>
          </div>
        </div>

        <div className="card">
          <h3 className="text-lg font-semibold mb-4">配信クォータ（月間）</h3>
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-gray-600">使用状況</span>
                <span className="font-medium">{quota?.streaming.percentUsed || 0}%</span>
              </div>
              <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-green-500 to-green-600 transition-all duration-500"
                  style={{ width: `${quota?.streaming.percentUsed || 0}%` }}
                />
              </div>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">使用量</span>
              <span className="font-medium">{formatBytes(Number(quota?.streaming.used || 0))}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">上限</span>
              <span className="font-medium">{formatBytes(Number(quota?.streaming.limit || 0))}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">リセット日</span>
              <span className="font-medium">
                {quota?.streaming.resetAt ? new Date(quota.streaming.resetAt).toLocaleDateString('ja-JP') : '-'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Recordings */}
      <div className="card">
        <h3 className="text-lg font-semibold mb-4">最近の録画</h3>
        {recordings && recordings.length > 0 ? (
          <div className="space-y-3">
            {recordings.slice(0, 5).map((recording) => (
              <div key={recording.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Video className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{recording.filename}</p>
                    <p className="text-sm text-gray-500">
                      {new Date(recording.createdAt).toLocaleString('ja-JP')}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-gray-900">
                    {formatBytes(Number(recording.sizeBytes))}
                  </p>
                  <p className="text-sm text-gray-500">
                    {Math.floor(recording.duration / 60)}分{recording.duration % 60}秒
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <Video className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-600">まだ録画がありません</p>
            <p className="text-sm text-gray-500 mt-1">配信を開始すると自動的に録画されます</p>
          </div>
        )}
      </div>
    </div>
  );
}
