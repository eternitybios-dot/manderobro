# 深層 — Infinite Mandelbrot

スマホで見れる、マンデルブロ集合を**永遠に自動拡大**するフラクタル探索アプリ。

## スマホで見る（公開・動作確認済み）

**https://dazzling-wave-0y8br5b.shipstatic.com**

開くと自動で拡大します。途中で引き戻らず、暗転フェードのあと次の深みへ継ぎます。

恒久公開したい場合（任意）: [このリンクでサイトを claim](https://my.shipstatic.com/claim/e16cecb33b57929bc21671d428884ea2d0c306c29ca0e9bc12687acee0c902b9)

## 使い方

1. 開くと自動で拡大が始まります
2. **SPEED** で速さを変更（停止〜最速）
3. ピンチ / ドラッグでも操作できます
4. 「配色」でカラー切替

## 開発

```bash
npm install
npm run build
npm run preview -- --host 0.0.0.0 --port 4173
```

動作確認:

```bash
APP_URL=http://127.0.0.1:4173/ npm run verify:motion
```

再公開:

```bash
npm run build
npm run deploy
```

## 技術

- WebGL2 / WebGL1（Canvas2D フォールバック）
- 精度が崩れる前にフェード中継してシャープさを維持
- `npm run verify:motion` で公開前チェック
