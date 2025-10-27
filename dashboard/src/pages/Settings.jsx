import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { Key, Lock, AlertCircle, CheckCircle, Copy, RefreshCw } from 'lucide-react';

const Settings = () => {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState({ type: '', text: '' });
  const [copied, setCopied] = useState(false);

  // パスワード変更
  const changePasswordMutation = useMutation({
    mutationFn: async (data) => {
      const response = await api.put('/auth/change-password', data);
      return response.data;
    },
    onSuccess: () => {
      setMessage({ type: 'success', text: 'パスワードを変更しました' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    },
    onError: (error) => {
      setMessage({ 
        type: 'error', 
        text: error.response?.data?.error || 'パスワードの変更に失敗しました' 
      });
    }
  });

  // ストリームキー再生成
  const regenerateKeyMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post('/auth/regenerate-stream-key');
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries(['user']);
      useAuthStore.setState({ 
        user: { ...user, streamKey: data.streamKey } 
      });
      setMessage({ type: 'success', text: 'ストリームキーを再生成しました' });
    },
    onError: () => {
      setMessage({ type: 'error', text: 'ストリームキーの再生成に失敗しました' });
    }
  });

  const handlePasswordChange = (e) => {
    e.preventDefault();
    setMessage({ type: '', text: '' });

    if (!currentPassword || !newPassword || !confirmPassword) {
      setMessage({ type: 'error', text: 'すべてのフィールドを入力してください' });
      return;
    }

    if (newPassword.length < 6) {
      setMessage({ type: 'error', text: 'パスワードは6文字以上にしてください' });
      return;
    }

    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'パスワードが一致しません' });
      return;
    }

    changePasswordMutation.mutate({ currentPassword, newPassword });
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRegenerateKey = () => {
    if (confirm('ストリームキーを再生成しますか？\n現在のキーは使用できなくなります。')) {
      regenerateKeyMutation.mutate();
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">設定</h1>
        <p className="mt-1 text-sm text-gray-500">
          アカウント設定とセキュリティ
        </p>
      </div>

      {/* メッセージ表示 */}
      {message.text && (
        <div className={`rounded-lg p-4 ${
          message.type === 'success' 
            ? 'bg-green-50 border border-green-200' 
            : 'bg-red-50 border border-red-200'
        }`}>
          <div className="flex items-center">
            {message.type === 'success' ? (
              <CheckCircle className="w-5 h-5 text-green-500 mr-2" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-500 mr-2" />
            )}
            <span className={message.type === 'success' ? 'text-green-800' : 'text-red-800'}>
              {message.text}
            </span>
          </div>
        </div>
      )}

      {/* ストリームキー */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center mb-4">
          <Key className="w-6 h-6 text-gray-700 mr-2" />
          <h2 className="text-lg font-semibold">ストリームキー</h2>
        </div>
        <p className="text-sm text-gray-600 mb-4">
          OBSなどの配信ソフトで使用するストリームキーです
        </p>
        <div className="flex gap-2">
          <div className="flex-1">
            <input
              type="text"
              value={user?.streamKey || ''}
              readOnly
              className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 font-mono text-sm"
            />
          </div>
          <button
            onClick={() => copyToClipboard(user?.streamKey)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
          >
            <Copy className="w-4 h-4" />
            {copied ? 'コピーしました' : 'コピー'}
          </button>
          <button
            onClick={handleRegenerateKey}
            disabled={regenerateKeyMutation.isLoading}
            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 flex items-center gap-2 disabled:bg-gray-400"
          >
            <RefreshCw className={`w-4 h-4 ${regenerateKeyMutation.isLoading ? 'animate-spin' : ''}`} />
            再生成
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          ※ ストリームキーを再生成すると、現在のキーは使用できなくなります
        </p>
      </div>

      {/* パスワード変更 */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center mb-4">
          <Lock className="w-6 h-6 text-gray-700 mr-2" />
          <h2 className="text-lg font-semibold">パスワード変更</h2>
        </div>
        <form onSubmit={handlePasswordChange} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              現在のパスワード
            </label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="現在のパスワードを入力"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              新しいパスワード
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="新しいパスワード（6文字以上）"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              新しいパスワード（確認）
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="新しいパスワードを再入力"
            />
          </div>
          <button
            type="submit"
            disabled={changePasswordMutation.isLoading}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {changePasswordMutation.isLoading ? '変更中...' : 'パスワードを変更'}
          </button>
        </form>
      </div>

      {/* アカウント情報 */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">アカウント情報</h2>
        <dl className="space-y-3">
          <div>
            <dt className="text-sm font-medium text-gray-500">ユーザー名</dt>
            <dd className="mt-1 text-sm text-gray-900">{user?.username}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">メールアドレス</dt>
            <dd className="mt-1 text-sm text-gray-900">{user?.email}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">プラン</dt>
            <dd className="mt-1 text-sm text-gray-900 capitalize">{user?.plan || 'free'}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">権限</dt>
            <dd className="mt-1 text-sm text-gray-900">
              {user?.role === 'admin' ? '管理者' : 'ユーザー'}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
};

export default Settings;
