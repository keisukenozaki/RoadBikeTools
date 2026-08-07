import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

/** 履歴1件分のデータ構造 */
interface HistoryEntry {
  id: string;
  dateLabel: string; // 表示用の日時文字列
  methodId: string; // 復元時に計算方式を選択し直すためのID
  methodName: string;
  inseam: number;
  crankLength: number;
  saddleHeight: number;
  kneeAngle: number | null;
  kneeAdjustmentMm: number;
  kneeAdjustmentMessage: string;
  suggestedHeight: number;
}

@Component({
  selector: 'app-saddle-calculator',
  standalone: true,
  imports: [FormsModule, CommonModule],
  templateUrl: './saddle-calculator.html',
  styleUrl: './saddle-calculator.css',
})
export class SaddleCalculator implements OnInit {
  inseam = 0;

  crankLength = 170;

  saddleHeight = 0;

  errorMessage = '';

  calculationMethod = 'lemond';

  // 自転車図のシートチューブ上端Y座標（SVG座標系、スキーマ表示用）
  seatTopY = 70;

  // 膝角度による微調整
  kneeAngle: number | null = null;

  kneeAdjustmentMm = 0;

  kneeAdjustmentMessage = '';

  private readonly KNEE_ANGLE_MIN = 25; // 適正範囲の下限（度）

  private readonly KNEE_ANGLE_MAX = 35; // 適正範囲の上限（度）

  private readonly KNEE_ANGLE_TARGET = 30; // 目安の中心値（度）

  private readonly MM_PER_DEGREE = 1; // 経験則：膝角度1度の差 ≈ サドル高1mm

  methods = [
    {
      id: 'lemond',
      name: 'ルール・ルム式',
      description: 'ロードバイクで一般的な基準',
      coefficient: 0.883,
    },
    {
      id: 'allen',
      name: 'ハンター・アレン式',
      description: '少し高めの設定になる傾向',
      coefficient: 0.885,
    },
    {
      id: '109',
      name: '109%法',
      description: '股下から比率で算出',
      coefficient: 1.09,
    },
  ];

  // ---- ここから履歴機能 ----

  /** localStorageに保存するときのキー名 */
  private readonly HISTORY_STORAGE_KEY = 'bikefit-saddle-history';

  /** 履歴として保持できる最大件数（増えすぎ防止） */
  private readonly HISTORY_MAX_LENGTH = 20;

  history: HistoryEntry[] = [];

  ngOnInit(): void {
    this.loadHistory();
  }

  /** ブラウザのlocalStorageから履歴を読み込む */
  private loadHistory(): void {
    try {
      const raw = localStorage.getItem(this.HISTORY_STORAGE_KEY);
      this.history = raw ? JSON.parse(raw) : [];
    } catch {
      // 壊れたデータが入っていた場合などは履歴なしとして扱う
      this.history = [];
    }
  }

  /** 現在のhistory配列をlocalStorageに書き込む */
  private persistHistory(): void {
    try {
      localStorage.setItem(this.HISTORY_STORAGE_KEY, JSON.stringify(this.history));
    } catch {
      // 容量オーバーなど書き込み失敗時は静かに無視（履歴機能が使えないだけで、計算自体は継続できる）
    }
  }

  /** 計算結果を履歴の先頭に追加して保存する */
  private saveToHistory(method: { id: string; name: string }): void {
    const entry: HistoryEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      dateLabel: new Date().toLocaleString('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }),
      methodId: method.id,
      methodName: method.name,
      inseam: this.inseam,
      crankLength: this.crankLength,
      saddleHeight: this.saddleHeight,
      kneeAngle: this.kneeAngle,
      kneeAdjustmentMm: this.kneeAdjustmentMm,
      kneeAdjustmentMessage: this.kneeAdjustmentMessage,
      suggestedHeight: this.suggestedHeight,
    };

    this.history = [entry, ...this.history].slice(0, this.HISTORY_MAX_LENGTH);
    this.persistHistory();
  }

  /** 膝角度の微調整結果を、直近の履歴エントリに反映して保存し直す */
  private updateLatestHistoryWithKneeAdjustment(): void {
    if (this.history.length === 0) {
      return;
    }

    const [latest, ...rest] = this.history;

    const updated: HistoryEntry = {
      ...latest,
      kneeAngle: this.kneeAngle,
      kneeAdjustmentMm: this.kneeAdjustmentMm,
      kneeAdjustmentMessage: this.kneeAdjustmentMessage,
      suggestedHeight: this.suggestedHeight,
    };

    this.history = [updated, ...rest];
    this.persistHistory();
  }

  /** 履歴を1件削除する */
  removeHistoryEntry(id: string): void {
    this.history = this.history.filter((entry) => entry.id !== id);
    this.persistHistory();
  }

  /** 履歴を全件削除する */
  clearHistory(): void {
    this.history = [];
    this.persistHistory();
  }

  /**
   * 履歴の1件をタップしたときに、その時の入力値・計算結果をフォームへ復元する。
   * 新しい履歴として保存し直すことはしない（重複を避けるため）。
   */
  restoreFromHistory(entry: HistoryEntry): void {
    this.inseam = entry.inseam;
    this.crankLength = entry.crankLength;
    this.calculationMethod = entry.methodId;

    this.errorMessage = '';
    this.saddleHeight = entry.saddleHeight;
    this.seatTopY = this.mapHeightToY(entry.saddleHeight);

    // 膝角度の微調整も、履歴に保存されていればそのまま復元する
    this.kneeAngle = entry.kneeAngle;
    this.kneeAdjustmentMm = entry.kneeAdjustmentMm;
    this.kneeAdjustmentMessage = entry.kneeAdjustmentMessage;
  }

  // ---- ここまで履歴機能 ----

  calculate() {
    this.errorMessage = '';

    // 基本計算をやり直すたびに、膝角度の微調整結果はリセットする
    this.kneeAngle = null;
    this.kneeAdjustmentMm = 0;
    this.kneeAdjustmentMessage = '';

    if (this.inseam < 50 || this.inseam > 100) {
      this.errorMessage = '股下長は50〜100cmの範囲で入力してください。';

      this.saddleHeight = 0;

      return;
    }

    const method = this.methods.find((m) => m.id === this.calculationMethod);

    if (!method) {
      return;
    }

    let height = 0;

    if (method.id === '109') {
      height = this.inseam * method.coefficient;
    } else {
      height = this.inseam * method.coefficient;
    }

    // クランク長補正
    height -= (this.crankLength - 170) / 10;

    this.saddleHeight = Math.round(height * 10) / 10;

    this.seatTopY = this.mapHeightToY(this.saddleHeight);

    this.saveToHistory(method);
  }

  /**
   * 測定した膝角度から、サドル高の微調整量（mm）を計算する。
   * 目安：ペダル最下点での膝角度は25〜35度が適正範囲。
   * 経験則として、膝角度1度の差はサドル高およそ1mmに相当する。
   */
  adjustByKneeAngle() {
    if (this.kneeAngle == null || this.kneeAngle <= 0) {
      this.kneeAdjustmentMessage = '膝の角度を入力してください。';
      this.kneeAdjustmentMm = 0;

      return;
    }

    if (this.kneeAngle >= this.KNEE_ANGLE_MIN && this.kneeAngle <= this.KNEE_ANGLE_MAX) {
      this.kneeAdjustmentMm = 0;
      this.kneeAdjustmentMessage = '適正範囲内です。今の高さのままで問題ありません。';

      this.updateLatestHistoryWithKneeAdjustment();

      return;
    }

    const diff = this.kneeAngle - this.KNEE_ANGLE_TARGET;

    this.kneeAdjustmentMm = Math.round(diff * this.MM_PER_DEGREE);

    if (this.kneeAdjustmentMm > 0) {
      this.kneeAdjustmentMessage = `膝が伸びきっていないようです。サドルを約 ${this.kneeAdjustmentMm} mm 上げてみてください。`;
    } else {
      this.kneeAdjustmentMessage = `膝が伸びすぎているようです。サドルを約 ${Math.abs(this.kneeAdjustmentMm)} mm 下げてみてください。`;
    }

    this.updateLatestHistoryWithKneeAdjustment();
  }

  /** 膝角度の微調整を反映した、調整後のサドル高（cm） */
  get suggestedHeight(): number {
    return Math.round((this.saddleHeight + this.kneeAdjustmentMm / 10) * 10) / 10;
  }

  /**
   * サドル高（cm）を自転車図のY座標に変換する。
   * 実寸比ではなく、図の見やすさを優先したスキーマ表示用のスケール。
   */
  private mapHeightToY(heightCm: number): number {
    const minHeight = 60; // このcm以下は図の下限扱い
    const maxHeight = 100; // このcm以上は図の上限扱い

    const bottomY = 96; // サドル高が低いときのY座標（フレームのシート位置のすぐ上）
    const topY = 45; // サドル高が高いときのY座標

    const clamped = Math.min(Math.max(heightCm, minHeight), maxHeight);
    const ratio = (clamped - minHeight) / (maxHeight - minHeight);

    return bottomY - ratio * (bottomY - topY);
  }
}
