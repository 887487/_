**https://887487.github.io/_/**
---
* スクリプト内で文字の左/中央/右揃え　セルの結合　を可能にしてください
* ホットスポットで遷移先なしで備考テキストのみの表示を可能にする
* 同一画像に対してホットスポットが追加されたとき、別パターンにも反映させる
---
ヒアリングタブ
* ボタン非表示条件が保存されない
* [🔒 組み込み]と[✏️ カスタム]の表示を削除（すべてadmin.htmlから編集可能な設計を想定しているため）
---
20260606追記
* admin.html ヒアリングタブ　インライン（リッチテキスト）で編集可能にする
---
20260618追記
* admin.html　ヒアリングタブ　対応方針のテキストが重複している
---
20260807追記
* ダークモードの配色を改善する
* サイドメニューから指定したExcelファイルを開く
---
20260809追記
* 読み込み高速化
* 別PCでadmin.htmlを開いたとき、画像ライブラリが空になっている（screen.html と パターン には反映されている）※jsonから個別で画面遷移をインポートすれば解消される
* ./screen-images　の画像数がライブラリ内の数より多い（なぜ？）

* 別PCからadmin.htmlを開いたとき、画像ライブラリが空になる
* 同じ画像に対して、別のIDを付与して./screen-images 内のファイルが無駄に増えていたりしないか
---
* 未分類に戻した後、フォルダを削除する　→　削除されていない
---
* "\\tohoku\share\拠点\仙台青葉\00_事業所\NGH\管理データ\SV\菅原\Ver4（作成中）\admin.html"へのフォルダアクセスが通らない
---
* メールテンプレにエラーメッセージを追加
* 画面遷移からのメールモーダルに対応方針を追加
* jsonインポート後、保存して反映 を実行しても ./screen-images に画像データが書き出されない
* 画像ライブラリが読み込まれない

* screen-image への書き出しはOK。画像ライブラリが 読み込み中… のまま。
common-utils.js:370 Uncaught DataError: Failed to execute 'put' on 'IDBObjectStore': The object store uses out-of-line keys and has no key generator and the key parameter was not provided.
admin.html:1 Unsafe attempt to load URL file:///C:/Users/z2253238/OneDrive%20-%20transcosmos%20inc/%E3%83%87%E3%82%B9%E3%82%AF%E3%83%88%E3%83%83%E3%83%97/%E7%9C%9F%E3%83%BB%E6%A5%AD%E5%8B%99%E3%83%84%E3%83%BC%E3%83%AB/Ver4%EF%BC%88%E4%BD%9C%E6%88%90%E4%B8%AD%EF%BC%89%E9%AB%98%E9%80%9F%E5%8C%96/admin.html from frame with URL file:///C:/Users/z2253238/OneDrive%20-%20transcosmos%20inc/%E3%83%87%E3%82%B9%E3%82%AF%E3%83%88%E3%83%83%E3%83%97/%E7%9C%9F%E3%83%BB%E6%A5%AD%E5%8B%99%E3%83%84%E3%83%BC%E3%83%AB/Ver4%EF%BC%88%E4%BD%9C%E6%88%90%E4%B8%AD%EF%BC%89%E9%AB%98%E9%80%9F%E5%8C%96/admin.html. 'file:' URLs are treated as unique security origins.




