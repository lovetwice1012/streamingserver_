import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';
import { TrendingUp, DollarSign, Users, Settings, Loader2, Save } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const COLORS = ['#3B82F6', '#10B981', '#8B5CF6', '#F59E0B'];

const PlanManagement = () => {
  const queryClient = useQueryClient();
  const [freeStorageLimit, setFreeStorageLimit] = useState(1);

  // プラン統計を取得
  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ['planStats'],
    queryFn: async () => {
      const response = await api.get('/plan/stats');
      return response.data;
    }
  });

  // 無料プランのストレージ上限を変更
  const updateFreeStorageMutation = useMutation({
    mutationFn: async (limitGB) => {
      const response = await api.put('/plan/free-storage-limit', { limitGB });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['planStats']);
      alert('無料プランのストレージ上限を更新しました');
    },
    onError: (error) => {
      alert('エラー: ' + (error.response?.data?.error || error.message));
    }
  });

  if (statsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  const stats = statsData?.data || {};
  const planChartData = stats.plans?.map(p => ({
    name: p.planInfo.name,
    users: p.userCount,
    revenue: p.revenue
  })) || [];

  const pieChartData = stats.plans?.map((p, idx) => ({
    name: p.planInfo.name,
    value: p.userCount,
    color: COLORS[idx % COLORS.length]
  })) || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">プラン管理</h1>
        <p className="mt-1 text-sm text-gray-500">
          ユーザープランの統計と設定
        </p>
      </div>

      {/* サマリーカード */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">総ユーザー数</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">
                {stats.totalUsers || 0}
              </p>
            </div>
            <Users className="w-12 h-12 text-blue-500 opacity-50" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">月間収益</p>
              <p className="text-3xl font-bold text-green-600 mt-2">
                ${stats.totalRevenue?.toFixed(2) || 0}
              </p>
            </div>
            <DollarSign className="w-12 h-12 text-green-500 opacity-50" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">有料ユーザー率</p>
              <p className="text-3xl font-bold text-purple-600 mt-2">
                {stats.totalUsers ? 
                  ((stats.plans?.filter(p => p.plan !== 'free').reduce((sum, p) => sum + p.userCount, 0) / stats.totalUsers) * 100).toFixed(1)
                  : 0}%
              </p>
            </div>
            <TrendingUp className="w-12 h-12 text-purple-500 opacity-50" />
          </div>
        </div>
      </div>

      {/* グラフ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ユーザー数と収益の棒グラフ */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">プラン別ユーザー数と収益</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={planChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis yAxisId="left" />
              <YAxis yAxisId="right" orientation="right" />
              <Tooltip />
              <Legend />
              <Bar yAxisId="left" dataKey="users" fill="#3B82F6" name="ユーザー数" />
              <Bar yAxisId="right" dataKey="revenue" fill="#10B981" name="収益 ($)" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* ユーザー分布の円グラフ */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">プラン別ユーザー分布</h2>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={pieChartData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
              >
                {pieChartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* プラン詳細テーブル */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold">プラン詳細</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  プラン
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  価格
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  ストレージ
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  ユーザー数
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  収益
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {stats.plans?.map((plan) => (
                <tr key={plan.plan}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="font-medium capitalize">{plan.planInfo.name}</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {plan.planInfo.price === 0 ? '無料' : `$${plan.planInfo.price}/月`}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {plan.planInfo.storageGB}GB
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {plan.userCount}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    ${plan.revenue.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 無料プランストレージ設定 */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center mb-4">
          <Settings className="w-6 h-6 text-gray-700 mr-2" />
          <h2 className="text-lg font-semibold">無料プランストレージ上限設定</h2>
        </div>
        <p className="text-sm text-gray-600 mb-4">
          無料プランユーザーのサーバー内ストレージ上限を設定します。
        </p>
        <div className="flex items-center gap-4">
          <div className="flex-1 max-w-xs">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              ストレージ上限（GB）
            </label>
            <input
              type="number"
              min="0.1"
              step="0.1"
              value={freeStorageLimit}
              onChange={(e) => setFreeStorageLimit(parseFloat(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <button
            onClick={() => updateFreeStorageMutation.mutate(freeStorageLimit)}
            disabled={updateFreeStorageMutation.isLoading || freeStorageLimit <= 0}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2 mt-7"
          >
            {updateFreeStorageMutation.isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            更新
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          ※ この設定はすべての無料プランユーザーに適用されます
        </p>
      </div>
    </div>
  );
};

export default PlanManagement;
