# プラン機能 実装ドキュメント

## 概要

無料プランと3段階の有料プラン（Basic/Standard/Premium）を実装しました。

## プラン詳細

### Free Plan（無料プラン）
- **価格**: $0/月
- **ストレージ**: 1GB（サーバー内、管理者が変更可能）
- **保存先**: サーバーローカルストレージ
- **特徴**:
  - RTMP/RTSP配信
  - 基本的な録画機能
  - 管理者がストレージ上限を変更可能

### Basic Plan
- **価格**: $5/月
- **ストレージ**: 50GB（5ドル × 10GB）
- **保存先**: Wasabiクラウドストレージ
- **特徴**:
  - Wasabiクラウドストレージ
  - RTMP/RTSP配信
  - 高画質録画
  - 優先サポート

### Standard Plan
- **価格**: $10/月
- **ストレージ**: 100GB（10ドル × 10GB）
- **保存先**: Wasabiクラウドストレージ
- **特徴**:
  - Basicの機能すべて
  - 複数同時配信

### Premium Plan
- **価格**: $15/月
- **ストレージ**: 150GB（15ドル × 10GB）
- **保存先**: Wasabiクラウドストレージ
- **特徴**:
  - Standardの機能すべて
  - 最高画質録画
  - 高度な分析機能

## データベース変更

### User テーブルに追加されたフィールド
```prisma
plan         String   @default("free")              // プラン種別
planPrice    Float    @default(0)                   // プラン料金
storageLimit BigInt   @default(1073741824)          // ストレージ上限（バイト）
```

### マイグレーション
```bash
# マイグレーションファイルを適用
npx prisma migrate dev --name add_plan_system

# または既存のDBに直接適用
npx prisma db push
```

## API エンドポイント

### 公開エンドポイント

#### GET `/api/plan/plans`
すべてのプラン情報を取得（認証不要）

**レスポンス例**:
```json
{
  "success": true,
  "plans": {
    "free": {
      "name": "Free",
      "price": 0,
      "storageGB": 1,
      "features": [...]
    },
    "basic": { ... },
    "standard": { ... },
    "premium": { ... }
  }
}
```

### 認証済みユーザー用エンドポイント

#### GET `/api/plan/my-plan`
自分のプラン情報と使用状況を取得

**レスポンス例**:
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "...",
      "username": "user1",
      "plan": "basic"
    },
    "planDetails": {
      "name": "Basic",
      "price": 5,
      "storageGB": 50,
      "features": [...]
    },
    "usage": {
      "usedBytes": 1073741824,
      "usedGB": "1.00",
      "limitBytes": 53687091200,
      "limitGB": "50.00",
      "percentUsed": "2.00"
    }
  }
}
```

### 管理者専用エンドポイント

#### PUT `/api/plan/users/:userId/plan`
ユーザーのプランを変更

**リクエスト**:
```json
{
  "plan": "basic"  // "free", "basic", "standard", "premium"
}
```

#### PUT `/api/plan/free-storage-limit`
無料プランのストレージ上限を変更

**リクエスト**:
```json
{
  "limitGB": 2.0  // GB単位
}
```

#### GET `/api/plan/stats`
プラン統計を取得

**レスポンス例**:
```json
{
  "success": true,
  "data": {
    "totalUsers": 100,
    "totalRevenue": 450.0,
    "plans": [
      {
        "plan": "free",
        "userCount": 50,
        "planInfo": { ... },
        "revenue": 0
      },
      {
        "plan": "basic",
        "userCount": 30,
        "planInfo": { ... },
        "revenue": 150
      },
      ...
    ]
  }
}
```

## フロントエンド

### ユーザー向けページ

#### `/plans` - プラン選択ページ
- すべてのプランの比較表示
- 現在のプランとストレージ使用状況
- プランアップグレードボタン（管理者承認が必要）

### 管理者向けページ

#### `/admin/plans` - プラン管理ページ
- プラン別のユーザー数と収益の統計
- プラン分布の可視化（グラフ）
- 無料プランのストレージ上限変更機能
- 月間収益レポート

## サービスクラス

### PlanService (`src/services/plan.service.js`)

主要メソッド:
- `getPlans()` - すべてのプラン情報を取得
- `getPlan(planName)` - 特定プラン情報を取得
- `getStorageLimit(planName)` - プランのストレージ上限を取得
- `canUseFeature(user, feature)` - ユーザーが機能を使用できるか確認
- `updateUserPlan(userId, newPlan, adminId)` - ユーザーのプランを変更
- `updateFreeStorageLimit(limitGB)` - 無料プランの上限変更
- `getUserPlanInfo(userId)` - ユーザーのプラン情報と使用状況
- `getPlanStats()` - プラン統計（管理者用）

## 使用例

### バックエンドでプランチェック
```javascript
const planService = require('./services/plan.service');

// ユーザーが機能を使用できるか確認
if (planService.canUseFeature(user, 'cloud_storage')) {
  // Wasabiにアップロード
} else {
  // ローカルに保存
}

// ストレージ上限を取得
const limit = planService.getStorageLimit(user.plan);
```

### フロントエンドでプラン表示
```jsx
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';

function MyPlan() {
  const { data } = useQuery({
    queryKey: ['myPlan'],
    queryFn: async () => {
      const response = await api.get('/plan/my-plan');
      return response.data;
    }
  });

  return (
    <div>
      <h2>現在のプラン: {data?.data?.planDetails?.name}</h2>
      <p>使用量: {data?.data?.usage?.usedGB} / {data?.data?.usage?.limitGB} GB</p>
    </div>
  );
}
```

## ストレージの動作

### 無料プラン
1. 録画はサーバー内に保存
2. 上限を超えた場合、古い録画を自動削除
3. 管理者が上限を変更可能（全無料ユーザーに適用）

### 有料プラン
1. 録画はWasabiクラウドに自動アップロード
2. ローカルファイルは削除（ストレージ節約）
3. 容量は1ドルあたり10GB

## セットアップ手順

1. データベースマイグレーション
```bash
cd /opt/streamingserver
npx prisma db push
```

2. サービス再起動
```bash
sudo systemctl restart streamingserver
```

3. ダッシュボード再ビルド
```bash
cd dashboard
npm run build
sudo cp -r dist/* /var/www/streamingserver/
```

## 今後の拡張案

- [ ] Stripe/PayPal決済統合
- [ ] プラン自動アップグレード/ダウングレード
- [ ] 使用量アラート通知
- [ ] カスタムプラン作成機能
- [ ] プロモーションコード
- [ ] トライアル期間
