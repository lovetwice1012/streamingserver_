import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { Check, Zap, Crown, Star, Loader2 } from 'lucide-react';

const Plans = () => {
  const queryClient = useQueryClient();
  const [selectedPlan, setSelectedPlan] = useState(null);

  // すべてのプランを取得
  const { data: plansData, isLoading: plansLoading } = useQuery({
    queryKey: ['plans'],
    queryFn: async () => {
      const response = await api.get('/plan/plans');
      return response.data;
    }
  });

  // 現在のプラン情報を取得
  const { data: myPlanData, isLoading: myPlanLoading } = useQuery({
    queryKey: ['myPlan'],
    queryFn: async () => {
      const response = await api.get('/plan/my-plan');
      return response.data;
    }
  });

  // プラン変更ミューテーション（実際の決済処理は別途必要）
  const upgradeMutation = useMutation({
    mutationFn: async (plan) => {
      // 本番環境では決済処理が必要
      alert(`${plan}プランへのアップグレードには管理者の承認が必要です。お問い合わせください。`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['myPlan']);
    }
  });

  const getPlanIcon = (planKey) => {
    switch (planKey) {
      case 'free':
        return <Zap className="w-8 h-8 text-gray-500" />;
      case 'basic':
        return <Star className="w-8 h-8 text-blue-500" />;
      case 'standard':
        return <Zap className="w-8 h-8 text-purple-500" />;
      case 'premium':
        return <Crown className="w-8 h-8 text-yellow-500" />;
      default:
        return <Zap className="w-8 h-8" />;
    }
  };

  const getPlanColor = (planKey) => {
    switch (planKey) {
      case 'free':
        return 'border-gray-300 bg-white';
      case 'basic':
        return 'border-blue-500 bg-blue-50';
      case 'standard':
        return 'border-purple-500 bg-purple-50';
      case 'premium':
        return 'border-yellow-500 bg-gradient-to-br from-yellow-50 to-orange-50';
      default:
        return 'border-gray-300';
    }
  };

  if (plansLoading || myPlanLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  const plans = plansData?.plans || {};
  const currentPlan = myPlanData?.data?.user?.plan || 'free';
  const usage = myPlanData?.data?.usage;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">プラン管理</h1>
        <p className="mt-1 text-sm text-gray-500">
          あなたのニーズに合ったプランを選択してください
        </p>
      </div>

      {/* 現在のプランと使用状況 */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">現在のプラン</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <div className="text-sm text-gray-500">プラン</div>
            <div className="text-2xl font-bold capitalize">
              {plans[currentPlan]?.name || currentPlan}
            </div>
            {currentPlan !== 'free' && (
              <div className="text-lg text-gray-600 mt-1">
                ${plans[currentPlan]?.price}/月
              </div>
            )}
          </div>
          <div>
            <div className="text-sm text-gray-500">ストレージ使用状況</div>
            <div className="text-2xl font-bold">
              {usage?.usedGB || 0} GB / {usage?.limitGB || 0} GB
            </div>
            <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all"
                style={{ width: `${Math.min(usage?.percentUsed || 0, 100)}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* プラン一覧 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {Object.entries(plans).map(([key, plan]) => {
          const isCurrent = key === currentPlan;
          const isUpgrade = ['free', 'basic', 'standard', 'premium'].indexOf(key) > 
                           ['free', 'basic', 'standard', 'premium'].indexOf(currentPlan);

          return (
            <div
              key={key}
              className={`relative rounded-lg border-2 p-6 ${getPlanColor(key)} ${
                isCurrent ? 'ring-2 ring-offset-2 ring-blue-500' : ''
              }`}
            >
              {isCurrent && (
                <div className="absolute top-0 right-0 -mt-3 -mr-3">
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-500 text-white">
                    現在のプラン
                  </span>
                </div>
              )}

              <div className="text-center">
                <div className="flex justify-center mb-4">
                  {getPlanIcon(key)}
                </div>
                <h3 className="text-xl font-bold mb-2">{plan.name}</h3>
                <div className="text-3xl font-bold mb-1">
                  {plan.price === 0 ? (
                    '無料'
                  ) : (
                    <>
                      ${plan.price}
                      <span className="text-base font-normal text-gray-600">/月</span>
                    </>
                  )}
                </div>
                <div className="text-sm text-gray-600 mb-6">
                  ストレージ: {plan.storageGB}GB
                </div>

                <ul className="space-y-3 mb-6 text-left">
                  {plan.features.map((feature, idx) => (
                    <li key={idx} className="flex items-start">
                      <Check className="w-5 h-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                      <span className="text-sm text-gray-700">{feature}</span>
                    </li>
                  ))}
                </ul>

                {!isCurrent && (
                  <button
                    onClick={() => upgradeMutation.mutate(key)}
                    disabled={!isUpgrade}
                    className={`w-full px-4 py-2 rounded-lg font-medium transition-colors ${
                      isUpgrade
                        ? 'bg-blue-600 text-white hover:bg-blue-700'
                        : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                    }`}
                  >
                    {isUpgrade ? 'アップグレード' : 'ダウングレード不可'}
                  </button>
                )}

                {isCurrent && (
                  <button
                    disabled
                    className="w-full px-4 py-2 rounded-lg font-medium bg-gray-100 text-gray-500 cursor-default"
                  >
                    現在のプラン
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 注意事項 */}
      <div className="bg-blue-50 rounded-lg p-4">
        <h3 className="font-semibold text-blue-900 mb-2">プランについて</h3>
        <ul className="space-y-1 text-sm text-blue-800">
          <li>• 無料プランはサーバー内ストレージを使用します（管理者が上限を変更可能）</li>
          <li>• 有料プランはWasabiクラウドストレージを使用し、容量は1ドルあたり10GBです</li>
          <li>• プランのアップグレードには管理者の承認が必要です</li>
          <li>• 録画ファイルは自動的にストレージにアップロードされます</li>
        </ul>
      </div>
    </div>
  );
};

export default Plans;
