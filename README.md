# 深層 — Infinite Mandelbrot

スマホで見れる、マンデルブロ集合を**永遠に自動拡大**するフラクタル探索アプリ。

## スマホで見る（動作確認済み）

**https://plain-waves-serve.loca.lt**

開くと自動で拡大します。途中で引き戻らず、真っ暗なフェードのあと次の深みへ継ぎます。

> この URL は公開用トンネルです。繋がらないときは下のローカル手順へ。

## 使い方

1. 開くと自動で拡大が始まります
2. **SPEED** で速さを変更（停止〜最速）
3. ピンチ / ドラッグでも操作できます
4. 「配色」でカラー切替

## 開発 / 動作確認

```bash
npm install
npm run build
npm run preview -- --host 0.0.0.0 --port 4173
```

自動テスト（拡大が逆転しないこと・ZOOM が増え続けること）:

```bash
APP_URL=http://127.0.0.1:4173/ npm run verify:motion
```

## 技術

- WebGL2 / WebGL1（Canvas2D フォールバック）
- 精度が崩れる前にフェード中継してシャープさを維持
- `npm run verify:motion` で公開前チェック
