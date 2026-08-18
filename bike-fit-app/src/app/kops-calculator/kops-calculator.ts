import { Component, ElementRef, ViewChild, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

/** 写真上の1点（SVG座標系 0-300 x 0-400） */
interface Point {
  x: number;
  y: number;
}

/** タップ順序の1ステップ */
interface TapStep {
  key: 'knee' | 'pedal' | 'bb';
  label: string;
}

/** 履歴1件分のデータ構造（写真そのものは保存しない） */
interface KopsHistoryEntry {
  id: string;
  dateLabel: string;
  crankLength: number;
  offsetMm: number;
  judgementMessage: string;
  judgementStatus: 'ok' | 'front' | 'back';
}

@Component({
  selector: 'app-kops-calculator',
  standalone: true,
  imports: [FormsModule, CommonModule],
  templateUrl: './kops-calculator.html',
  styleUrl: './kops-calculator.css',
})
export class KopsCalculator {
  @ViewChild('stage') stageRef!: ElementRef<HTMLDivElement>;

  /** アップロードした写真の実サイズ（object-fit: coverのトリミング量を計算するために使用） */
  private imgNaturalWidth = 0;
  private imgNaturalHeight = 0;

  /** クランク長（mm）。ペダル軸〜BB軸間のキャリブレーション基準として使用 */
  crankLength = 170;

  /** アップロードした写真のデータURL */
  photoDataUrl: string | null = null;

  /** タップ順序の定義：膝 → ペダル軸 → BB軸 */
  readonly steps: TapStep[] = [
    { key: 'knee', label: 'STEP 1/3：膝の位置をタップしてください' },
    { key: 'pedal', label: 'STEP 2/3：ペダル軸の位置をタップしてください' },
    { key: 'bb', label: 'STEP 3/3：BB軸（クランクの付け根）をタップしてください' },
  ];

  /** 現在何番目のステップか（steps.lengthに達したら全指定完了） */
  stepIndex = 0;

  points: { knee: Point | null; pedal: Point | null; bb: Point | null } = {
    knee: null,
    pedal: null,
    bb: null,
  };

  /** 拡大鏡（虫眼鏡）の表示状態 */
  loupeVisible = false;
  loupeLeft = 0;
  loupeTop = 0;
  loupeBgSize = '0px 0px';
  loupeBgPosition = '0px 0px';

  private readonly LOUPE_ZOOM = 2.5;
  private readonly LOUPE_SIZE = 110;

  /** 計算結果 */
  offsetMm: number | null = null;
  judgementMessage = '';
  judgementStatus: 'ok' | 'front' | 'back' | null = null;
  calibrationNote = '';
  errorMessage = '';

  private readonly OFFSET_THRESHOLD_MM = 5; // 適正範囲の許容幅（固定値）

  // ---- ここから履歴機能 ----

  private readonly HISTORY_STORAGE_KEY = 'bikefit-kops-history';
  private readonly HISTORY_MAX_LENGTH = 20;

  history: KopsHistoryEntry[] = [];

  constructor(private cdr: ChangeDetectorRef) {
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
    if (this.offsetMm === null || this.judgementStatus === null) {
      return;
    }

    const entry: KopsHistoryEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      dateLabel: new Date().toLocaleString('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }),
      crankLength: this.crankLength,
      offsetMm: this.offsetMm,
      judgementMessage: this.judgementMessage,
      judgementStatus: this.judgementStatus,
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

  // ---- ここまで履歴機能 ----

  get currentStepLabel(): string {
    if (this.stepIndex < this.steps.length) {
      return this.steps[this.stepIndex].label;
    }
    return 'すべての位置を指定しました';
  }

  get allPointsSet(): boolean {
    return !!(this.points.knee && this.points.pedal && this.points.bb);
  }

  /**
   * クランク長の入力欄が変更されたときのハンドラー（入力を終えて確定したタイミングで発火）。
   * 3点がすでに確定済み（＝計算済み）であれば、新しいクランク長で再計算する。
   */
  onCrankLengthChange(): void {
    if (this.allPointsSet) {
      this.calculate();
    }
  }

  /** ひとつ前の点に戻せるかどうか（写真がある & 1点以上確定済み） */
  get canUndo(): boolean {
    return !!this.photoDataUrl && this.stepIndex > 0;
  }

  /**
   * 直前に確定した点を取り消して、1つ前のステップに戻る。
   * 3点すべて確定済み（＝計算済み）の状態から戻る場合は、
   * その時点の計算結果と、自動保存された履歴の最新1件も一緒に取り消す。
   */
  undoLastPoint(): void {
    if (!this.canUndo) {
      return;
    }

    const wasComplete = this.stepIndex >= this.steps.length;

    this.stepIndex--;
    const key = this.steps[this.stepIndex].key;
    this.points[key] = null;

    if (wasComplete) {
      // calculate()がsaveToHistory()まで実行済みのため、その1件を取り消す
      if (this.history.length > 0) {
        this.history = this.history.slice(1);
        this.persistHistory();
      }

      this.offsetMm = null;
      this.judgementMessage = '';
      this.judgementStatus = null;
      this.calibrationNote = '';
    }

    this.errorMessage = '';
    this.loupeVisible = false;
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    this.errorMessage = '';

    const reader = new FileReader();
    reader.onload = () => {
      this.photoDataUrl = reader.result as string;
      this.resetPoints();
      this.cdr.detectChanges();
    };
    reader.onerror = () => {
      this.errorMessage = '写真の読み込みに失敗しました。もう一度お試しください。';
    };
    reader.readAsDataURL(file);
  }

  /** <img>の読み込み完了時に、object-fit: cover計算用の実サイズを保持する */
  onPhotoLoad(event: Event): void {
    const img = event.target as HTMLImageElement;
    this.imgNaturalWidth = img.naturalWidth;
    this.imgNaturalHeight = img.naturalHeight;
  }

  /** ステージ上のクリック／タップ位置を、SVG座標系（0-300, 0-400）に変換する */
  private toStageCoords(clientX: number, clientY: number): Point | null {
    if (!this.stageRef) {
      return null;
    }
    const rect = this.stageRef.nativeElement.getBoundingClientRect();
    const relX = clientX - rect.left;
    const relY = clientY - rect.top;
    if (relX < 0 || relY < 0 || relX > rect.width || relY > rect.height) {
      return null;
    }
    return {
      x: (relX / rect.width) * 300,
      y: (relY / rect.height) * 400,
    };
  }

  onStageMouseUp(event: MouseEvent): void {
    this.finalizePoint(event.clientX, event.clientY);
  }

  onStageTouchEnd(event: TouchEvent): void {
    // 指を離した瞬間の座標は changedTouches から取得する
    const touch = event.changedTouches[0];
    if (touch) {
      this.finalizePoint(touch.clientX, touch.clientY);
    }
  }

  /**
   * スライドして指/マウスを離した瞬間に座標を決定する共通処理
   */
  private finalizePoint(clientX: number, clientY: number): void {
    if (!this.photoDataUrl || this.stepIndex >= this.steps.length) {
      return;
    }
    const point = this.toStageCoords(clientX, clientY);
    if (!point) {
      return;
    }

    const key = this.steps[this.stepIndex].key;
    this.points[key] = point;
    this.stepIndex++;

    // 指を離したタイミングでルーペを非表示にする
    this.loupeVisible = false;

    if (this.stepIndex >= this.steps.length) {
      this.calculate();
    }
  }

  onStageMove(clientX: number, clientY: number): void {
    if (
      !this.photoDataUrl ||
      this.stepIndex >= this.steps.length ||
      !this.stageRef ||
      !this.imgNaturalWidth ||
      !this.imgNaturalHeight
    ) {
      this.loupeVisible = false;
      return;
    }

    const rect = this.stageRef.nativeElement.getBoundingClientRect();
    const relX = clientX - rect.left;
    const relY = clientY - rect.top;

    if (relX < 0 || relY < 0 || relX > rect.width || relY > rect.height) {
      this.loupeVisible = false;
      return;
    }

    // <img>のobject-fit: coverと同じ拡大率・トリミング量を計算する。
    // これをしないと、画像の縦横比と表示枠(3:4)がズレたときに
    // 「見えている場所」と「虫眼鏡が拡大している場所」がずれてしまう。
    const containerRatio = rect.width / rect.height;
    const imageRatio = this.imgNaturalWidth / this.imgNaturalHeight;

    let coverScale: number;
    let cropOffsetX = 0;
    let cropOffsetY = 0;

    if (imageRatio > containerRatio) {
      // 画像の方が横長 → 高さを基準に合わせ、左右がトリミングされる
      coverScale = rect.height / this.imgNaturalHeight;
      cropOffsetX = (this.imgNaturalWidth * coverScale - rect.width) / 2;
    } else {
      // 画像の方が縦長 → 幅を基準に合わせ、上下がトリミングされる
      coverScale = rect.width / this.imgNaturalWidth;
      cropOffsetY = (this.imgNaturalHeight * coverScale - rect.height) / 2;
    }

    // コンテナ上のクリック位置を、トリミング前の「cover表示された画像」上の座標に変換
    const coverX = relX + cropOffsetX;
    const coverY = relY + cropOffsetY;

    this.loupeVisible = true;
    this.loupeLeft = relX - this.LOUPE_SIZE / 2;
    this.loupeTop = relY - this.LOUPE_SIZE - 20; // 指・カーソルの少し上に表示
    this.loupeBgSize = `${this.imgNaturalWidth * coverScale * this.LOUPE_ZOOM}px ${this.imgNaturalHeight * coverScale * this.LOUPE_ZOOM}px`;
    this.loupeBgPosition = `${-(coverX * this.LOUPE_ZOOM - this.LOUPE_SIZE / 2)}px ${-(coverY * this.LOUPE_ZOOM - this.LOUPE_SIZE / 2)}px`;
  }

  onStageMouseMove(event: MouseEvent): void {
    this.onStageMove(event.clientX, event.clientY);
  }

  onStageTouchMove(event: TouchEvent): void {
    const touch = event.touches[0];
    if (touch) {
      this.onStageMove(touch.clientX, touch.clientY);
    }
  }

  onStageLeave(): void {
    this.loupeVisible = false;
  }

  private distance(a: Point, b: Point): number {
    return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
  }

  /** 3点とクランク長から、キャリブレーション込みでオフセット(mm)を計算する */
  private calculate(): void {
    const { knee, pedal, bb } = this.points;
    if (!knee || !pedal || !bb) {
      return;
    }

    if (this.crankLength <= 0) {
      this.errorMessage = 'クランク長を正しく入力してください。';
      return;
    }

    const crankPx = this.distance(bb, pedal);
    if (crankPx < 1) {
      this.errorMessage = 'ペダル軸とBB軸の位置が近すぎます。指定し直してください。';
      return;
    }

    const scale = this.crankLength / crankPx; // 1pxあたりのmm
    this.calibrationNote = `キャリブレーション：クランク ${crankPx.toFixed(1)}px = ${this.crankLength}mm（1px ≈ ${scale.toFixed(2)}mm）`;

    // BB軸→ペダル軸のベクトルが「前方向」を表す（クランクを3時位置＝水平・前向きにして撮影するため）。
    // これを基準に前後を判定することで、写真がどちら向きに撮影されていても正しく判定できる。
    const forwardSign = pedal.x - bb.x >= 0 ? 1 : -1;
    const forwardOffsetPx = (knee.x - pedal.x) * forwardSign;
    const mm = Math.round(forwardOffsetPx * scale);
    this.offsetMm = mm;

    const absMm = Math.abs(mm);
    if (absMm <= this.OFFSET_THRESHOLD_MM) {
      this.judgementStatus = 'ok';
      this.judgementMessage = '適正範囲です。このままの位置で問題ありません。';
    } else if (mm > 0) {
      // 膝がペダル軸より前 → サドルを後ろに動かして膝を後退させる
      this.judgementStatus = 'front';
      this.judgementMessage = `膝がペダル軸より前に出ています。サドルを約 ${absMm}mm 後ろに動かしてみてください。`;
    } else {
      // 膝がペダル軸より後ろ → サドルを前に動かして膝を前進させる
      this.judgementStatus = 'back';
      this.judgementMessage = `膝がペダル軸より後ろにあります。サドルを約 ${absMm}mm 前に動かしてみてください。`;
    }

    this.saveToHistory();
  }

  private resetPoints(): void {
    this.points = { knee: null, pedal: null, bb: null };
    this.stepIndex = 0;
    this.offsetMm = null;
    this.judgementMessage = '';
    this.judgementStatus = null;
    this.calibrationNote = '';
    this.errorMessage = '';
  }

  resetAll(): void {
    this.photoDataUrl = null;
    this.loupeVisible = false;
    this.resetPoints();
  }
}
