# 深層 — Infinite Mandelbrot

タップで場所を選んで、**ひとつの映像のまま途切れず拡大**するフラクタル映像アプリ。

精度限界の手前で、同じ地点の Julia 集合へ滑らかに引き継ぎます（ランダムな別映像への切替はありません）。デフォルト速度は遅めです。

## スマホで見る

**https://elastic-rift-ualaf37.shipstatic.com**

- タップで拡大する場所を選ぶ
- ドラッグで視点をずらす / ピンチで拡大縮小
- SPEED で速さ変更（初期値はゆっくり）
- 精度限界でも止まらず、繋がった形状のまま潜り続けます

恒久化（任意）: https://my.shipstatic.com/claim/105a5945f8579df64555a3361e748dec26ff8158c2ab4fa32a95a16932f67f5e

## 開発

```bash
npm install && npm run build && npm run preview
APP_URL=http://127.0.0.1:4173/ npm run verify:motion
npm run deploy
```
