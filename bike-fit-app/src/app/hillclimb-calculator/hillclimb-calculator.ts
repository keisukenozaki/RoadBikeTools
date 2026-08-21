import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  ChangeDetectorRef
} from '@angular/core';

import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';

export const PRESET_COURSES = [
  { name: '富士ヒルクライム', segmentId: '664293' },
  { name: '乗鞍エコーライン', segmentId: '853124' },
  { name: '乗鞍スカイライン', segmentId: '7636376' },
  { name: 'ツール・ド・美ヶ原', segmentId: '4388741' },
];

interface PresetCourse {
  name: string;
  segmentId: string;
}

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
  private readonly INPUT_STORAGE_KEY = 'bikefit-hillclimb-inputs';

  presetCourses = PRESET_COURSES;

  selectedCourse: PresetCourse | null = null;

  selectedCourseName = '';
  stravaName = '';

  // Stravaから取得した勾配
  averageGrade: number | null = null;
  maximumGrade: number | null = null;

  isLoadingCourse = false;

  riderWeightKg = 65;
  bikeWeightKg = 9;
  powerWatts = 200;

  distanceKm = 10;
  elevationGainM = 500;

  powerIncreasePercent: number | null = null;
  reductionComment = '';
  reductionLevel = '';

  errorMessage = '';

  gradientPercent: number | null = null;

  timeLabel = '';
  timeSeconds = 0;

  vam: number | null = null;
  tier: VamTier | null = null;

  // ==========================================
  // タイム短縮シミュレーション
  // ==========================================

  targetImproveMinutes = 10;

  targetTimeSeconds: number | null = null;

  requiredPowerWatts: number | null = null;

  additionalPowerWatts: number | null = null;

  targetTimeLabel = '';

  // ==========================================
  // 物理定数
  // ==========================================

  private readonly G = 9.81;
  private readonly CRR = 0.005;
  private readonly DRIVETRAIN_EFFICIENCY = 0.97;

  private readonly VAM_TIERS: VamTier[] = [
    {
      minVam: 1800,
      label: 'プロ トップクライマー級',
      description: 'グランツール山岳ステージの逃げ切りペース'
    },
    {
      minVam: 1500,
      label: 'プロ・エリート級',
      description: 'プロレースの集団メイン走行に近いペース'
    },
    {
      minVam: 1200,
      label: '上級者（実業団・強豪アマチュア）',
      description: 'ヒルクライムレースの表彰台圏内クラス'
    },
    {
      minVam: 900,
      label: '中上級者',
      description: 'ヒルクライムレースの上位〜中位クラス'
    },
    {
      minVam: 600,
      label: '中級者',
      description: '一般的な完走ペース'
    },
    {
      minVam: 400,
      label: '一般的なサイクリスト',
      description: '無理のないペース'
    },
    {
      minVam: 0,
      label: 'のんびり・観光ペース',
      description: '景色を楽しみながらのペース'
    },
  ];

  // ==========================================
  // 履歴
  // ==========================================

  private readonly HISTORY_STORAGE_KEY =
    'bikefit-hillclimb-history';

  private readonly HISTORY_MAX_LENGTH = 10;

  history: HistoryEntry[] = [];

  private readonly HISTORY_SAVE_DEBOUNCE_MS = 1500;

  private historySaveTimer:
    ReturnType<typeof setTimeout> | null = null;

  // ==========================================
  // Lifecycle
  // ==========================================

  ngOnInit(): void {
    this.loadHistory();
    this.loadSavedInputs();
  }

  ngOnDestroy(): void {
    if (this.historySaveTimer) {
      clearTimeout(this.historySaveTimer);
    }
  }

  // ==========================================
  // コース選択
  // ==========================================

  onCourseChange(event?: Event): void {

    if (!this.selectedCourse) {

      this.selectedCourseName = '';
      this.stravaName = '';

      this.averageGrade = null;
      this.maximumGrade = null;

      return;
    }

    if (event?.target) {
      (event.target as HTMLElement).blur();
    }

    this.isLoadingCourse = true;
    this.errorMessage = '';

    const phpApiUrl =
      `api/get_segment.php` +
      `?id=${encodeURIComponent(this.selectedCourse.segmentId)}` +
      `&name=${encodeURIComponent(this.selectedCourse.name)}`;

    console.log('API URL:', phpApiUrl);

    this.http
      .get<{
        name: string;
        stravaName: string;
        averageGrade: number | null;
        maximumGrade: number | null;
        distanceKm: number;
        elevationGainM: number;
      }>(phpApiUrl)
      .subscribe({

        next: (res) => {

          console.log('API response:', res);

          this.distanceKm = res.distanceKm;
          this.elevationGainM = res.elevationGainM;

          this.selectedCourseName =
            res.name || this.selectedCourse?.name || '';

          this.stravaName =
            res.stravaName || '';

          this.averageGrade =
            res.averageGrade;

          this.maximumGrade =
            res.maximumGrade;

          this.isLoadingCourse = false;

          // コース変更時なので計算結果はリセット
          this.resetResult();

          this.cdr.markForCheck();
          this.cdr.detectChanges();
        },

        error: (err) => {

          console.error('API error:', err);

          this.errorMessage =
            'コースデータの取得に失敗しました。';

          this.isLoadingCourse = false;

          this.cdr.markForCheck();
          this.cdr.detectChanges();
        }
      });
  }

  // ==========================================
  // 計算
  // ==========================================

  calculate(): void {

    this.errorMessage = '';

    if (
      this.riderWeightKg <= 0 ||
      this.bikeWeightKg <= 0
    ) {
      this.errorMessage =
        '体重と自転車の重量は0より大きい値を入力してください。';

      this.resetResult();

      return;
    }

    if (
      this.powerWatts <= 0 ||
      this.powerWatts > 600
    ) {
      this.errorMessage =
        '出力（パワー）は1〜600Wの範囲で入力してください。';

      this.resetResult();

      return;
    }

    if (this.distanceKm <= 0) {

      this.errorMessage =
        '距離は0より大きい値を入力してください。';

      this.resetResult();

      return;
    }

    if (this.elevationGainM < 0) {

      this.errorMessage =
        '標高差は0以上の値を入力してください。';

      this.resetResult();

      return;
    }

    const totalMassKg =
      this.riderWeightKg +
      this.bikeWeightKg;

    const distanceM =
      this.distanceKm * 1000;

    const theta =
      Math.atan(
        this.elevationGainM / distanceM
      );

    const speedMs =
      (this.powerWatts * this.DRIVETRAIN_EFFICIENCY) /
      (
        totalMassKg *
        this.G *
        (
          Math.sin(theta) +
          this.CRR * Math.cos(theta)
        )
      );

    const timeSeconds =
      distanceM / speedMs;

    const vam =
      (this.elevationGainM * 3600) /
      timeSeconds;

    this.gradientPercent =
      Math.round(
        (this.elevationGainM / distanceM) * 1000
      ) / 10;

    this.timeSeconds =
      timeSeconds;

    this.timeLabel =
      this.formatTime(timeSeconds);

    this.vam =
      Math.round(vam);

    this.tier =
      this.VAM_TIERS.find(
        (t) => vam >= t.minVam
      ) ??
      this.VAM_TIERS[
      this.VAM_TIERS.length - 1
      ];

    // 「計算する」を押したときだけ入力値を保存
    this.saveInputs();

    // タイム短縮シミュレーション
    this.calculateTimeReduction();

    // 履歴保存
    this.saveToHistory();
  }

  // ==========================================
  // タイム短縮シミュレーション
  // ==========================================

  calculateTimeReduction(): void {

    if (
      this.timeSeconds <= 0 ||
      this.targetImproveMinutes <= 0
    ) {
      this.targetTimeSeconds = null;
      this.requiredPowerWatts = null;
      this.additionalPowerWatts = null;
      this.targetTimeLabel = '';

      return;
    }

    const improveSeconds =
      this.targetImproveMinutes * 60;

    const targetTime =
      this.timeSeconds - improveSeconds;

    // 現在タイムより短くならない場合
    if (targetTime <= 0) {

      this.targetTimeSeconds = null;
      this.requiredPowerWatts = null;
      this.additionalPowerWatts = null;
      this.targetTimeLabel = '';

      this.powerIncreasePercent = null;
      this.reductionComment = '';
      this.reductionLevel = '';

      return;
    }
    this.targetTimeSeconds = targetTime;
    this.targetTimeLabel = this.formatTime(targetTime);

    // ==========================================
    // 必要パワーを逆算
    // ==========================================

    const totalMassKg = this.riderWeightKg + this.bikeWeightKg;
    const distanceM = this.distanceKm * 1000;
    const theta = Math.atan(this.elevationGainM / distanceM);
    const requiredSpeedMs = distanceM / targetTime;

    const requiredPower =
      (
        requiredSpeedMs *
        totalMassKg *
        this.G *
        (
          Math.sin(theta) +
          this.CRR * Math.cos(theta)
        )
      ) /
      this.DRIVETRAIN_EFFICIENCY;

    this.requiredPowerWatts = Math.ceil(requiredPower);

    this.additionalPowerWatts =
      Math.ceil(
        requiredPower -
        this.powerWatts
      );

    // ==========================================
    // パワー増加率
    // ==========================================

    this.powerIncreasePercent =
      Math.round(
        (
          this.additionalPowerWatts /
          this.powerWatts
        ) * 1000
      ) / 10;

    // ==========================================
    // 頑張り度コメント
    // ==========================================

    this.setReductionComment();
  }

  private setReductionComment(): void {
    if (
      this.powerIncreasePercent === null ||
      this.additionalPowerWatts === null
    ) {
      this.reductionLevel = '';
      this.reductionComment = '';
      return;
    }

    const increase = this.powerIncreasePercent;

    if (increase <= 2) {
      this.reductionLevel = 'ちょっと頑張る';
      this.reductionComment =
        'あと少しのパワーアップで届きそうです。まずはこの目標から！';

    } else if (increase <= 5) {
      this.reductionLevel = 'もう一踏ん張り';
      this.reductionComment =
        '十分現実的な目標です。少しずつパワーアップを狙いましょう。';

    } else if (increase <= 10) {
      this.reductionLevel = 'しっかり頑張る';
      this.reductionComment =
        'それなりのパワーアップが必要です。トレーニングの成果が試されそうです。';

    } else if (increase <= 15) {
      this.reductionLevel = 'かなり頑張る';
      this.reductionComment =
        'なかなかの壁です。継続的なトレーニングでじっくり狙いたい目標です。';

    } else if (increase <= 20) {
      this.reductionLevel = '本気で頑張る';
      this.reductionComment =
        'かなり大きなパワーアップが必要です。短期間ではなく、じっくり取り組みたい目標です。';

    } else {
      this.reductionLevel = 'かなり高い壁';
      this.reductionComment =
        '大幅なパワーアップが必要です。まずは5分短縮など、段階的な目標から狙うのもおすすめです。';
    }
  }

  // ==========================================
  // 履歴
  // ==========================================

  private loadHistory(): void {
    try {
      const raw =
        localStorage.getItem(
          this.HISTORY_STORAGE_KEY
        );

      this.history =
        raw
          ? JSON.parse(raw)
          : [];

    } catch {

      this.history = [];
    }
  }

  private persistHistory(): void {

    try {

      localStorage.setItem(
        this.HISTORY_STORAGE_KEY,
        JSON.stringify(this.history)
      );

    } catch {
      // 無視
    }
  }

  private saveToHistory(): void {

    if (
      this.gradientPercent === null ||
      this.vam === null ||
      !this.tier
    ) {
      return;
    }

    const entry: HistoryEntry = {

      id:
        `${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 8)}`,

      dateLabel:
        new Date().toLocaleString(
          'ja-JP',
          {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          }
        ),

      segmentId:
        this.selectedCourse?.segmentId ?? '',

      courseName:
        this.selectedCourse?.name ||
        this.selectedCourseName ||
        '手入力',

      riderWeightKg:
        this.riderWeightKg,

      bikeWeightKg:
        this.bikeWeightKg,

      powerWatts:
        this.powerWatts,

      distanceKm:
        this.distanceKm,

      elevationGainM:
        this.elevationGainM,

      gradientPercent:
        this.gradientPercent,

      timeLabel:
        this.timeLabel,

      vam:
        this.vam,

      tierLabel:
        this.tier.label,
    };

    this.history =
      [entry, ...this.history]
        .slice(
          0,
          this.HISTORY_MAX_LENGTH
        );

    this.persistHistory();
  }

  removeHistoryEntry(id: string): void {

    this.history =
      this.history.filter(
        (entry) => entry.id !== id
      );

    this.persistHistory();
  }

  clearHistory(): void {

    this.history = [];

    this.persistHistory();
  }

  restoreFromHistory(
    entry: HistoryEntry
  ): void {

    this.selectedCourse =
      this.presetCourses.find(
        (course) =>
          course.segmentId === entry.segmentId
      ) ?? null;

    this.selectedCourseName =
      entry.courseName;

    this.riderWeightKg =
      entry.riderWeightKg;

    this.bikeWeightKg =
      entry.bikeWeightKg;

    this.powerWatts =
      entry.powerWatts;

    this.distanceKm =
      entry.distanceKm;

    this.elevationGainM =
      entry.elevationGainM;

    this.errorMessage = '';

    this.gradientPercent =
      entry.gradientPercent;

    this.timeLabel =
      entry.timeLabel;

    this.vam =
      entry.vam;

    this.tier =
      this.VAM_TIERS.find(
        (t) =>
          t.label === entry.tierLabel
      ) ?? null;

    // 履歴復元時にも短縮シミュレーションを計算
    this.calculateTimeReduction();
  }

  // ==========================================
  // 結果リセット
  // ==========================================

  private resetResult(): void {
    this.gradientPercent = null;
    this.timeLabel = '';
    this.timeSeconds = 0;
    this.vam = null;
    this.tier = null;
    this.targetTimeSeconds = null;
    this.requiredPowerWatts = null;
    this.additionalPowerWatts = null;
    this.targetTimeLabel = '';
  }

  // ==========================================
  // 時間フォーマット
  // ==========================================

  private formatTime(
    totalSeconds: number
  ): string {

    const hours =
      Math.floor(
        totalSeconds / 3600
      );

    const minutes =
      Math.floor(
        (totalSeconds % 3600) / 60
      );

    const seconds =
      Math.round(
        totalSeconds % 60
      );

    if (hours > 0) {

      return `${hours}時間${minutes}分${seconds}秒`;

    }

    return `${minutes}分${seconds}秒`;
  }

  private loadSavedInputs(): void {
    try {
      const raw = localStorage.getItem(this.INPUT_STORAGE_KEY);

      if (!raw) {
        return;
      }

      const saved = JSON.parse(raw);

      if (typeof saved.riderWeightKg === 'number') {
        this.riderWeightKg = saved.riderWeightKg;
      }

      if (typeof saved.bikeWeightKg === 'number') {
        this.bikeWeightKg = saved.bikeWeightKg;
      }

      if (typeof saved.powerWatts === 'number') {
        this.powerWatts = saved.powerWatts;
      }

    } catch {
      // 保存データが壊れていても初期値のまま使用
    }
  }

  private saveInputs(): void {
    try {
      localStorage.setItem(
        this.INPUT_STORAGE_KEY,
        JSON.stringify({
          riderWeightKg: this.riderWeightKg,
          bikeWeightKg: this.bikeWeightKg,
          powerWatts: this.powerWatts,
        })
      );
    } catch {
      // 保存できなくても計算には影響させない
    }
  }
}