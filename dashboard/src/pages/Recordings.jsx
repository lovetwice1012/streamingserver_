import { useQuery } from '@tanstack/react-query';
import { Video, Download, Trash2, Play } from 'lucide-react';
import api from '../lib/api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

export default function Recordings() {
  const { data: recordings, refetch } = useQuery({
    queryKey: ['recordings'],
    queryFn: async () => {
      const res = await api.get('/recordings');
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

  const formatDuration = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  const handleDelete = async (id) => {
    if (!confirm('この録画を削除しますか?')) return;

    try {
      await api.delete(`/recordings/${id}`);
      toast.success('録画を削除しました');
      refetch();
    } catch (error) {
      toast.error('削除に失敗しました');
    }
  };

  const handlePlay = async (id) => {
    try {
      const res = await api.get(`/recordings/${id}/play`);
      window.open(res.request.responseURL, '_blank');
    } catch (error) {
      toast.error('再生に失敗しました');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">録画一覧</h1>
          <p className="text-gray-600 mt-1">保存された録画を管理</p>
        </div>
        <div className="text-right">
          <p className="text-sm text-gray-600">合計録画数</p>
          <p className="text-2xl font-bold text-gray-900">{recordings?.length || 0}</p>
        </div>
      </div>

      {recordings && recordings.length > 0 ? (
        <div className="grid gap-4">
          {recordings.map((recording) => (
            <div key={recording.id} className="card hover:shadow-md transition-shadow">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-blue-100 rounded-xl flex-shrink-0">
                  <Video className="w-6 h-6 text-blue-600" />
                </div>
                
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 text-lg mb-1 truncate">
                    {recording.filename}
                  </h3>
                  <div className="flex flex-wrap gap-4 text-sm text-gray-600">
                    <span>📅 {format(new Date(recording.createdAt), 'yyyy/MM/dd HH:mm')}</span>
                    <span>⏱️ {formatDuration(recording.duration)}</span>
                    <span>💾 {formatBytes(Number(recording.sizeBytes))}</span>
                  </div>
                </div>

                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => handlePlay(recording.id)}
                    className="p-2 bg-green-100 hover:bg-green-200 text-green-700 rounded-lg transition-colors"
                    title="再生"
                  >
                    <Play className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => handleDelete(recording.id)}
                    className="p-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg transition-colors"
                    title="削除"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card text-center py-16">
          <Video className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">録画がありません</h3>
          <p className="text-gray-600">配信を開始すると自動的に録画されます</p>
        </div>
      )}
    </div>
  );
}
