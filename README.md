# 深層 — Infinite Mandelbrot

タップで場所を選んで、マンデルブロ集合を**切り替わらず連続拡大**するスマホ向けアプリ。

## スマホで見る

**https://reborn-cloud-jo7st39.shipstatic.com**

1. 画面をタップして潜る場所を選ぶ
2. その地点へ連続で拡大（場所の自動切替なし）
3. SPEED で速さ変更 / ドラッグで移動 / ピンチで拡大縮小

精度の限界まで行くと止まります。別の場所を見るときは「戻る」かピンチアウトしてから、もう一度タップ。

恒久化（任意）: https://my.shipstatic.com/claim/005e54285547edb7e971dc6e02e157c858ae0b0e77d3dc5fdfbb77fc1c4125cd

## 開発

```bash
npm install
npm run build
npm run preview
APP_URL=http://127.0.0.1:4173/ npm run verify:motion
npm run deploy
```
