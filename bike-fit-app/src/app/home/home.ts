import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

interface ToolCard {
  path: string;
  name: string;
  description: string;
  ready: boolean;
}

interface ToolCategory {
  label: string;
  tools: ToolCard[];
}

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home {
  readonly toolCategories: ToolCategory[] = [
    {
      label: '体に合わせる（フィッティング）',
      tools: [
        {
          path: '/saddle-height',
          name: 'サドル高計算',
          description:
            '股下長とクランク長から、サドルの適正な高さを計算します。膝角度による微調整や、計算履歴の保存にも対応。',
          ready: true,
        },
        {
          path: '/kops',
          name: 'サドル前後位置（KOPS法）',
          description: '写真の3点をタップして、サドルの前後位置のズレを計算します。',
          ready: true,
        },
        {
          path: '/reach-drop',
          name: 'ハンドル・ステム（リーチ・ドロップ）',
          description: '身長・胴・腕の長さと乗り方のスタイルから、リーチとドロップの目安を範囲で計算します。',
          ready: true,
        },
      ],
    },
    {
      label: '機材をセッティングする',
      tools: [
        {
          path: '/tire-pressure',
          name: 'タイヤ空気圧計算',
          description: '体重・タイヤ幅・路面状況から、前後輪それぞれの適正な空気圧を計算します。',
          ready: true,
        },
      ],
    },
    {
      label: 'パフォーマンスを試す',
      tools: [
        {
          path: '/hillclimb',
          name: 'ヒルクライム タイム予測',
          description: '体重・出力・坂の距離と標高差から、登坂タイムとVAM（登坂速度）を計算します。',
          ready: true,
        },
      ],
    },
  ];
}
