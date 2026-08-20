import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

interface VamTier {
  minVam: number;
  label: string;
  description: string;
}

/** 履歴1件分のデータ構造 */
interface HistoryEntry {
  id: string;
  dateLabel: string;
  riderWeightKg: number;
  bikeWeightKg: number;
  powerWatts: number;
  distanceKm: number;
  elevationGainM: number;
  gradientPercent: number;
  timeLabel: string;
  vam: number;
  tierLabel: string;
}

@Component({
  selector: 'app-hillclimb-calculator',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './hillclimb-calculator.html',
  styleUrl: './hillclimb-calculator.css',
})
export class HillclimbCalculator implements OnInit {
  riderWeightKg = 65;
  bikeWeightKg = 9;
  powerWatts = 200;
  distanceKm = 10;
  elevationGainM = 500;

  errorMessage = '';

  gradientPercent: number | null = null;
  timeLabel = '';
  timeSeconds = 0;
  vam: number | null = null;
  tier: VamTier | null = null;

  // 物理定数
  private readonly G = 9.81; // 重力加速度 (m/s^2)
  private readonly CRR = 0.005; // 転がり抵抗係数（舗装路の目安）
  private readonly DRIVETRAIN_EFFICIENCY = 0.97; // 駆動系の伝達効率

  // ※ 空気抵抗は計算に含めていない。急勾配の登坂では速度が低く、
  //   空気抵抗の影響が重力・転がり抵抗に比べて小さいための簡略化。
  //   緩斜面や向かい風が強い状況では、実際のタイムより短めに出る傾向がある。

  private readonly VAM_TIERS: VamTier[] = [
    { minVam: 1800, label: 'プロ トップクライマー級', description: 'グランツール山岳ステージの逃げ切りペース' },
    { minVam: 1500, label: 'プロ・エリート級', description: 'プロレースの集団メイン走行に近いペース' },
    { minVam: 1200, label: '上級者（実業団・強豪アマチュア）', description: 'ヒルクライムレースの表彰台圏内クラス' },
    { minVam: 900, label: '中上級者', description: 'ヒルクライムレースの上位〜中位クラス' },
    { minVam: 600, label: '中級者', description: '一般的な完走ペース' },
    { minVam: 400, label: '一般的なサイクリスト', description: '無理のないペース' },
    { minVam: 0, label: 'のんびり・観光ペース', description: '景色を楽しみながらのペース' },
  ];

  // ---- ここから履歴機能 ----

  private readonly HISTORY_STORAGE_KEY = 'bikefit-hillclimb-history';
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
    if (this.gradientPercent === null || this.vam === null || !this.tier) {
      return;
    }

    const entry: HistoryEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      dateLabel: new Date().toLocaleString('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }),
      riderWeightKg: this.riderWeightKg,
      bikeWeightKg: this.bikeWeightKg,
      powerWatts: this.powerWatts,
      distanceKm: this.distanceKm,
      elevationGainM: this.elevationGainM,
      gradientPercent: this.gradientPercent,
      timeLabel: this.timeLabel,
      vam: this.vam,
      tierLabel: this.tier.label,
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

  restoreFromHistory(entry: HistoryEntry): void {
    this.riderWeightKg = entry.riderWeightKg;
    this.bikeWeightKg = entry.bikeWeightKg;
    this.powerWatts = entry.powerWatts;
    this.distanceKm = entry.distanceKm;
    this.elevationGainM = entry.elevationGainM;

    this.errorMessage = '';
    this.gradientPercent = entry.gradientPercent;
    this.timeLabel = entry.timeLabel;
    this.vam = entry.vam;
    this.tier = this.VAM_TIERS.find((t) => t.label === entry.tierLabel) ?? null;
  }

  // ---- ここまで履歴機能 ----

  calculate(): void {
    this.errorMessage = '';

    if (this.riderWeightKg <= 0 || this.bikeWeightKg <= 0) {
      this.errorMessage = '体重と自転車の重量は0より大きい値を入力してください。';
      this.resetResult();
      return;
    }

    if (this.powerWatts <= 0 || this.powerWatts > 600) {
      this.errorMessage = '出力（パワー）は1〜600Wの範囲で入力してください。';
      this.resetResult();
      return;
    }

    if (this.distanceKm <= 0) {
      this.errorMessage = '距離は0より大きい値を入力してください。';
      this.resetResult();
      return;
    }

    if (this.elevationGainM < 0) {
      this.errorMessage = '標高差は0以上の値を入力してください。';
      this.resetResult();
      return;
    }

    const totalMassKg = this.riderWeightKg + this.bikeWeightKg;
    const distanceM = this.distanceKm * 1000;
    const theta = Math.atan(this.elevationGainM / distanceM);

    const speedMs =
      (this.powerWatts * this.DRIVETRAIN_EFFICIENCY) /
      (totalMassKg * this.G * (Math.sin(theta) + this.CRR * Math.cos(theta)));

    const timeSeconds = distanceM / speedMs;
    const vam = (this.elevationGainM * 3600) / timeSeconds;

    this.gradientPercent = Math.round((this.elevationGainM / distanceM) * 1000) / 10;
    this.timeSeconds = timeSeconds;
    this.timeLabel = this.formatTime(timeSeconds);
    this.vam = Math.round(vam);
    this.tier = this.VAM_TIERS.find((t) => vam >= t.minVam) ?? this.VAM_TIERS[this.VAM_TIERS.length - 1];

    this.saveToHistory();
  }

  private resetResult(): void {
    this.gradientPercent = null;
    this.timeLabel = '';
    this.timeSeconds = 0;
    this.vam = null;
    this.tier = null;
  }

  private formatTime(totalSeconds: number): string {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.round(totalSeconds % 60);

    if (hours > 0) {
      return `${hours}時間${minutes}分${seconds}秒`;
    }
    return `${minutes}分${seconds}秒`;
  }
}
