import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Hls from 'hls.js';
import { Copy, Check, RefreshCcw, Play, Eye } from 'lucide-react';
import api from '../lib/api';

const formatBytes = (bytesString) => {
  const bytes = Number(bytesString ?? 0);
  if (!bytes || Number.isNaN(bytes)) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value.toFixed(2)} ${units[index]}`;
};

const STATUS_LABELS = {
  live: { text: '配信中', className: 'badge-success' },
  stopped: { text: '停止', className: 'badge-secondary' },
  quota_exceeded: { text: '配信クォータ超過', className: 'badge-danger' },
  viewing_quota_exceeded: { text: '視聴クォータ超過', className: 'badge-warning' }
};

export default function Streaming() {
  const videoRef = useRef(null);
  const [playerError, setPlayerError] = useState(null);
  const [copiedField, setCopiedField] = useState(null);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['streaming-info'],
    queryFn: async () => {
      const response = await api.get('/streaming/info');
      return response.data;
    },
    refetchInterval: 30000
  });

  const sessionStatus = useMemo(() => {
    const status = data?.session?.status ?? 'stopped';
    return STATUS_LABELS[status] ?? STATUS_LABELS.stopped;
  }, [data?.session?.status]);

  useEffect(() => {
    const playbackUrl = data?.playback?.hls;
    const video = videoRef.current;

    if (!playbackUrl || !video) {
      return undefined;
    }

    setPlayerError(null);

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = playbackUrl;
      const playPromise = video.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {
          // Autoplay might be blocked; user can start manually
        });
      }
      return () => {
        video.pause();
      };
    }

    if (Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true });
      hls.loadSource(playbackUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.ERROR, (_, details) => {
        if (details?.fatal) {
          setPlayerError('ストリームの読み込みに失敗しました。配信が開始されているか確認してください。');
        }
      });
      return () => {
        hls.destroy();
      };
    }

    setPlayerError('このブラウザはHLS再生に対応していません。別のブラウザをご利用ください。');
    return undefined;
  }, [data?.playback?.hls]);

  const handleCopy = async (field, value) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (err) {
      console.error('Copy failed', err);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-gray-600">
        配信情報を読み込み中です…
      </div>
    );
  }

  if (isError) {
    return (
      <div className="card flex flex-col items-center gap-4 py-12 text-center text-sm text-gray-600">
        <div className="text-red-500 font-semibold">配信情報の取得に失敗しました。</div>
        <div>{error?.message}</div>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          {isFetching ? '再取得中…' : '再取得'}
        </button>
      </div>
    );
  }

  const ingestFullUrl = data?.ingest?.fullUrl;
  const hlsUrl = data?.playback?.hls;
  const flvUrl = data?.playback?.flv;
  const streamKey = data?.user?.streamKey;

  const quota = data?.quota;

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">配信管理</h1>
          <p className="mt-1 text-sm text-gray-600">
            エンコーダー設定や視聴リンク、配信ステータスを確認できます。
          </p>
        </div>
        <button
          type="button"
          className="btn btn-outline btn-sm flex items-center gap-2"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCcw className="h-4 w-4" />
          {isFetching ? '更新中…' : '最新情報を取得'}
        </button>
      </header>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="card space-y-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">配信設定</h2>
            <p className="text-sm text-gray-600">
              配信ソフト（OBS など）には以下の URL とストリームキーを設定してください。
            </p>
          </div>

          <div className="space-y-3">
            <Field
              label="ストリームキー"
              value={streamKey}
              onCopy={() => handleCopy('streamKey', streamKey)}
              copied={copiedField === 'streamKey'}
            />
            <Field
              label="配信URL（サーバー）"
              description="OBS等のサーバーURL欄に設定"
              value={data?.ingest?.baseUrl}
              onCopy={() => handleCopy('ingestBase', data?.ingest?.baseUrl)}
              copied={copiedField === 'ingestBase'}
            />
            <Field
              label="配信URL（完全版）"
              description="コピーペーストで設定する場合はこちら"
              value={ingestFullUrl}
              onCopy={() => handleCopy('ingestFull', ingestFullUrl)}
              copied={copiedField === 'ingestFull'}
            />
          </div>
        </div>

        <div className="card space-y-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">視聴リンク</h2>
            <p className="text-sm text-gray-600">
              視聴者に案内する URL や埋め込み用の HLS URL を確認できます。
            </p>
          </div>

          <div className="space-y-3">
            <Field
              label="HLS (推奨)"
              description="モダンブラウザ向け。ウェブプレイヤーで利用可能"
              value={hlsUrl}
              onCopy={() => handleCopy('hls', hlsUrl)}
              copied={copiedField === 'hls'}
            />
            <Field
              label="HTTP-FLV"
              description="低遅延視聴に対応したクライアント向け"
              value={flvUrl}
              onCopy={() => handleCopy('flv', flvUrl)}
              copied={copiedField === 'flv'}
            />
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">配信プレビュー</h2>
              <p className="text-sm text-gray-600">
                ブラウザ上で配信映像を確認できます。遅延が発生する場合があります。
              </p>
            </div>
            <span className={`badge ${sessionStatus.className}`}>{sessionStatus.text}</span>
          </div>

          <div className="relative aspect-video overflow-hidden rounded-lg bg-black">
            {hlsUrl ? (
              <>
                <video
                  ref={videoRef}
                  className="h-full w-full bg-black"
                  controls
                  muted
                  playsInline
                />
                {!data?.session && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-gray-200 bg-black/60">
                    <Play className="h-8 w-8" />
                    <p>配信が開始されると自動で再生されます</p>
                  </div>
                )}
              </>
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-sm text-gray-200 bg-gray-900">
                <Eye className="h-8 w-8" />
                <p>視聴用 URL が設定されていません。</p>
              </div>
            )}
          </div>

          {playerError && (
            <div className="rounded-lg border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
              {playerError}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="card space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">配信ステータス</h3>
              <p className="text-sm text-gray-600">現在の配信状況と視聴状況を確認できます。</p>
            </div>
            <dl className="space-y-3 text-sm text-gray-700">
              <StatusItem label="ステータス" value={sessionStatus.text} />
              <StatusItem
                label="視聴者数"
                value={`${data?.session?.viewerCount ?? 0} 人`}
              />
              <StatusItem
                label="配信開始"
                value={
                  data?.session?.startedAt
                    ? new Date(data.session.startedAt).toLocaleString('ja-JP')
                    : '未開始'
                }
              />
              <StatusItem
                label="配信データ転送量"
                value={formatBytes(data?.session?.bytesStreamed)}
              />
              <StatusItem
                label="視聴データ転送量"
                value={formatBytes(data?.session?.bytesDelivered)}
              />
            </dl>
          </div>

          {quota && (
            <div className="card space-y-3">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">クォータ状況</h3>
                <p className="text-sm text-gray-600">配信・視聴クォータの残量を確認できます。</p>
              </div>
              <QuotaBar
                title="配信クォータ"
                used={quota.streaming.usedGB}
                limit={quota.streaming.limitGB}
                percent={quota.streaming.percentUsed}
                resetAt={quota.streaming.resetAt}
              />
              <QuotaBar
                title="視聴クォータ"
                used={quota.viewing.usedGB}
                limit={quota.viewing.limitGB}
                percent={quota.viewing.percentUsed}
                resetAt={quota.viewing.resetAt}
              />
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function Field({ label, value, description, onCopy, copied }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-gray-500">
        <span>{label}</span>
        {description && <span className="text-[10px] font-normal text-gray-400">{description}</span>}
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 truncate rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800">
          {value || '未設定'}
        </div>
        <button
          type="button"
          className="btn btn-outline btn-sm flex items-center gap-2"
          onClick={onCopy}
          disabled={!value}
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? 'コピー済み' : 'コピー'}
        </button>
      </div>
    </div>
  );
}

function StatusItem({ label, value }) {
  return (
    <div className="flex items-center justify-between border-b border-gray-100 pb-2 last:mb-0 last:border-b-0 last:pb-0">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-gray-900">{value}</span>
    </div>
  );
}

function QuotaBar({ title, used, limit, percent, resetAt }) {
  const percentValue = Number(percent ?? 0);
  const color =
    percentValue >= 90 ? 'bg-red-500' : percentValue >= 70 ? 'bg-yellow-500' : 'bg-green-500';

  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between text-sm text-gray-600">
        <span className="font-semibold text-gray-900">{title}</span>
        <span>{percentValue.toFixed(2)}%</span>
      </div>
      <div className="mt-2 h-2 rounded-full bg-gray-200">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${Math.min(100, percentValue)}%` }}
        />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-gray-600">
        <div>
          <p className="text-gray-500">使用量</p>
          <p className="font-semibold text-gray-900">{Number(used ?? 0).toFixed(2)} GB</p>
        </div>
        <div>
          <p className="text-gray-500">上限</p>
          <p className="font-semibold text-gray-900">{Number(limit ?? 0).toFixed(2)} GB</p>
        </div>
        {resetAt && (
          <div className="col-span-2 text-xs text-gray-500">
            リセット予定日: {new Date(resetAt).toLocaleDateString('ja-JP')}
          </div>
        )}
      </div>
    </div>
  );
}
