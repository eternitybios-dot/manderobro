# 深層 — Infinite Mandelbrot

タップで場所を選んで、マンデルブロ集合を**切り替わらず連続拡大**するスマホ向けアプリ。

## スマホで見る

**https://hyper-fog-p8ifp51.shipstatic.com**

- タップで潜る場所を選ぶ
- 浅い層は高速描画、深くなったら高精度計算に自動切替（場所は変わらない）
- 以前の「すぐに限界」より、はるかに深くまで連続で潜れます

精度の最終限界まで行くと止まります。別の場所は「戻る」か再タップ。

恒久化（任意）: https://my.shipstatic.com/claim/5af0aaabffa3810cc6afb0ce18e3b5bdc4d6dd8f64345b3d70128fbfa5b5e09f

## 開発

```bash
npm install && npm run build && npm run preview
APP_URL=http://127.0.0.1:4173/ npm run verify:motion
npm run deploy
```
