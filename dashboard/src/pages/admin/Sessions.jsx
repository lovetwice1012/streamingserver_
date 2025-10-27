import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, BarChart2, User } from "lucide-react";
import { format } from "date-fns";
import api from "../../lib/api";

const STATUS_META = {
  live: { className: "badge-success", label: "ライブ中" },
  stopped: { className: "badge-info", label: "停止済み" },
  quota_exceeded: { className: "badge-danger", label: "配信クォータ超過" },
  viewing_quota_exceeded: { className: "badge-warning", label: "視聴帯域制限" }
};

const DEFAULT_STATUS_META = { className: "badge-secondary", label: "不明" };

const formatBytes = (value) => {
  if (!value || Number.isNaN(Number(value))) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = Number(value);
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(2)} ${units[unitIndex]}`;
};

const formatDuration = (start, end = new Date()) => {
  const startDate = new Date(start);
  const endDate = end ? new Date(end) : new Date();
  const totalSeconds = Math.max(0, Math.floor((endDate - startDate) / 1000));

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds
      .toString()
      .padStart(2, "0")}`;
  }

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

const getStatusMeta = (status) => STATUS_META[status] ?? DEFAULT_STATUS_META;

export default function AdminSessions() {
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["admin-sessions"],
    queryFn: async () => {
      const response = await api.get("/admin/sessions");
      return Array.isArray(response?.data?.sessions) ? response.data.sessions : [];
    },
    staleTime: 10_000
  });

  const liveSessions = useMemo(
    () => data?.filter((session) => session.status === "live") ?? [],
    [data]
  );

  const pastSessions = useMemo(
    () => data?.filter((session) => session.status !== "live") ?? [],
    [data]
  );

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-gray-600">セッションを読み込み中...</div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3 text-center text-sm">
        <div className="text-red-500">セッションの取得に失敗しました。</div>
        <div className="text-gray-500">{error?.message}</div>
        <button
          type="button"
          className="btn btn-sm btn-primary"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          {isFetching ? "再試行中..." : "再試行"}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">配信セッション</h1>
          <p className="mt-1 text-sm text-gray-600">
            現在の配信状況と履歴を確認できます。
          </p>
        </div>
        <div className="flex gap-4">
          <div className="card flex items-center gap-3 px-4 py-3">
            <div className="rounded-lg bg-green-100 p-3 text-green-600">
              <Activity className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs uppercase text-gray-500">ライブ配信</p>
              <p className="text-2xl font-semibold text-gray-900">{liveSessions.length}</p>
            </div>
          </div>
          <div className="card flex items-center gap-3 px-4 py-3">
            <div className="rounded-lg bg-blue-100 p-3 text-blue-600">
              <BarChart2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs uppercase text-gray-500">セッション総数</p>
              <p className="text-2xl font-semibold text-gray-900">{data?.length ?? 0}</p>
            </div>
          </div>
        </div>
      </header>

      {liveSessions.length > 0 && (
        <section className="space-y-4">
          <h2 className="flex items-center gap-2 text-xl font-semibold text-gray-900">
            <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-red-500" />
            配信中
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {liveSessions.map((session) => {
              const statusMeta = getStatusMeta(session.status);
              return (
                <article
                  key={session.id}
                  className="card border border-red-200 shadow-sm transition hover:shadow"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="rounded-xl bg-red-50 p-3 text-red-600">
                        <Activity className="h-6 w-6" />
                      </div>
                      <div>
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <h3 className="text-lg font-semibold text-gray-900">
                            {session.user?.username ?? "不明なユーザー"}
                          </h3>
                          <span className={`badge ${statusMeta.className}`}>{statusMeta.label}</span>
                        </div>
                        <dl className="space-y-1 text-sm text-gray-600">
                          <div>
                            <dt className="font-medium">ストリームキー</dt>
                            <dd>
                              <code className="rounded bg-gray-100 px-2 py-1 text-gray-800">
                                {session.streamKey}
                              </code>
                            </dd>
                          </div>
                          <div>
                            <dt className="font-medium">開始時刻</dt>
                            <dd>{format(new Date(session.startedAt), "yyyy/MM/dd HH:mm:ss")}</dd>
                          </div>
                          <div>
                            <dt className="font-medium">経過時間</dt>
                            <dd>{formatDuration(session.startedAt)}</dd>
                          </div>
                          <div className="grid grid-cols-3 gap-2 pt-2 text-xs uppercase text-gray-500">
                            <div>
                              <p className="font-semibold text-gray-800">
                                {formatBytes(session.bytesStreamed)}
                              </p>
                              <p>アップリンク</p>
                            </div>
                            <div>
                              <p className="font-semibold text-gray-800">
                                {formatBytes(session.bytesDelivered)}
                              </p>
                              <p>ダウンリンク</p>
                            </div>
                            <div>
                              <p className="font-semibold text-gray-800">
                                {session.viewerCount ?? 0}
                              </p>
                              <p>視聴者数</p>
                            </div>
                          </div>
                        </dl>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">セッション履歴</h2>
          <button
            type="button"
            className="btn btn-sm btn-outline"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            {isFetching ? "更新中..." : "再読み込み"}
          </button>
        </div>

        <div className="card overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead>
              <tr className="border-b border-gray-200 text-left text-sm text-gray-600">
                <th className="px-4 py-3 font-semibold">ユーザー</th>
                <th className="px-4 py-3 font-semibold">ステータス</th>
                <th className="px-4 py-3 font-semibold">開始</th>
                <th className="px-4 py-3 font-semibold">終了</th>
                <th className="px-4 py-3 font-semibold">配信時間</th>
                <th className="px-4 py-3 font-semibold">アップリンク</th>
                <th className="px-4 py-3 font-semibold">ダウンリンク</th>
                <th className="px-4 py-3 font-semibold">視聴者数</th>
              </tr>
            </thead>
            <tbody>
              {pastSessions.length === 0 && liveSessions.length === 0 ? (
                <tr>
                  <td
                    className="px-4 py-6 text-center text-sm text-gray-500"
                    colSpan={8}
                  >
                    セッション履歴がまだありません。
                  </td>
                </tr>
              ) : (
                [...liveSessions, ...pastSessions].map((session) => {
                  const statusMeta = getStatusMeta(session.status);
                  const endedAt = session.endedAt ? new Date(session.endedAt) : null;
                  return (
                    <tr key={session.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-gray-400" />
                          <span className="font-medium text-gray-900">
                            {session.user?.username ?? "不明なユーザー"}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`badge ${statusMeta.className}`}>{statusMeta.label}</span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {format(new Date(session.startedAt), "yyyy/MM/dd HH:mm")}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {endedAt ? format(endedAt, "yyyy/MM/dd HH:mm") : "-"}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {endedAt ? formatDuration(session.startedAt, endedAt) : "ライブ中"}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {formatBytes(session.bytesStreamed)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {formatBytes(session.bytesDelivered)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {session.viewerCount ?? 0}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
