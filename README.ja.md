[ENGLISH](./README.md) | [日本語](./README.ja.md)
# ai-academic-paper-reviewer

生成AIを活用した学術論文レビューボットです。教員の視点から、学生の論文に対して教育的なフィードバックを提供します。

> **[Nasubikun/ai-reviewer](https://github.com/Nasubikun/ai-reviewer)をベースに開発** - 学術論文レビュー機能を追加・拡張しています。

## 使い方

`.github/workflows`ディレクトリに`academic-paper-review.yml`など任意の名前で以下のファイルを配置します：

```yaml
name: "Academic Paper Review"

permissions:
  pull-requests: write
  contents: read

on:
  pull_request:
    paths:
      - 'thesis/**/*.tex'
      - 'thesis/**/*.md'
      - 'paper/**/*.tex'
      - 'paper/**/*.md'
    types: [opened, synchronize, reopened]
  workflow_dispatch:

jobs:
  academic-review:
    runs-on: ubuntu-latest
    steps:
      - name: Academic Paper Review Bot
        uses: toshi0806/ai-academic-paper-reviewer@v1
        with:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
          LANGUAGE: "Japanese"
          EXCLUDE_PATHS: "*.bib,*.sty,*.cls,*.bbl,*.aux"
          MODEL_CODE: "models/gemini-2.0-flash"
          REVIEW_MODE: "ACADEMIC"
```

その後、リポジトリのGitHub Secretsに`GEMINI_API_KEY`としてGoogle AI StudioのGemini APIキーを設定してください。

## 機能

- **教育的フィードバック**: 経験豊富な教員の視点から建設的なフィードバックを提供
- **学術的観点**: 学術的正確性、論理的一貫性、研究の新規性、形式要件をレビュー
- **優先度レベル**: 
  - CRITICAL (🚨): 学術的に重大な誤りや論理的矛盾
  - IMPORTANT (📝): 論文の質に大きく影響する問題
  - SUGGESTION (💡): 論文をより良くするための改善提案
  - GOOD_POINT (✅): 優れた記述への称賛
- **カテゴリタグ**: フィードバックを観点別に分類（学術的正確性、構成、新規性、形式、文章品質）

## 設定

以下の環境変数を設定することで、レビューの動作を細かく制御できます：

| 環境変数名               | 必須      | デフォルト値                      | 説明                                                                                                                                                           |
|--------------------------|------------|----------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **EXCLUDE_PATHS**        | false       | -                                | レビューから除外したいファイルパスやディレクトリをカンマ区切りで指定します。例: `*.bib,*.sty,*.cls`<br>ここで指定されたパスに該当するファイルはレビューの対象外となります。                                    |
| **LANGUAGE**             | false       | `English`                        | AIが生成するフィードバックの言語を指定します（例: `Japanese`, `English`）。                                                                                                          |
| **MODEL_CODE**           | false       | `models/gemini-2.0-flash`    | 使用するGeminiモデルの指定です。AI Studioで利用できるモデルコードを設定してください。                                                                                             |
| **REVIEW_MODE**          | false       | `CODE`                           | レビューモード: 学術論文の場合は`ACADEMIC`、コードレビューの場合は`CODE`を指定。                                                                                              |
| **USE_SINGLE_COMMENT_REVIEW** | false | `false`                          | `true`に設定すると、1つのコメントにまとめてレビュー結果を投稿します。<br>`false`の場合は該当箇所に直接コメントを付けます。                                                              |

## 学術論文レビューの観点

このボットは以下の観点から論文をレビューします：

1. **学術的正確性と論理性**
   - 技術的な誤り、論理の飛躍、根拠不足な主張
   - 数式、図表、引用の適切性

2. **論文構成と表現**
   - 序論・本論・結論の構成
   - 段落構成と文章の流れ
   - 学術的な文体と用語の使用

3. **言語品質と可読性**
   - 文法、構文、文構造
   - 表現の明確性と簡潔性
   - 適切な語彙選択と専門用語の使用
   - 論文全体での文体の一貫性

4. **研究の新規性と貢献**
   - 既存研究との差異の明確化
   - 研究の意義と貢献の説明

5. **形式的な要件**
   - 引用形式の統一性
   - 図表の番号とキャプション
   - 参考文献リストの完全性

## APIキーの取得方法

1. [Google AI Studio](https://makersuite.google.com/app/apikey)にアクセス
2. Googleアカウントでログイン
3. 「Get API key」をクリック
4. 生成されたAPIキーをコピー
5. GitHubリポジトリの Settings → Secrets and variables → Actions
6. 「New repository secret」をクリック
7. Name: `GEMINI_API_KEY`、Value: コピーしたAPIキー

## サポートするファイル形式

- LaTeXファイル（`.tex`）
- Markdownファイル（`.md`）

## トラブルシューティング

### APIキーエラーが発生する場合
- GitHub Secretsに`GEMINI_API_KEY`が正しく設定されているか確認
- APIキーに誤字脱字がないか確認
- Google AI StudioでAPIキーが有効になっているか確認

### レビューが実行されない場合
- ファイルパスがトリガー条件に合致しているか確認
- `EXCLUDE_PATHS`で対象ファイルが除外されていないか確認
- GitHub Actionsが有効になっているか確認

## ライセンス

ISCライセンス - 詳細は[LICENSE](LICENSE)ファイルを参照してください。
