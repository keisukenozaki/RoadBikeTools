import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

type SurfaceType = 'paved' | 'rough' | 'gravel';
type TireType = 'tubeless' | 'clincher' | 'tubular';

interface OptionCard<T extends string> {
  id: T;
  name: string;
  description: string;
}

@Component({
  selector: 'app-tire-pressure-calculator',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './tire-pressure-calculator.html',
  styleUrl: './tire-pressure-calculator.css',
})
export class TirePressureCalculator {
  riderWeightKg = 65;
  bikeWeightKg = 9;
  tireWidthMm = 28;

  isWet = false;
  isHookless = false;

  surface: SurfaceType = 'paved';
  tireType: TireType = 'clincher';

  errorMessage = '';

  frontPsi = 0;
  rearPsi = 0;
  cappedByHookless = false;

  readonly surfaceOptions: OptionCard<SurfaceType>[] = [
    { id: 'paved', name: '舗装路', description: '通常のアスファルト路面' },
    { id: 'rough', name: '荒れた路面', description: 'ひび割れ・段差が多い路面' },
    { id: 'gravel', name: 'グラベル', description: '砂利道・未舗装路' },
  ];

  readonly tireTypeOptions: OptionCard<TireType>[] = [
    { id: 'tubeless', name: 'チューブレス', description: 'リム打ちに強く、低めの圧でも走れる' },
    { id: 'clincher', name: 'クリンチャー', description: 'チューブ入りの一般的なタイヤ' },
    { id: 'tubular', name: 'チューブラー', description: 'リムに接着するタイプ' },
  ];

  // 前後の荷重配分
  private readonly FRONT_RATIO = 0.45;
  private readonly REAR_RATIO = 0.55;

  // 荷重とタイヤ幅から空気圧を導くための係数
  private readonly PRESSURE_CONSTANT = 2.25;

  private readonly SURFACE_ADJUSTMENT_PSI: Record<SurfaceType, number> = {
    paved: 0,
    rough: -5,
    gravel: -10,
  };

  private readonly TIRE_TYPE_ADJUSTMENT_PSI: Record<TireType, number> = {
    tubeless: -5,
    clincher: 0,
    tubular: 5,
  };

  private readonly WET_ADJUSTMENT_PSI = -5;

  // リム打ちパンク防止のための下限
  private readonly MIN_PRESSURE_PSI = 30;

  // フックレスリムのETRTO規定上限（5bar）
  private readonly HOOKLESS_MAX_PRESSURE_PSI = 72.5;

  calculate(): void {
    this.errorMessage = '';

    if (this.riderWeightKg <= 0 || this.bikeWeightKg <= 0) {
      this.errorMessage = '体重と自転車の重量は0より大きい値を入力してください。';
      this.frontPsi = 0;
      this.rearPsi = 0;
      return;
    }

    if (this.tireWidthMm < 18 || this.tireWidthMm > 65) {
      this.errorMessage = 'タイヤ幅は18〜65mmの範囲で入力してください。';
      this.frontPsi = 0;
      this.rearPsi = 0;
      return;
    }

    const totalWeightKg = this.riderWeightKg + this.bikeWeightKg;

    let adjustment = this.SURFACE_ADJUSTMENT_PSI[this.surface] + this.TIRE_TYPE_ADJUSTMENT_PSI[this.tireType];

    if (this.isWet) {
      adjustment += this.WET_ADJUSTMENT_PSI;
    }

    const rawFront = this.calculateBasePressure(totalWeightKg, this.FRONT_RATIO) + adjustment;
    const rawRear = this.calculateBasePressure(totalWeightKg, this.REAR_RATIO) + adjustment;

    this.frontPsi = Math.round(this.clamp(rawFront));
    this.rearPsi = Math.round(this.clamp(rawRear));

    this.cappedByHookless =
      this.isHookless &&
      (rawFront > this.HOOKLESS_MAX_PRESSURE_PSI || rawRear > this.HOOKLESS_MAX_PRESSURE_PSI);
  }

  /** psiをbarに変換する（表示用） */
  toBar(psi: number): number {
    return Math.round(psi * 0.0689476 * 10) / 10;
  }

  private calculateBasePressure(totalWeightKg: number, ratio: number): number {
    return (totalWeightKg * ratio * this.PRESSURE_CONSTANT) / (this.tireWidthMm / 25);
  }

  private clamp(psi: number): number {
    const withFloor = Math.max(psi, this.MIN_PRESSURE_PSI);

    if (this.isHookless) {
      return Math.min(withFloor, this.HOOKLESS_MAX_PRESSURE_PSI);
    }

    return withFloor;
  }
}
