# 深層 — Infinite Mandelbrot

スマホで見れる、マンデルブロ集合を**永遠に自動拡大**するフラクタル探索アプリ。

## スマホで見る

スマホのブラウザでこの URL を開く（最新版）:

**https://raw.githack.com/eternitybios-dot/manderobro/77a76d1/index.html**

開いたら自動で拡大が始まり、精度の限界を越えても次の深みへ継ぎ足して永遠に潜り続けます。SPEED で速さを変えられます。

### ローカルから同じ Wi-Fi のスマホで見る

```bash
npm install
npm run dev -- --host
```

ターミナルの `Network` URL（例: `http://192.168.x.x:5173`）をスマホのブラウザで開く。

## 使い方

1. 開くと自動で拡大が始まります
2. 下の **SPEED** バーで拡大スピードを自由に変更（停止〜最速）
3. ピンチで手動ズーム、ドラッグで移動もできます
4. 「配色」でカラーパレットを切り替え
5. 限界まで潜ると、別の名所へシームレスに遷移してまた潜り続けます

## 開発

```bash
npm install
npm run dev
```

同じ Wi-Fi のスマホから見る場合は、ターミナルに表示される `Network` の URL を開いてください。

本番ビルド:

```bash
npm run build
npm run preview
```

## 技術

- WebGL2 フラグメントシェーダで描画
- double-float（疑似倍精度）で深いズームに対応
- タッチ操作（ピンチ / ドラッグ）対応
- GitHub Pages で公開
