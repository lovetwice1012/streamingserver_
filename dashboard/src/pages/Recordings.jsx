import { useQuery } from '@tanstack/react-query';
import { Video, Trash2, Play } from 'lucide-react';
import api from '../lib/api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

const getApiBaseUrl = () => {
  const base = import.meta.env.VITE_API_URL || '/api';
  return base.endsWith('/') ? base.slice(0, -1) : base;
};

const buildPlaybackUrl = (id, token) =>
  `${getApiBaseUrl()}/recordings/${id}/play?token=${encodeURIComponent(token)}`;

const formatBytes = (bytes) => {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

const formatDuration = (seconds) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs
      .toString()
      .padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
};

export default function Recordings() {
  const { data: recordings, refetch } = useQuery({
    queryKey: ['recordings'],
    queryFn: async () => {
      const res = await api.get('/recordings');
      return res.data;
    }
  });

  const handleDelete = async (id) => {
    if (!window.confirm('この録画を削除しますか?')) return;

    try {
      await api.delete(`/recordings/${id}`);
      toast.success('録画を削除しました');
      refetch();
    } catch (error) {
      toast.error('削除に失敗しました');
    }
  };

  const handlePlay = (id) => {
    const token = localStorage.getItem('token');
    if (!token) {
      toast.error('認証情報が見つかりません');
      return;
    }

    const playbackUrl = buildPlaybackUrl(id, token);
    window.open(playbackUrl, '_blank', 'noopener');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">録画一覧</h1>
          <p className="mt-1 text-gray-600">保存された録画を管理できます。</p>
        </div>
        <div className="text-right">
          <p className="text-sm text-gray-600">合計録画数</p>
          <p className="text-2xl font-bold text-gray-900">{recordings?.length || 0}</p>
        </div>
      </div>

      <div className="rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
        録画を再生すると視聴クオータを消費します。残量を確認してから再生してください。
      </div>

      {recordings && recordings.length > 0 ? (
        <div className="grid gap-4">
          {recordings.map((recording) => (
            <div key={recording.id} className="card transition-shadow hover:shadow-md">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 rounded-xl bg-blue-100 p-3">
                  <Video className="h-6 w-6 text-blue-600" />
                </div>

                <div className="min-w-0 flex-1">
                  <h3 className="mb-1 truncate text-lg font-semibold text-gray-900">
                    {recording.filename}
                  </h3>
                  <div className="flex flex-wrap gap-4 text-sm text-gray-600">
                    <span>📅 {format(new Date(recording.createdAt), 'yyyy/MM/dd HH:mm')}</span>
                    <span>⏱️ {formatDuration(recording.duration)}</span>
                    <span>💾 {formatBytes(Number(recording.sizeBytes))}</span>
                  </div>
                </div>

                <div className="flex flex-shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => handlePlay(recording.id)}
                    className="rounded-lg bg-green-100 p-2 text-green-700 transition-colors hover:bg-green-200"
                    title="再生"
                  >
                    <Play className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(recording.id)}
                    className="rounded-lg bg-red-100 p-2 text-red-700 transition-colors hover:bg-red-200"
                    title="削除"
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card py-16 text-center">
          <Video className="mx-auto mb-4 h-16 w-16 text-gray-400" />
          <h3 className="mb-2 text-xl font-semibold text-gray-900">録画がありません</h3>
          <p className="text-gray-600">配信を開始すると自動的に録画されます。</p>
        </div>
      )}
    </div>
  );
}
