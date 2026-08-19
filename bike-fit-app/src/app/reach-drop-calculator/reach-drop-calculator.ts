import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

type RidingStyle = 'comfort' | 'sport' | 'race';

interface StyleCard {
  id: RidingStyle;
  name: string;
  description: string;
}

interface Range {
  min: number;
  max: number;
}

/** 履歴1件分のデータ構造 */
interface HistoryEntry {
  id: string;
  dateLabel: string;
  heightCm: number;
  torsoLengthCm: number;
  armLengthCm: number;
  saddleSetbackMm: number;
  ridingStyle: RidingStyle;
  ridingStyleName: string;
  reachRangeMm: Range;
  dropRangeCm: Range;
  diagonalRangeMm: Range;
}

@Component({
  selector: 'app-reach-drop-calculator',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './reach-drop-calculator.html',
  styleUrl: './reach-drop-calculator.css',
})
export class ReachDropCalculator implements OnInit {
  heightCm = 170;
  torsoLengthCm = 55;
  armLengthCm = 60;
  saddleSetbackMm = 50;

  ridingStyle: RidingStyle = 'sport';

  readonly styleOptions: StyleCard[] = [
    { id: 'comfort', name: '快適重視', description: '長距離やツーリング向け。上体を起こした楽な姿勢' },
    { id: 'sport', name: 'スポーツ', description: '一般的なロードバイクの標準的なポジション' },
    { id: 'race', name: 'レース', description: '空力・出力重視。前傾の強いポジション' },
  ];

  errorMessage = '';

  reachRangeMm: Range | null = null;
  dropRangeCm: Range | null = null;
  diagonalRangeMm: Range | null = null;

  // 身長からドロップの基準値を線形補間する範囲
  private readonly HEIGHT_MIN_CM = 150;
  private readonly HEIGHT_MAX_CM = 185;
  private readonly BASE_DROP_MIN_CM = 2.5;
  private readonly BASE_DROP_MAX_CM = 10;

  // スタイル別のドロップ倍率（レンジで持たせる）
  private readonly STYLE_DROP_MULTIPLIER: Record<RidingStyle, Range> = {
    comfort: { min: 0.6, max: 0.8 },
    sport: { min: 0.9, max: 1.1 },
    race: { min: 1.2, max: 1.4 },
  };

  // リーチの範囲式：セットバック＋胴の長さ×0.44〜0.52＋腕の長さ×0.28〜0.36
  // ※ 当初は「セットバック＋腕の長さ×係数」のみで計算していたが、
  //   実測値との比較で大きく乖離することが判明。複数のバイクフィット資料で
  //   「胴の長さ」がリーチの主要な決定要因とされていたため、追加して再検証した。
  private readonly REACH_TORSO_MULTIPLIER: Range = { min: 0.44, max: 0.52 };
  private readonly REACH_ARM_MULTIPLIER: Range = { min: 0.28, max: 0.36 };

  // ---- ここから履歴機能 ----

  private readonly HISTORY_STORAGE_KEY = 'bikefit-reach-drop-history';
  private readonly HISTORY_MAX_LENGTH = 20;

  history: HistoryEntry[] = [];

  ngOnInit(): void {
    this.loadHistory();
  }

  private loadHistory(): void {
    try {
      const raw = localStorage.getItem(this.HISTORY_STORAGE_KEY);
      this.history = raw ? JSON.parse(raw) : [];
    } catch {
      this.history = [];
    }
  }

  private persistHistory(): void {
    try {
      localStorage.setItem(this.HISTORY_STORAGE_KEY, JSON.stringify(this.history));
    } catch {
      // 容量オーバーなどは静かに無視する
    }
  }

  private saveToHistory(): void {
    if (!this.reachRangeMm || !this.dropRangeCm || !this.diagonalRangeMm) {
      return;
    }

    const styleOption = this.styleOptions.find((option) => option.id === this.ridingStyle);

    const entry: HistoryEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      dateLabel: new Date().toLocaleString('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }),
      heightCm: this.heightCm,
      torsoLengthCm: this.torsoLengthCm,
      armLengthCm: this.armLengthCm,
      saddleSetbackMm: this.saddleSetbackMm,
      ridingStyle: this.ridingStyle,
      ridingStyleName: styleOption ? styleOption.name : '',
      reachRangeMm: this.reachRangeMm,
      dropRangeCm: this.dropRangeCm,
      diagonalRangeMm: this.diagonalRangeMm,
    };

    this.history = [entry, ...this.history].slice(0, this.HISTORY_MAX_LENGTH);
    this.persistHistory();
  }

  removeHistoryEntry(id: string): void {
    this.history = this.history.filter((entry) => entry.id !== id);
    this.persistHistory();
  }

  clearHistory(): void {
    this.history = [];
    this.persistHistory();
  }

  /**
   * 履歴の1件をタップしたときに、その時の入力値・計算結果をフォームへ復元する。
   * 新しい履歴として保存し直すことはしない（重複を避けるため）。
   */
  restoreFromHistory(entry: HistoryEntry): void {
    this.heightCm = entry.heightCm;
    this.torsoLengthCm = entry.torsoLengthCm;
    this.armLengthCm = entry.armLengthCm;
    this.saddleSetbackMm = entry.saddleSetbackMm;
    this.ridingStyle = entry.ridingStyle;

    this.errorMessage = '';
    this.reachRangeMm = entry.reachRangeMm;
    this.dropRangeCm = entry.dropRangeCm;
    this.diagonalRangeMm = entry.diagonalRangeMm;
  }

  // ---- ここまで履歴機能 ----

  calculate(): void {
    this.errorMessage = '';

    if (this.heightCm < 140 || this.heightCm > 210) {
      this.errorMessage = '身長は140〜210cmの範囲で入力してください。';
      this.reachRangeMm = null;
      this.dropRangeCm = null;
      this.diagonalRangeMm = null;
      return;
    }

    if (this.torsoLengthCm < 40 || this.torsoLengthCm > 80) {
      this.errorMessage = '胴の長さは40〜80cmの範囲で入力してください。';
      this.reachRangeMm = null;
      this.dropRangeCm = null;
      this.diagonalRangeMm = null;
      return;
    }

    if (this.armLengthCm < 40 || this.armLengthCm > 90) {
      this.errorMessage = '腕の長さは40〜90cmの範囲で入力してください。';
      this.reachRangeMm = null;
      this.dropRangeCm = null;
      this.diagonalRangeMm = null;
      return;
    }

    this.reachRangeMm = this.calculateReachRangeMm(this.saddleSetbackMm, this.torsoLengthCm, this.armLengthCm);
    this.dropRangeCm = this.calculateDropRangeCm(this.heightCm, this.ridingStyle);
    this.diagonalRangeMm = this.calculateDiagonalRangeMm(this.reachRangeMm, this.dropRangeCm);

    this.saveToHistory();
  }

  /**
   * 水平リーチとドロップから、サドル先端〜ハンドル間を直線で測った場合の距離（斜辺）を求める。
   * 水平距離は水平器などがないと正確に測りにくいが、この直線距離ならメジャーを直接当てるだけで
   * 実測・答え合わせができるため、実用上こちらの数値の方が確認しやすい。
   */
  private calculateDiagonalRangeMm(reach: Range, dropCm: Range): Range {
    const dropMinMm = dropCm.min * 10;
    const dropMaxMm = dropCm.max * 10;

    return {
      min: Math.round(Math.sqrt(reach.min ** 2 + dropMinMm ** 2)),
      max: Math.round(Math.sqrt(reach.max ** 2 + dropMaxMm ** 2)),
    };
  }

  private calculateReachRangeMm(saddleSetbackMm: number, torsoLengthCm: number, armLengthCm: number): Range {
    const torsoLengthMm = torsoLengthCm * 10;
    const armLengthMm = armLengthCm * 10;

    return {
      min: Math.round(
        saddleSetbackMm +
          this.REACH_TORSO_MULTIPLIER.min * torsoLengthMm +
          this.REACH_ARM_MULTIPLIER.min * armLengthMm,
      ),
      max: Math.round(
        saddleSetbackMm +
          this.REACH_TORSO_MULTIPLIER.max * torsoLengthMm +
          this.REACH_ARM_MULTIPLIER.max * armLengthMm,
      ),
    };
  }

  private calculateBaseDropCm(heightCm: number): number {
    const clamped = Math.min(Math.max(heightCm, this.HEIGHT_MIN_CM), this.HEIGHT_MAX_CM);
    const ratio = (clamped - this.HEIGHT_MIN_CM) / (this.HEIGHT_MAX_CM - this.HEIGHT_MIN_CM);
    return this.BASE_DROP_MIN_CM + ratio * (this.BASE_DROP_MAX_CM - this.BASE_DROP_MIN_CM);
  }

  private calculateDropRangeCm(heightCm: number, style: RidingStyle): Range {
    const base = this.calculateBaseDropCm(heightCm);
    const multiplier = this.STYLE_DROP_MULTIPLIER[style];

    return {
      min: Math.round(base * multiplier.min * 10) / 10,
      max: Math.round(base * multiplier.max * 10) / 10,
    };
  }
}
