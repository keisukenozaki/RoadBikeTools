import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

interface ToolCard {
  path: string;
  name: string;
  description: string;
  ready: boolean;
}

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home {
  readonly tools: ToolCard[] = [
    {
      path: '/saddle-height',
      name: 'サドル高計算',
      description: '股下長とクランク長から、サドルの適正な高さを計算します。膝角度による微調整や、計算履歴の保存にも対応。',
      ready: true,
    },
    {
      path: '/kops',
      name: 'サドル前後位置（KOPS法）',
      description: '写真の3点をタップして、サドルの前後位置のズレを計算します。',
      ready: true,
    },
    {
      path: '/tire-pressure',
      name: 'タイヤ空気圧計算',
      description: '体重・タイヤ幅・路面状況から、前後輪それぞれの適正な空気圧を計算します。',
      ready: true,
    },
    {
      path: '/formulas',
      name: '計算式について',
      description: 'このアプリで使っている計算式が、誰によって・いつごろ生まれたものなのかをまとめました。',
      ready: true,
    },
  ];
}
