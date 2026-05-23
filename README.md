https://887487.github.io/_/
* PC1で作成したデータをPC2でも閲覧可能な設計にしてください（サーバーやクラウドサービスは使用不可）
* 別PCで添付ファイルをDLしようとしたとき「ファイルが見つかりません（ID: smf_1777869879886_k6k2om）」となる
* ヘッダーの[スクリプト]を押下すると index.html が開くため、script.html を開くように mail.html screen.html admin.html を修正してください
* スクリプト内で文字の左/中央/右揃え　セルの結合　を可能にしてください
* スクリプト/メール/画面遷移/ヒアリング/サイドメニュー/更新履歴　のデータを更新した時、別PCでもページ更新で自動反映にできますか？
* 「オープニングトーク」「クロージングトーク」「ヒアリング」「サイドメニュー」「更新履歴」の個別の保存ボタンを廃止し、ヘッダーの[保存して反映]に集約する
* admin.html サイドメニュータブ　で添付ファイルのみの削除を可能にしてください
* admin.html ヒアリングタブ フィールド名は不要
* data.js が自動読み込みなら、スクリプト　メール　画面遷移　画像ライブラリ　のデータもjsで管理したい(jsonを使用しない)
* 機能の追加をバッチファイルで実装したい
* 
* admin.html 保存して反映　ファイルのエクスポートに失敗する
* 
* admin.html スクリプトタブ　「オープニングトーク」「クロージングトーク」の変更後、保存を押下しても反映されない
* admin.html メールタブ　左サイドバーは「件名」「テンプレート名」で表示する
* admin.html 画面遷移タブ　Excelインポート のボタンを廃止
* admin.html サイドメニュータブ で添付ファイルの設定を行う仕様に変更（URL欄にファイルをD&D　もしくは、📎ボタンからファイルを追加）
* admin.html サイドメニュータブ 有効無効のトグルを削除
* jsonから画面遷移データが読み込みされない
* mail.html からコピー機能を廃止

*SOD用　フォネティックコードの表の列削除　ExcelのDL　アコーディオン追加


* ヒアリング欄にメモ機能

* screen.html メールモーダルボタンを画像上部に並べて表示する
  
* admin.html 起動時に、JSファイルとjsonファイルを指定する
* admin.html スクリプトタブ：固定表示(オープニング/クロージング)の文言変更に対応。太字/赤字/太赤字/既に追加されている表をインラインで表示・編集する仕様に変更。
* admin.html 画面遷移タブ：メールモーダルボタンでメールテンプレートが選択できない。
* admin.html サイドメニュータブ：JSファイルに書き込む が無効。
* admin.html ヒアリングタブ：過去のデータから内容を復元し、common-utils.js にデータを直接書き込む仕様に変更。
* admin.html 更新履歴タブ：common-utils.js にデータを直接書き込む。

*  ///
*  メールモーダルのボタンを画像横で縦に並べる（反映されているか未確認）
*  ///
*  ツールチップの表示サイズを画像表示サイズに依存せず、サイズ固定で表示する
*  ホットスポットで遷移先なしで備考テキストのみの表示を可能にする
*   ツールチップを表示する




【admin.html】
	スクリプト/メール/画面遷移/画像ライブラリ/ヒアリング/サイドメニュー/ヒアリング/更新履歴 のjson個別エクスポート、個別インポート、統合エクスポートに対応

【サイドメニュー内】
	ツールのリンク横にマニュアルのPDFをブラウザ上で閲覧するボタンを表示

【】

🔧 ツール
	Genesys（https://login.mypurecloud.jp/#/authenticate-adv/org/tci-gp1）
	Trans-CRM（https://ctssvr501.cloud.contact-link.jp/cts_nhk_net/login/index.php）
	LINE WORKS（https://talk.worksmobile.com/#/）
	対話要約AI（https://tci-dcc-support-summaryai02.spiral-site.com/summary_nhk）
	SpeechVisualizer（http://tci-ami-web16/SpeechVisualizer/）
	新Transpeech（https://transpeech.jp/login）
	
📄 資料
	NHKONE 関連資料
		コールセンターについて（file://tohoku/share/拠点/仙台青葉/00_事業所/NGH/業務資料/マニュアル関連/NHK ONE 関連資料/【NHK ONE】コールセンターについて_20260410.pdf）
		サービス概要・世帯での利用（file://tohoku/share/拠点/仙台青葉/00_事業所/NGH/業務資料/マニュアル関連/NHK ONE 関連資料/【NHK ONE】サービス概要・世帯での利用_20250908.pdf）
		学校での利用（file://tohoku/share/拠点/仙台青葉/00_事業所/NGH/業務資料/マニュアル関連/NHK ONE 関連資料/【NHK ONE】学校での利用_20260102.pdf）
		事業での利用（file://tohoku/share/拠点/仙台青葉/00_事業所/NGH/業務資料/マニュアル関連/NHK ONE 関連資料/【NHK ONE】事業での利用_20250904.pdf）
		ユーザーお困りポイント（file://tohoku/share/拠点/仙台青葉/00_事業所/NGH/業務資料/マニュアル関連/NHK ONE 関連資料/【世帯アカウント】ユーザーお困りポイント_20250908.pdf）
		アカウント登録導線説明資料（file://tohoku/share/拠点/仙台青葉/00_事業所/NGH/業務資料/マニュアル関連/NHK ONE 関連資料/【NHK ONE】アカウント登録導線説明資料.pdf）
		受信料アカウント全国説明会資料（file://tohoku/share/拠点/仙台青葉/00_事業所/NGH/業務資料/マニュアル関連/NHK ONE 関連資料/【確定版】20251110_受信料アカウント全国説明会資料_1117修正.pdf）
		J→S転送対応フロー（file://tohoku/share/拠点/仙台青葉/00_事業所/NGH/業務資料/マニュアル関連/NHK ONE 関連資料/S⇔J転送/J→S転送受け/【NGH版】J→S転送受けフロー_20260520.pdf）
		S→J転送対応フロー（file://tohoku/share/拠点/仙台青葉/00_事業所/NGH/業務資料/マニュアル関連/NHK ONE 関連資料/S⇔J転送/S→J転送/【NGH用】S→J転送対応フロー_20260520.pdf）
		PW+ログインID忘れのユーザー対応（file://tohoku/share/拠点/仙台青葉/00_事業所/NGH/業務資料/マニュアル関連/NHK ONE 関連資料/【NGH版】PW+ログインID忘れのユーザー対応.pdf）

	応対品質
		クレーム対応のポイント（file://tohoku/share/拠点/仙台青葉/00_事業所/NGH/業務資料/マニュアル関連/応対品質/クレーム対応のポイント.pdf）
		わかりやすい伝え方・話し方（ロジカルシンキング）（file://tohoku/share/拠点/仙台青葉/00_事業所/NGH/業務資料/マニュアル関連/応対品質/わかりやすい伝え方・話し方（ロジカルシンキング）.pdf）
		高齢者対応（file://tohoku/share/拠点/仙台青葉/00_事業所/NGH/業務資料/マニュアル関連/応対品質/高齢者対応.pdf）

	研修
		【NGH】事業所紹介（file://tohoku/share/拠点/仙台青葉/00_事業所/NGH/業務資料/マニュアル関連/【NGH】事業所紹介_20260401.pdf）
		【NGH】CMマニュアル（file://tohoku/share/拠点/仙台青葉/00_事業所/NGH/業務資料/マニュアル関連/【NGH】CMマニュアル_20260430.pdf）
		【LINE WORKS】インストールと活用方法（file://tohoku/share/拠点/仙台青葉/00_事業所/NGH/業務資料/マニュアル関連/各種ツール/【LINE WORKS】インストールと活用方法.pdf）
		【NGH】Genesys Cloud利用マニュアル（file://tohoku/share/拠点/仙台青葉/00_事業所/NGH/業務資料/マニュアル関連/各種ツール/【NGH】Genesys Cloud利用マニュアル_20251029.pdf）
		【NGH】対話要約AIマニュアル（file://tohoku/share/拠点/仙台青葉/00_事業所/NGH/業務資料/マニュアル関連/各種ツール/【NGH】対話要約AIマニュアル_20250819.pdf）
		【trans-CRM】利用マニュアル（file://tohoku/share/拠点/仙台青葉/00_事業所/NGH/業務資料/マニュアル関連/各種ツール/【trans-CRM】利用マニュアル_20260410.pdf）
		【transpeech】AmiVoice Operator Agent利用マニュアル（file://tohoku/share/拠点/仙台青葉/00_事業所/NGH/業務資料/マニュアル関連/各種ツール/【transpeech】AmiVoice Operator Agent利用マニュアル.pdf）
		【新transpeech】マニュアル（file://tohoku/share/拠点/仙台青葉/00_事業所/NGH/業務資料/マニュアル関連/各種ツール/【新transpeech】マニュアル_20260317_軽量版.pdf）

🌐 関連サイト
	NHK HP（https://www.nhk.or.jp/）
	NHKONEインフォメーション（https://www.nhk.or.jp/nhkone/）
	ヘルプセンター（https://www.nhk.or.jp/nhkone/help/）
	NHK for school（https://www.nhk.or.jp/school/）
	全国のNHK放送局（https://www.nhk.or.jp/info/pr/nationwide-nhk/）
	各放送局営業窓口一覧（https://www.nhk-cs.jp/jushinryo/menjo/window.html
	学校コード検索HP（https://edu-data.jp/）
	郵便局HP（https://www.post.japanpost.jp/zipcode/index.html）
