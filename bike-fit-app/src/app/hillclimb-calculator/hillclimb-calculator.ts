import { Component, OnInit, OnDestroy, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';

export const PRESET_COURSES = [
  { name: '富士ヒルクライム', segmentId: '664293' },
  { name: '乗鞍エコーライン', segmentId: '853124' },
  { name: '乗鞍スカイライン', segmentId: '7636376' },
  { name: 'ツール・ド・美ヶ原', segmentId: '4388741' },
];

interface VamTier {
  minVam: number;
  label: string;
  description: string;
}

interface HistoryEntry {
  id: string;
  dateLabel: string;
  segmentId: string;
  courseName: string;
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
  styleUrls: ['./hillclimb-calculator.css'],
})
export class HillclimbCalculator implements OnInit, OnDestroy {
  private http = inject(HttpClient);
  private cdr = inject(ChangeDetectorRef);

  presetCourses = PRESET_COURSES;
  selectedSegmentId = '';
  selectedCourseName = '';
  isLoadingCourse = false;

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
  private readonly G = 9.81;
  private readonly CRR = 0.005;
  private readonly DRIVETRAIN_EFFICIENCY = 0.97;

  private readonly VAM_TIERS: VamTier[] = [
    { minVam: 1800, label: 'プロ トップクライマー級', description: 'グランツール山岳ステージの逃げ切りペース' },
    { minVam: 1500, label: 'プロ・エリート級', description: 'プロレースの集団メイン走行に近いペース' },
    { minVam: 1200, label: '上級者（実業団・強豪アマチュア）', description: 'ヒルクライムレースの表彰台圏内クラス' },
    { minVam: 900, label: '中上級者', description: 'ヒルクライムレースの上位〜中位クラス' },
    { minVam: 600, label: '中級者', description: '一般的な完走ペース' },
    { minVam: 400, label: '一般的なサイクリスト', description: '無理のないペース' },
    { minVam: 0, label: 'のんびり・観光ペース', description: '景色を楽しみながらのペース' },
  ];

  private readonly HISTORY_STORAGE_KEY = 'bikefit-hillclimb-history';
  private readonly HISTORY_MAX_LENGTH = 10;

  history: HistoryEntry[] = [];

  // 入力のたびに履歴を保存すると増えすぎるため、入力が落ち着いてから1回だけ保存する
  private readonly HISTORY_SAVE_DEBOUNCE_MS = 1500;
  private historySaveTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    this.loadHistory();
  }

  ngOnDestroy(): void {
    if (this.historySaveTimer) {
      clearTimeout(this.historySaveTimer);
    }
  }

  /**
   * プルダウンでコースが選択された時の処理
   */
  onCourseChange(event?: Event): void {
    if (!this.selectedSegmentId) {
      this.selectedCourseName = '';
      return;
    }

    if (event?.target) {
      (event.target as HTMLElement).blur();
    }

    this.isLoadingCourse = true;
    this.errorMessage = '';

    const phpApiUrl = `api/get_segment.php?id=${this.selectedSegmentId}`;

    this.http.get<{ name: string; distanceKm: number; elevationGainM: number }>(phpApiUrl)
      .subscribe({
        next: (res) => {
          this.distanceKm = res.distanceKm;
          this.elevationGainM = res.elevationGainM;
          this.selectedCourseName = res.name || '選択コース';
          this.isLoadingCourse = false;

          // this.calculate();自動計算削除

          // 手動で画面描画を同期
          this.cdr.markForCheck();
          this.cdr.detectChanges();
        },
        error: () => {
          this.errorMessage = 'コースデータの取得に失敗しました。';
          this.isLoadingCourse = false;
          this.cdr.markForCheck();
          this.cdr.detectChanges();
        }
      });
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
      // 無視
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
      segmentId: this.selectedSegmentId,
      courseName: this.selectedCourseName || '手入力',
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

  /**
   * 履歴保存を予約する。入力欄を連続で編集している間は保存を先送りし続け、
   * 最後の変更から一定時間（1.5秒）操作がなかったときに1回だけ保存する。
   * これにより、1文字入力するたびに履歴が増えてしまうのを防ぐ。
   */
  private scheduleHistorySave(): void {
    if (this.historySaveTimer) {
      clearTimeout(this.historySaveTimer);
    }

    this.historySaveTimer = setTimeout(() => {
      this.historySaveTimer = null;
      this.saveToHistory();
    }, this.HISTORY_SAVE_DEBOUNCE_MS);
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
    this.selectedSegmentId = entry.segmentId;
    this.selectedCourseName = entry.segmentId ? entry.courseName : '';

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

    // this.scheduleHistorySave();
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