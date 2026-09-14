# 就醫導航 ED SmartFlow

症狀初步判斷 → 就醫層級建議 → 鄰近急診量能 → 診所／居家安全網。
單檔 HTML，無建置流程，部署於 GitHub Pages。

**定位：衛教與就醫導引工具，不做疾病診斷，不取代醫療專業判斷。**

## 檔案結構

```
index.html              主程式（單檔，含分流邏輯與 UI）
sw.js                   Service Worker — 離線快取與版本更新
manifest.webmanifest    PWA 安裝設定
icons/                  192／512／maskable／apple-touch／favicon
```

## 發布新版的唯一動作

改完 `index.html` 之後，**一定要把 `sw.js` 最上面的 `APP_VERSION` 加一版**，例如
`v0.2.0` → `v0.2.1`，順便把 `index.html` 的 `CONFIG.version` 改成同一版號。

版號一改 → cache 名稱改變 → 瀏覽器偵測到新的 Service Worker → 已安裝的使用者
會看到「有新版本」提示 → 按「立即更新」後 `SKIP_WAITING` → `controllerchange`
→ 自動重新載入新版。忘記改版號的話，使用者會一直停在舊版。

更新檢查時機：開啟 App 時、每 30 分鐘、每次從背景切回前景。
第一次安裝不會跳提示（沒有舊版可換）。

## 目前完成（v0.2）

- **PWA**：可加到主畫面、獨立視窗開啟、離線可完成整段分流評估
- **版本更新提示**：偵測到新版顯示底部提示條，使用者按下後自動更新並重載
- 離線狀態列：離線時提醒即時資訊與導航需要連線

- 五步驟分流：年齡 → 立即危險徵象（red flag）→ 主要症狀 → 症狀警訊 → 特殊身分
- 四級建議：L1 撥 119／L2 急診／L3 診所門診／L4 居家觀察 + safety net
- 腫瘤／免疫低下路徑：治療中發燒一律升級為急診（發熱性嗜中性球低下）
- GPS 距離排序 + 車程推估（直線距離 × 1.3 ÷ 24 km/h）
- 台北、新北、基隆 19 家重度級急救責任醫院，附各院官方即時資訊連結
- EDLI 急診負荷指數與 ETAC 排序邏輯已實作，等待資料源接入
- 語音朗讀（Web Speech API）、鍵盤可操作、reduced-motion

## 資料層契約

`CONFIG.liveApiBase` 設定後，前端會呼叫 `GET {base}/er-live`，預期回傳：

```json
[{"id":"wanfang","waitingPatients":18,"pendingWard":22,"pendingIcu":3,"updatedAt":"2026-09-14T10:20:00+08:00"}]
```

`id` 需對應 `HOSPITALS` 陣列。未設定時畫面會誠實顯示「未串接即時資料」並僅依距離排序。
`CONFIG.demoMode = true` 可用合成資料展示 ETAC 排序效果（畫面會標示「示範資料」）。

## 已知限制

1. **無公開統一 API。** 衛福部醫事司頁面只列出各院自建的即時頁面（54 家、54 種格式），健保署 INAE4001S01 是查詢網頁而非開放資料集。跨網域抓取需要後端 aggregator。
2. **醫院座標為概略值**，僅供距離排序，正式版須重新地理編碼。
3. **未編碼院所能力旗標**（PCI、中風、創傷、產科）。這類資料須以各縣市緊急醫療網轉診規劃表核實後才可加入，錯誤的能力標示會造成實質危害。ETAC 的 capability penalty 目前為 0。
4. **EDLI 權重（0.40／0.35／0.25）為暫定值**，尚未經專家賦權。

## 待辦

- [ ] 後端 aggregator（Railway，Node）：定時抓取各院即時頁 → 正規化 → `/er-live`
- [ ] EDLI 權重以 BWM／FDM 由急診醫師賦權
- [ ] 分流規則送急診醫學科審查
- [ ] TFDA 醫療器材軟體分類分級確認
- [ ] 醫院端 Transfer Dashboard
"# ed-smartflow" 
