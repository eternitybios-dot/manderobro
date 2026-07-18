# 深層 — Infinite Mandelbrot

タップで方向を選んで、**継ぎ目なく永遠に拡大**するフラクタル映像アプリ。

（見た目はマンデルブロ風。精度限界を避けるため、深く潜るほど擬似的にディテールを生成します。）

## スマホで見る

**https://atomic-nova-n8lh9hc.shipstatic.com**

- タップで潜る方向を選ぶ
- ドラッグで視点をずらす / ピンチで拡大縮小
- SPEED で速さ変更
- 永遠に拡大し続けます（ピクセル崩れで止まりません）

恒久化（任意）: https://my.shipstatic.com/claim/6a5c358a0b228c9f803e1c962dd59d99b4d3f1d20b6a647d03466667ea4e02b9

## 開発

```bash
npm install && npm run build && npm run preview
APP_URL=http://127.0.0.1:4173/ npm run verify:motion
npm run deploy
```
