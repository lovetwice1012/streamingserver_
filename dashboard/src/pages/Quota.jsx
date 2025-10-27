import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Gauge, TrendingUp, HardDrive, Calendar } from 'lucide-react';
import api from '../lib/api';
import { getWebSocketUrl } from '../lib/ws';

const formatBytes = (bytes) => {
  if (!bytes) return '0 B';
  const numeric = Number(bytes);
  if (!Number.isFinite(numeric) || numeric <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(numeric) / Math.log(1024)), units.length - 1);
  const value = numeric / 1024 ** index;
  return `${value.toFixed(2)} ${units[index]}`;
};

const getProgressColor = (percent) => {
  if (percent >= 90) return 'bg-red-500';
  if (percent >= 70) return 'bg-yellow-500';
  return 'bg-green-500';
};

export default function Quota() {
  const queryClient = useQueryClient();
  const [socketConnected, setSocketConnected] = useState(false);

  const { data: quota } = useQuery({
    queryKey: ['quota'],
    queryFn: async () => {
      const res = await api.get('/quota');
      return res.data;
    }
  });

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      return undefined;
    }

    let socket;
    let reconnectTimer;
    let active = true;

    const connect = () => {
      if (!active) return;

      const url = `${getWebSocketUrl('/ws/quota')}?token=${encodeURIComponent(token)}`;
      socket = new WebSocket(url);

      socket.onopen = () => {
        if (!active) return;
        setSocketConnected(true);
      };

      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message?.type === 'quota:update' && message.payload) {
            queryClient.setQueryData(['quota'], message.payload);
            queryClient.setQueryData(['streaming-info'], (prev) =>
              prev ? { ...prev, quota: message.payload } : prev
            );
          }
        } catch (err) {
          console.error('Failed to parse quota websocket message', err);
        }
      };

      socket.onerror = () => {
        socket?.close();
      };

      socket.onclose = () => {
        if (!active) return;
        setSocketConnected(false);
        reconnectTimer = setTimeout(connect, 5000);
      };
    };

    connect();

    return () => {
      active = false;
      setSocketConnected(false);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.close();
      }
    };
  }, [queryClient]);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold text-gray-900">クォータ管理</h1>
          <span className={`badge ${socketConnected ? 'badge-success' : 'badge-secondary'}`}>
            {socketConnected ? 'リアルタイム更新中' : 'リアルタイム待機中'}
          </span>
        </div>
        <p className="mt-1 text-gray-600">使用状況とクォータ制限を確認できます。</p>
      </div>

      {/* Recording Quota */}
      <div className="card">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">録画クォータ</h2>
            <p className="mt-1 text-gray-600">録画ファイルの保存容量を管理します。</p>
          </div>
          <div className="rounded-xl bg-purple-100 p-4">
            <HardDrive className="h-8 w-8 text-purple-600" />
          </div>
        </div>

        <div className="space-y-6">
          <div>
            <div className="mb-3 flex items-end justify-between">
              <div>
                <p className="text-4xl font-bold text-gray-900">
                  {quota?.recording?.usedGB?.toFixed(2) ?? 0}
                  <span className="ml-2 text-xl text-gray-500">GB</span>
                </p>
                <p className="mt-1 text-gray-600">
                  使用中 / {quota?.recording?.limitGB ?? 0} GB
                </p>
              </div>
              <div
                className={`badge ${
                  parseFloat(quota?.recording?.percentUsed ?? 0) >= 90
                    ? 'badge-danger'
                    : parseFloat(quota?.recording?.percentUsed ?? 0) >= 70
                    ? 'badge-warning'
                    : 'badge-success'
                }`}
              >
                {quota?.recording?.percentUsed ?? 0}% 使用中
              </div>
            </div>

            <div className="h-4 w-full overflow-hidden rounded-full bg-gray-200">
              <div
                className={`h-full transition-all duration-500 ${getProgressColor(
                  parseFloat(quota?.recording?.percentUsed ?? 0)
                )}`}
                style={{ width: `${quota?.recording?.percentUsed ?? 0}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 border-t pt-4 text-sm">
            <div>
              <p className="mb-1 text-gray-600">使用量</p>
              <p className="text-xl font-semibold text-gray-900">
                {formatBytes(quota?.recording?.used)}
              </p>
            </div>
            <div>
              <p className="mb-1 text-gray-600">残り容量</p>
              <p className="text-xl font-semibold text-gray-900">
                {formatBytes(
                  Number(quota?.recording?.limit ?? 0) - Number(quota?.recording?.used ?? 0)
                )}
              </p>
            </div>
          </div>

          {parseFloat(quota?.recording?.percentUsed ?? 0) >= 80 && (
            <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
              ⚠️ 録画容量が80%を超えています。容量を超えると古い録画から自動削除されます。
            </div>
          )}
        </div>
      </div>

      {/* Streaming Quota */}
      <div className="card">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">配信クォータ（月間）</h2>
            <p className="mt-1 text-gray-600">月間のデータ転送量を管理します。</p>
          </div>
          <div className="rounded-xl bg-green-100 p-4">
            <TrendingUp className="h-8 w-8 text-green-600" />
          </div>
        </div>

        <div className="space-y-6">
          <div>
            <div className="mb-3 flex items-end justify-between">
              <div>
                <p className="text-4xl font-bold text-gray-900">
                  {quota?.streaming?.usedGB?.toFixed(2) ?? 0}
                  <span className="ml-2 text-xl text-gray-500">GB</span>
                </p>
                <p className="mt-1 text-gray-600">
                  使用中 / {quota?.streaming?.limitGB ?? 0} GB
                </p>
              </div>
              <div
                className={`badge ${
                  parseFloat(quota?.streaming?.percentUsed ?? 0) >= 90
                    ? 'badge-danger'
                    : parseFloat(quota?.streaming?.percentUsed ?? 0) >= 70
                    ? 'badge-warning'
                    : 'badge-success'
                }`}
              >
                {quota?.streaming?.percentUsed ?? 0}% 使用中
              </div>
            </div>

            <div className="h-4 w-full overflow-hidden rounded-full bg-gray-200">
              <div
                className={`h-full transition-all duration-500 ${getProgressColor(
                  parseFloat(quota?.streaming?.percentUsed ?? 0)
                )}`}
                style={{ width: `${quota?.streaming?.percentUsed ?? 0}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 border-t pt-4 text-sm">
            <div>
              <p className="mb-1 text-gray-600">使用量</p>
              <p className="text-xl font-semibold text-gray-900">
                {formatBytes(quota?.streaming?.used)}
              </p>
            </div>
            <div>
              <p className="mb-1 text-gray-600">残り容量</p>
              <p className="text-xl font-semibold text-gray-900">
                {formatBytes(
                  Number(quota?.streaming?.limit ?? 0) - Number(quota?.streaming?.used ?? 0)
                )}
              </p>
            </div>
            <div>
              <p className="mb-1 text-gray-600">リセット日</p>
              <p className="text-xl font-semibold text-gray-900">
                {quota?.streaming?.resetAt
                  ? new Date(quota.streaming.resetAt).toLocaleDateString('ja-JP', {
                      month: 'short',
                      day: 'numeric'
                    })
                  : '-'}
              </p>
            </div>
          </div>

          {parseFloat(quota?.streaming?.percentUsed ?? 0) >= 80 && (
            <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
              ⚠️ 配信クォータが80%を超えています。100%に達すると配信が自動停止されます。
            </div>
          )}
        </div>
      </div>

      {/* Info Card */}
      <div className="card border-blue-200 bg-blue-50">
        <div className="flex gap-4">
          <div className="flex-shrink-0 rounded-xl bg-blue-100 p-3">
            <Calendar className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <h3 className="mb-2 font-semibold text-gray-900">クォータについて</h3>
            <ul className="space-y-1 text-sm text-gray-700">
              <li>• 録画クォータ: 録画ファイルの合計容量が上限です。</li>
              <li>• 配信クォータ: 毎月1日にリセットされる配信データ量の上限です。</li>
              <li>• 録画容量超過: 自動的に古い録画から削除されます。</li>
              <li>• 配信容量超過: 配信が自動的に停止されます。</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
