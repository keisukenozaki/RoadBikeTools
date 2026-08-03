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
