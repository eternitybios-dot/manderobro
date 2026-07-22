# 深層 — Infinite Mandelbrot

タップで場所を選んで、**ひとつの映像のまま途切れず拡大**するフラクタル映像アプリ。

精度限界の手前で、同じ地点のジュリア集合の反発固定点まわりへ滑らかに移行します。ジュリア集合は固定点まわりで厳密に自己相似なので、以降のズームは数学的に継ぎ目なく永遠にループします（別シーンへの切替はありません）。

## スマホで見る

**https://phased-array-8rk8vpl.shipstatic.com**

- タップで拡大する場所を選ぶ（浅いうちだけ操作可）
- ドラッグで視点をずらす / ピンチで拡大縮小
- SPEED で速さ変更（初期値はゆっくり）
- 精度限界でも止まらず、繋がった形状のまま潜り続けます

恒久化（任意）: https://my.shipstatic.com/claim/f8bb968071c2e12f13e6de70e6daa5c50508fe535fe6684dacc249fcc88f6985

※ 匿名デプロイは数日で期限切れになります。残したい場合は上の claim リンクから恒久化してください。

## 開発

```bash
npm install && npm run build && npm run preview
APP_URL=http://127.0.0.1:4173/ npm run verify:motion
APP_URL=http://127.0.0.1:4173/ npm run verify:seamless
npm run deploy
```
