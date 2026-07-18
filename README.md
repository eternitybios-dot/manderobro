# 深層 — Infinite Mandelbrot

タップで場所を選んで、マンデルブロ集合を**切り替わらず連続拡大**するスマホ向けアプリ。

## スマホで見る

**https://clear-firefly-aa0y8r7.shipstatic.com**

1. 画面をタップして潜る場所を選ぶ
2. その地点へ連続で拡大（場所の自動切替なし）
3. SPEED で速さ変更 / ドラッグで移動 / ピンチで拡大縮小

精度の限界まで行くと止まります。別の場所を見るときは「戻る」かピンチアウトしてから、もう一度タップ。

恒久化（任意）: https://my.shipstatic.com/claim/980458c63545ad44bf1cb39cb8ef96665a42670a998539433f730918af11ab51

## 開発

```bash
npm install
npm run build
npm run preview
APP_URL=http://127.0.0.1:4173/ npm run verify:motion
npm run deploy
```
