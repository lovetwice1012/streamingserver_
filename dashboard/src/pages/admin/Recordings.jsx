import { useQuery } from '@tanstack/react-query';
import { Video, User, Play } from 'lucide-react';
import api from '../../lib/api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

const getApiBaseUrl = () => {
  const base = import.meta.env.VITE_API_URL || '/api';
  return base.endsWith('/') ? base.slice(0, -1) : base;
};

export default function AdminRecordings() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-recordings'],
    queryFn: async () => {
      const res = await api.get('/admin/recordings');
      return res.data;
    }
  });
  const recordings = Array.isArray(data)
    ? data
    : Array.isArray(data?.recordings)
      ? data.recordings
      : [];

  const formatBytes = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDuration = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  const handlePlay = (recording) => {
    const token = localStorage.getItem('token');
    if (!token) {
      toast.error('認証情報が見つかりません');
      return;
    }

    const playbackUrl = `${getApiBaseUrl()}/admin/recordings/${recording.id}/play?token=${encodeURIComponent(token)}`;
    window.open(playbackUrl, '_blank', 'noopener');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-600">読み込み中...</div>
      </div>
    );
  }

  const totalSize = recordings.reduce((acc, r) => acc + Number(r.sizeBytes), 0);
  const totalDuration = recordings.reduce((acc, r) => acc + r.duration, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">全録画一覧</h1>
          <p className="text-gray-600 mt-1">システム全体の録画管理</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card">
          <p className="text-gray-600 text-sm font-medium mb-1">総録画数</p>
          <p className="text-3xl font-bold text-gray-900">{recordings.length}</p>
        </div>
        <div className="card">
          <p className="text-gray-600 text-sm font-medium mb-1">総容量</p>
          <p className="text-3xl font-bold text-gray-900">{formatBytes(totalSize)}</p>
        </div>
        <div className="card">
          <p className="text-gray-600 text-sm font-medium mb-1">総再生時間</p>
          <p className="text-3xl font-bold text-gray-900">{formatDuration(totalDuration)}</p>
        </div>
      </div>

      {/* Recordings Table */}
      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-3 px-4 font-semibold text-gray-700">ユーザー</th>
              <th className="text-left py-3 px-4 font-semibold text-gray-700">ファイル名</th>
              <th className="text-left py-3 px-4 font-semibold text-gray-700">作成日時</th>
              <th className="text-left py-3 px-4 font-semibold text-gray-700">時間</th>
              <th className="text-left py-3 px-4 font-semibold text-gray-700">サイズ</th>
              <th className="text-right py-3 px-4 font-semibold text-gray-700">操作</th>
            </tr>
          </thead>
          <tbody>
            {recordings.map((recording) => (
              <tr key={recording.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-4 px-4">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-gray-400" />
                    <span className="font-medium text-gray-900">{recording.user.username}</span>
                  </div>
                </td>
                <td className="py-4 px-4">
                  <div className="flex items-center gap-2">
                    <Video className="w-4 h-4 text-blue-600" />
                    <span className="text-gray-900 text-sm truncate max-w-xs">
                      {recording.filename}
                    </span>
                  </div>
                </td>
                <td className="py-4 px-4">
                  <p className="text-sm text-gray-900">
                    {format(new Date(recording.createdAt), 'yyyy/MM/dd HH:mm')}
                  </p>
                </td>
                <td className="py-4 px-4">
                  <p className="text-sm text-gray-900">{formatDuration(recording.duration)}</p>
                </td>
                <td className="py-4 px-4">
                  <p className="text-sm text-gray-900">{formatBytes(Number(recording.sizeBytes))}</p>
                </td>
                <td className="py-4 px-4">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => handlePlay(recording)}
                      className="p-2 bg-green-100 hover:bg-green-200 text-green-700 rounded-lg transition-colors"
                      title="再生"
                    >
                      <Play className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {recordings.length === 0 && (
          <div className="text-center py-12">
            <Video className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-600">録画がありません</p>
          </div>
        )}
      </div>
    </div>
  );
}
