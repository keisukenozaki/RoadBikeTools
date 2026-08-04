import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-saddle-calculator',
  standalone: true,
  imports: [FormsModule, CommonModule],
  templateUrl: './saddle-calculator.html',
  styleUrl: './saddle-calculator.css',
})
export class SaddleCalculator {
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

      return;
    }

    const diff = this.kneeAngle - this.KNEE_ANGLE_TARGET;

    this.kneeAdjustmentMm = Math.round(diff * this.MM_PER_DEGREE);

    if (this.kneeAdjustmentMm > 0) {
      this.kneeAdjustmentMessage = `膝が伸びきっていないようです。サドルを約 ${this.kneeAdjustmentMm} mm 上げてみてください。`;
    } else {
      this.kneeAdjustmentMessage = `膝が伸びすぎているようです。サドルを約 ${Math.abs(this.kneeAdjustmentMm)} mm 下げてみてください。`;
    }
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
